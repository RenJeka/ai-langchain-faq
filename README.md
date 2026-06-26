# ai-langchain-faq

Мінімальний навчальний проєкт: **FAQ-бот на LangChain.js** з використанням
**embeddings + RAG** (Retrieval-Augmented Generation).

- **Відповідь генерує** Claude (`@langchain/anthropic`).
- **Векторизацію (embeddings)** рахуємо **локально й безкоштовно** через
  transformers.js — потрібен лише ключ Anthropic.
- Інтерфейси: **CLI**, **Express API** і **міні React UI**. Усі три користуються
  одним ядром — `src/rag.ts`.

> Anthropic не має власного embeddings-API. У RAG модель для пошуку й модель для
> відповіді — різні компоненти (часто від різних провайдерів). LangChain дає
> єдиний інтерфейс, щоб їх поєднати.

## Як це працює (workflow)

RAG складається з двох фаз:

**Фаза 1 — Індексація** (один раз при старті):
```
data/faq.md  →  розбиття на чанки  →  embeddings (текст→вектор)  →  vector store
                RecursiveCharacterTextSplitter   transformers.js      MemoryVectorStore
```

**Фаза 2 — Запит** (на кожне питання):
```
питання → embedding питання → пошук схожих чанків → промпт із контекстом → Claude → відповідь
                               (similarity search)
```

Claude відповідає **тільки** на основі знайдених чанків — це й зменшує
галюцинації, і тримає бота в межах FAQ.

## Запуск

### 1. Встановити залежності
```bash
npm install
npm install --prefix web
```

### 2. Додати ключ
```bash
cp .env.example .env
# відкрий .env і впиши свій ANTHROPIC_API_KEY
```

### 3. Запустити (один зі способів)

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
  -d '{"question":"Як скинути пароль?"}'
```

> Перший запуск завантажить локальну embedding-модель (~30 МБ) — це одноразово.

## Структура

```
data/faq.md       База знань (FAQ у Markdown)
src/rag.ts        Ядро RAG: buildRetriever() + createRagChain() + ask()
src/cli.ts        Термінальний інтерфейс
src/server.ts     Express: POST /api/ask
web/              Vite + React (міні UI)
```

## Куди розвивати далі

- Персистентний vector store (HNSWLib / Chroma / pgvector) замість in-memory.
- Стрімінг відповіді в UI (`.stream()`).
- Показ джерел/чанків, на які спирається відповідь.
- Історія діалогу (conversational retrieval).
