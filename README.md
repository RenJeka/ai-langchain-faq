# ai-langchain-faq

Навчальний проєкт: **RAG-бот на LangChain.js**, що відповідає на питання щодо
корпоративного PDF («Стратегія розвитку 2026–2028»).

- **Парсинг PDF** → Markdown через **docling-serve** (Docker).
- **Векторизація (embeddings)** — **локально й безкоштовно** через transformers.js
  (`multilingual-e5-small`, офлайн).
- **Векторна БД** — **Chroma** (Docker, персистентна).
- **Відповідь генерує** Gemini 2.5 Flash-Lite (`@langchain/google-genai`) — потрібен
  лише ключ Google AI.
- Інтерфейси: **CLI**, **Express API** і **міні React UI**. Усі три користуються
  одним ядром — `src/rag.ts`.

> Модель для пошуку (embeddings) і модель для відповіді — різні незалежні компоненти.
> Тут: локальні E5 embeddings + хмарний Gemini. LangChain дає єдиний інтерфейс, щоб
> їх поєднати — за потреби будь-яку модель легко поміняти, не чіпаючи решту коду.

## 📖 Документація

- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — структура проєкту, компоненти,
  карта модулів, інфраструктура (Docker, порти), конфігурація та **операційні нюанси
  docling** (таймаути, OCR, діагностика ingest).
- **[`docs/WORKFLOW.md`](docs/WORKFLOW.md)** — покроковий розбір RAG: що таке
  embeddings/retriever/RAG-ланцюг, дві фази, як код мапиться на схему.

## Як це працює (workflow)

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

## Запуск

### 1. Встановити залежності
```bash
npm install
npm install --prefix web
```

### 2. Додати ключ
```bash
cp .env.example .env
# відкрий .env і впиши свій GOOGLE_API_KEY (єдиний обовʼязковий ключ)
```

### 3. Підняти інфраструктуру та проіндексувати PDF
```bash
docker compose up -d   # Chroma (:8000) + docling-serve (:5002)
npm run ingest         # PDF→MD→чанки→embeddings→Chroma (займе ~2-3 хв; один раз)
```
> `npm run ingest` кешує Markdown у `data/strategiya-2026-2028.md` — повторний запуск
> пропускає конвертацію PDF. Щоб перебудувати індекс — запусти `npm run ingest` знову.

### 4. Запустити (один зі способів)

**CLI** — питання прямо в терміналі:
```bash
npm run cli
```

**API + React UI** — у двох окремих терміналах:
```bash
npm run server   # термінал 1: Express на http://localhost:3000
npm run web      # термінал 2: Vite на http://localhost:5173
```
Відкрий адресу, яку покаже Vite, і став питання у формі.

Перевірити API напряму:
```bash
curl -X POST http://localhost:3000/api/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Які пріоритети стратегії?"}'
```

> Перший запуск завантажить локальну embedding-модель (~30 МБ) — це одноразово.
> Для запитів (`cli`/`server`) потрібен лише контейнер Chroma; docling потрібен **тільки** під час ingest.

## Структура

```
data/strategiya-2026-2028.pdf   Джерело правди (корпоративний PDF)
src/constants.ts                Уся конфігурація (моделі, чанкінг, порти, таймаути)
src/prompts.ts                  SYSTEM_PROMPT (тримає бота в межах контексту)
src/ingest.ts                   Ingest: PDF → docling → чанки → E5 → Chroma
src/rag.ts                      Ядро запиту: buildRetriever() + createRagChain() + ask()
src/embeddings.ts               E5Embeddings (префікси passage:/query:)
src/chunking.ts                 Markdown-aware чанкінг (таблиці атомарно)
src/cli.ts                      Термінальний інтерфейс
src/server.ts                   Express: POST /api/ask
web/                            Vite + React (міні UI)
docker-compose.yml              Chroma + docling-serve
docs/                           ARCHITECTURE.md, WORKFLOW.md
```

## Куди розвивати далі

- Стрімінг відповіді в UI (`chain.stream()`).
- Показ джерел/чанків, на які спирається відповідь (`result.context`).
- Conversational retrieval — памʼять діалогу для уточнювальних питань.
- Re-ranking чанків перед підстановкою у контекст.
- Кілька документів в одній колекції Chroma.
