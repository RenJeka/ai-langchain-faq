# ai-langchain-faq

Мінімальний навчальний проєкт: **FAQ-бот на LangChain.js** з використанням
**embeddings + RAG** (Retrieval-Augmented Generation).

- **Відповідь генерує** Gemini 2.5 Flash-Lite (`@langchain/google-genai`).
- **Векторизацію (embeddings)** рахуємо **локально й безкоштовно** через
  transformers.js — потрібен лише ключ Google AI.
- Інтерфейси: **CLI**, **Express API** і **міні React UI**. Усі три користуються
  одним ядром — `src/rag.ts`.

> Модель для пошуку (embeddings) і модель для відповіді — різні компоненти, часто
> від різних провайдерів. Тут: локальні embeddings + Gemini для генерації.
> LangChain дає єдиний інтерфейс, щоб їх поєднати — за потреби модель легко
> поміняти, не чіпаючи решту коду.

## Як це працює (workflow)

RAG складається з двох фаз:

**Фаза 1 — Індексація** (один раз при старті):
```
data/faq.md  →  розбиття на чанки  →  embeddings (текст→вектор)  →  vector store
                RecursiveCharacterTextSplitter   transformers.js      MemoryVectorStore
```

**Фаза 2 — Запит** (на кожне питання):
```
питання → embedding питання → пошук схожих чанків → промпт із контекстом → Gemini → відповідь
                               (similarity search)
```

Gemini відповідає **тільки** на основі знайдених чанків — це й зменшує
галюцинації, і тримає бота в межах FAQ.

📖 **Детальний розбір роботи застосунку — у [`docs/WORKFLOW.md`](docs/WORKFLOW.md)**
(покрокові фази, що таке embeddings/retriever/RAG-ланцюг, як код мапиться на схему,
конфігурація моделей, обмеження й наступні кроки).

## Запуск

### 1. Встановити залежності
```bash
npm install
npm install --prefix web
```

### 2. Додати ключ
```bash
cp .env.example .env
# відкрий .env і впиши свій GOOGLE_API_KEY
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
