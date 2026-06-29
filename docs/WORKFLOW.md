# Як працює застосунок (workflow)

Цей документ пояснює **процеси та взаємодію компонентів**: як дані проходять через
систему під час індексації й під час запиту, і як це мапиться на код.

- Складові частини, **глосарій понять** (embedding, retriever, RAG-ланцюг тощо) і
  моделі — в [`ARCHITECTURE.md`](ARCHITECTURE.md) (зокрема
  [складові частини](ARCHITECTURE.md#2-складові-частини) і
  [ключові поняття](ARCHITECTURE.md#4-ключові-поняття-глосарій)).
- Навіщо RAG, запуск, перевірка та конфігурація — у [`README`](../README.md).
- Карта файлів — у [`STRUCTURE.md`](STRUCTURE.md).

---

## 1. Огляд (high-level)

RAG складається з двох фаз — **окремих процесів**:

**Фаза 1 — Ingestion** (`npm run ingest`, вручну, один раз або при оновленні PDF):
```
data/strategiya-2026-2028.pdf
   → docling-serve (PDF→Markdown)
   → markdown-aware чанкінг (таблиці атомарно)
   → E5 embeddings (текст→вектор, passage:)
   → Chroma (персистентна колекція "strategiya")
```

**Фаза 2 — Запит** (на кожне питання):
```
питання → E5 embedding (query:) → similarity search у Chroma → top-K чанків
        → промпт із {context} → Gemini → відповідь
```

Gemini відповідає **тільки** на основі знайдених чанків (`temperature: 0`) — це
зменшує галюцинації й тримає бота в межах документа. Якщо відповіді в чанках немає —
бот має чесно сказати «не знаю».

Нижче — детальний розбір: спершу потік даних між компонентами, далі покроково кожна фаза.

---

## 2. Потік даних: хто з ким говорить

Фаза **запиту** (на кожне питання):

```
src/{cli,server}.ts
        │ викликають
        ▼
   src/rag.ts ──► E5 embeddings (локально, query:)
        │      ──► Chroma (:8000)  — similarity search
        │      ──► Gemini (хмара)  — генерація відповіді
        ▼
   { answer, context }   (context = чанки, на які спиралася відповідь)
```

Фаза **ingest** — окремий потік, що не перетинається із запитами:

```
src/ingest.ts ──► docling-serve (:5002) ──► Markdown
              ──► src/chunking.ts        ──► чанки
              ──► E5 embeddings (passage:)──► вектори
              ──► Chroma (:8000)         ──► колекція "strategiya"
```

**Усі три інтерфейси (CLI, server, web) викликають ті самі функції ядра `src/rag.ts`.**
UI не містить логіки RAG — лише збирає питання й показує відповідь.

---

## 3. Фаза 1 — Ingestion (`npm run ingest`, один раз)

Мета: перетворити PDF із таблицями на вектори у персистентній БД.

```
data/strategiya-2026-2028.pdf
   │  docling-serve (Docker)
   ▼
Markdown (з таблицями як | col | col |)
   │  src/chunking.ts
   ▼
Чанки (таблиці атомарно, текст — RecursiveCharacterTextSplitter)
   │  E5Embeddings ("passage: ...")
   ▼
Вектори 384-вим.
   │  Chroma.fromDocuments
   ▼
Chroma (Docker :8000, колекція "strategiya")
```

Покроково (скрипт `src/ingest.ts`):

1. **PDF → Markdown.** `docling-sdk` у API-режимі надсилає PDF до `docling-serve` (Docker, хост-порт :5002) і отримує Markdown. OCR вимкнено (`DOCLING_DO_OCR=false`) — документ має текстовий шар. Результат кешується у `data/strategiya-2026-2028.md` — повторний запуск пропускає цей крок. Деталі таймаутів docling — в [`ARCHITECTURE.md`](ARCHITECTURE.md#6-операційні-нюанси-docling-важливо-для-ingest).
2. **Markdown-aware чанкінг** (`src/chunking.ts`). Ділить на секції за заголовками. Таблиці (`| ... |`) тримає **атомарно** — не ріже рядки таблиці між чанками. Кожен чанк отримує metadata `{ section, type: "table"|"text", source }`.
3. **Embeddings.** `E5Embeddings` (`src/embeddings.ts`) додає префікс `passage: ` і рахує вектор через локальну `Xenova/multilingual-e5-small` (384 виміри, офлайн).
4. **Збереження у Chroma.** `Chroma.fromDocuments(...)` завантажує пари «вектор ↔ чанк» у Docker-контейнер з колекцією cosine-простору. Індекс **персистентний** — не перебудовується при кожному старті сервера.

> Перед першим запуском: `docker compose up -d` (Chroma + docling-serve), потім `npm run ingest`.

---

## 4. Фаза 2 — Запит (на кожне питання користувача)

Мета: за питанням знайти релевантні знання й дати моделі сформулювати відповідь
**лише на їх основі**.

```
Питання
   │  1. E5Embeddings("query: ...") — та сама локальна модель
   ▼
Вектор питання
   │  2. similarity search у Chroma (cosine)
   ▼
Top-K чанків (k=4)
   │  3. підстановка у промпт як {context}
   ▼
Промпт: «Відповідай ЛИШЕ з контексту: {context}\n\nПитання: {input}»
   │  4. виклик LLM
   ▼
Gemini (CHAT_MODEL)
   │  5. генерація
   ▼
Відповідь користувачу
```

Покроково (функції `createRagChain()` + `ask()` у `src/rag.ts`):

1. **Embedding питання.** Питання перетворюється на вектор тією ж моделлю, що й
   чанки — інакше вектори були б «несумісні».
2. **Similarity search.** Retriever шукає `RETRIEVER_K` (= 4) чанки, чиї вектори
   найближчі до вектора питання (близькі за змістом).
3. **Складання промпту.** `ChatPromptTemplate` + `createStuffDocumentsChain`
   «зашивають» знайдені чанки у `{context}` і питання у `{input}`. Системна
   інструкція прямо каже: *відповідай лише з контексту; якщо інформації немає —
   так і скажи, не вигадуй*.
4. **Виклик LLM.** `createRetrievalChain` поєднує retriever + цей промпт + Gemini
   в один `chain.invoke({ input: question })`.
5. **Відповідь.** Повертається `{ answer, context }`, де `context` — це самі
   чанки, на які спиралася модель (зручно показати для дебагу/демо).

Що означає «stuff» у `createStuffDocumentsChain`: це найпростіша стратегія —
**усі** знайдені чанки «напихаються» (stuff) в один промпт. Для маленького FAQ це
ідеально. Для великих обсягів існують інші стратегії (map-reduce, refine).

---

## 5. Як код мапиться на фази

| Крок workflow | Де в коді |
|---|---|
| PDF → Markdown (docling) + збереження у Chroma | `src/ingest.ts` (`npm run ingest`) |
| E5 embeddings з префіксами passage:/query: | `src/embeddings.ts` |
| Markdown-aware чанкінг (таблиці атомарно) | `src/chunking.ts` |
| Підключення до Chroma, retriever | `buildRetriever()` у `src/rag.ts` |
| Промпт + поєднання retriever і LLM | `createRagChain()` у `src/rag.ts` |
| Запит → відповідь | `ask()` у `src/rag.ts` |
| Термінальний цикл «питання-відповідь» | `src/cli.ts` |
| HTTP-ендпоінт `POST /api/ask` | `src/server.ts` |
| Форма вводу й показ відповіді | `web/src/App.tsx` |
| Docker: Chroma + docling-serve | `docker-compose.yml` |
