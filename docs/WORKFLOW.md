# Документація: як працює застосунок (workflow)

Цей документ детально пояснює, **як влаштований FAQ-бот** на LangChain.js, що таке
RAG, і як кожен рядок коду відповідає кроку в загальній схемі. Він призначений
насамперед для розуміння — щоб ти бачив повну картину роботи застосунку.

> Структуру проєкту, інфраструктуру (Docker, порти) та операційні нюанси docling
> описано окремо в [`ARCHITECTURE.md`](ARCHITECTURE.md). Цей файл — про **RAG-потік**.

---

## 1. Контекст і мета

Це мінімальний навчальний проєкт, який демонструє **RAG (Retrieval-Augmented
Generation)** — підхід, коли мовна модель (LLM) відповідає не «з голови», а на
основі знайдених у твоїй базі знань фрагментів тексту.

Навіщо RAG, а не просто запит до LLM:
- **Актуальність** — модель знає лише те, на чому її навчили. RAG дає їй свіжі/
  приватні дані (твій FAQ, документацію, базу).
- **Менше галюцинацій** — модель відповідає в межах наданого контексту.
- **Контроль** — ти керуєш джерелом правди (PDF `data/strategiya-2026-2028.pdf`), а не «вірою» моделі.

Стек:
- **Мова:** TypeScript
- **Оркестрація:** LangChain.js
- **Embeddings (векторизація):** `Xenova/multilingual-e5-small` локально — **безкоштовно, без API-ключа**
- **Vector DB:** Chroma (Docker, персистентна)
- **PDF-парсер:** docling-serve (Docker), зберігає таблиці у Markdown
- **LLM (генерація відповіді):** **Google Gemini** (`@langchain/google-genai`); конкретна модель — у `CHAT_MODEL` (`src/constants.ts`), зараз `gemini-3.1-flash-lite`
- **Інтерфейси:** CLI, Express API, React UI — усі поверх одного ядра `src/rag.ts`

> Важлива ідея: модель для **пошуку** (embeddings) і модель для **відповіді** (LLM)
> — це різні, незалежні компоненти. Тут вони навіть від різних «провайдерів»
> (локальна embeddings-модель + хмарний Gemini). LangChain дає єдиний інтерфейс,
> щоб їх поєднати, і будь-який з них можна замінити, не чіпаючи решту.

---

## 2. Ключові поняття (глосарій)

| Термін | Що це |
|---|---|
| **Embedding** | Вектор (масив чисел, напр. 384 значення), що кодує *зміст* тексту. Схожі за змістом тексти мають близькі вектори. |
| **Chunk (чанк)** | Невеликий шматок вихідного тексту. Документ ріжуть на чанки, бо в контекст моделі не можна (і не варто) пхати все одразу. |
| **Vector store** | Сховище векторів із можливістю пошуку «знайди найсхожіші». Тут — **Chroma** (Docker, персистентна). |
| **Similarity search** | Пошук за змістом: беремо вектор питання й шукаємо найближчі вектори чанків (косинусна близькість). |
| **Retriever** | Обгортка над vector store, що на вхід приймає текст питання, а на вихід дає K найрелевантніших чанків. |
| **LLM** | Велика мовна модель, що генерує текст відповіді (тут — Gemini). |
| **RAG chain** | Ланцюг, який звʼязує retriever + промпт + LLM в один виклик. |
| **Prompt template** | Шаблон інструкції для моделі з «дірками» (`{context}`, `{input}`), куди підставляються дані. |

---

## 3. Архітектура та компоненти

```
[npm run ingest] ──► docling-serve (Docker :5002) ──► Markdown з таблицями
                                                           │
                                               markdown-aware chunking
                                                           │
                                    E5 embeddings ("passage: ") локально
                                                           │
                                                    Chroma (Docker :8000)
                                                           ▲
┌──────────────────────────────────────────────────────────────┐
│                     Інтерфейси (UI-шар)                        │
│   CLI (src/cli.ts)   Express (src/server.ts)   React (web/)    │
└───────────────┬───────────────┬──────────────────┬────────────┘
                │               │                  │ HTTP /api/ask
                └───────────────┴──────────────────┘
                                │ викликають
                                ▼
                ┌───────────────────────────────────┐
                │        Ядро RAG (src/rag.ts)        │
                │  buildRetriever() / createRagChain()│
                │              / ask()                │
                └───────┬───────────────────┬─────────┘
                        │                   │
              E5 embeddings ("query: ")   Gemini (CHAT_MODEL)
             (transformers.js, офлайн)    (хмара, GOOGLE_API_KEY)
```

Пакети, які робить роботу:

| Пакет | Роль у проєкті |
|---|---|
| `@langchain/google-genai` | `ChatGoogleGenerativeAI` — виклик Gemini |
| `@langchain/community` + `@huggingface/transformers` | `HuggingFaceTransformersEmbeddings` — локальні embeddings |
| `@langchain/community` + `chromadb` | `Chroma` vectorstore — підключення до Chroma (Docker) |
| `langchain` | `createStuffDocumentsChain`, `createRetrievalChain` — RAG-ланцюг |
| `@langchain/textsplitters` | `RecursiveCharacterTextSplitter` — розбиття тексту на чанки |
| `docling-sdk` | клієнт до `docling-serve` (PDF → Markdown) — лише в `ingest.ts` |
| `@langchain/core` | `ChatPromptTemplate` та базові типи |
| `express`, `cors` | HTTP-сервер для UI |

---

## 4. Фаза 1 — Ingestion (`npm run ingest`, один раз)

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

## 5. Фаза 2 — Запит (на кожне питання користувача)

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

## 6. Як код мапиться на фази

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

Важливо: **усі три інтерфейси викликають ті самі функції ядра.** UI не містить
жодної логіки RAG — лише збирає питання й показує відповідь. Це і є сенс винесення
логіки в `src/rag.ts`.

---

## 7. Конфігурація моделей

**LLM (генерація відповіді)** — `createRagChain()` бере параметри з `src/constants.ts`:
```ts
new ChatGoogleGenerativeAI({
  model: CHAT_MODEL,          // зараз "gemini-3.1-flash-lite" (constants.ts)
  temperature: CHAT_TEMPERATURE, // 0 = детерміновані, передбачувані відповіді
});
```
Замінити модель — це один рядок `CHAT_MODEL` у `constants.ts` (легша/потужніша
модель Gemini). Ключ читається з `GOOGLE_API_KEY`. Якщо Gemini періодично віддає
`503 Service Unavailable` (перевантажений), `server.ts` повертає зрозуміле
повідомлення «спробуйте ще раз» — це тимчасово й не помилка коду.

**Embeddings (пошук)** — `E5Embeddings` у `src/embeddings.ts`:
```ts
// Xenova/multilingual-e5-small — 384 виміри, підтримує українську семантику
// Автоматично додає "passage: " (індексація) або "query: " (пошук)
// dtype: "fp32" вказано явно — лише щоб прибрати warning transformers.js
new E5Embeddings({ model: EMBEDDINGS_MODEL, pretrainedOptions: { dtype: "fp32" } });
```
Локальна, безкоштовна, офлайн. **Важливо:** E5-моделі вимагають префіксів — без них `passage:` / `query:` векторний простір деградує.

> Чому модель і embeddings незалежні: ти можеш узяти embeddings від одного
> постачальника, а LLM — від іншого. LangChain абстрагує і те, і те за спільним
> інтерфейсом, тож заміна — це зазвичай один рядок.

---

## 8. Поточні обмеження й куди розвивати

- **Stuff-стратегія** — усі чанки в один промпт; не масштабується на дуже великі бази.
- **Без історії діалогу** — кожне питання незалежне.
- **Без стрімінгу** — відповідь приходить цілком, а не «по словах».
- **Один документ** — Chroma-колекція зараз містить лише одну стратегію.

Куди розвивати (наступні кроки):
1. **Стрімінг відповіді** в UI (`chain.stream(...)`).
2. **Показ джерел** — виводити чанки з `result.context`, на які спиралася модель.
3. **Conversational retrieval** — памʼять діалогу для уточнювальних питань.
4. **Re-ranking** — переранжування чанків перед підстановкою у контекст.
5. **Кілька документів** — додати нові PDF через `npm run ingest` без перестворення колекції.

---

## 9. Запуск і перевірка

Встановлення та первинна індексація:
```bash
npm install
npm install --prefix web
cp .env.example .env          # вписати GOOGLE_API_KEY

docker compose up -d          # запустити Chroma (:8000) і docling-serve (:5002)
npm run ingest                # перший раз: PDF→MD→чанки→Chroma (займе кілька хвилин)
```

Три способи запуску (після `npm run ingest`):
```bash
npm run cli        # питання прямо в терміналі
npm run server     # Express API на :3000
npm run web        # React UI на :5173 (проксує /api на :3000)
```

Перевірка API напряму:
```bash
curl -X POST http://localhost:3000/api/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Які пріоритети стратегії?"}'
```

Як переконатися, що працює саме RAG (а не модель «з голови»):
- Постав питання, відповідь на яке є у стратегії → отримаєш точну відповідь.
- Постав питання поза темою (напр. «прогноз погоди») → бот має чесно сказати, що не знає.
- Тимчасово залогуй `result.context` у `ask()` — побачиш ті чанки (із metadata `type`), на яких ґрунтується відповідь.
