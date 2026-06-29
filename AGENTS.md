# About AI assistant

Цей проєкт — навчальний **RAG-бот на LangChain.js**: парсить корпоративний PDF (`strategiya-2026-2028.pdf`), зберігає вектори у Chroma (Docker), відповідає через Gemini.
Локальні embeddings (`multilingual-e5-small`, офлайн) + Gemini для генерації відповіді.
Документація українською; код і коментарі — теж українською.

## Команди

```bash
npm install                  # залежності бекенду (корінь)
npm install --prefix web     # залежності фронтенду (окремий package.json)
cp .env.example .env         # вписати GOOGLE_API_KEY (єдиний обовʼязковий ключ)

docker compose up -d         # підняти Chroma (:8000) і docling-serve (:5002)
npm run ingest               # PDF→MD→чанки→embeddings→Chroma (один раз або при оновленні PDF)

npm run cli                  # CLI: питання прямо в терміналі
npm run server               # Express API на :3000 (POST /api/ask)
npm run web                  # Vite + React UI на :5173 (проксує /api → :3000)
```

- **Тестів, лінтера й білд-кроку для `src/` немає.** TypeScript виконується напряму через `tsx` — компіляція не потрібна. `tsconfig.json` існує лише для перевірки типів IDE (`noEmit`-стиль, `include: ["src"]`).
- Білд є тільки у фронтенді: `npm --prefix web run build` (Vite).
- Сервер і CLI потрібно запускати в **окремих терміналах**; UI без запущеного `server` отримає помилку fetch.

## Архітектура

Логіка RAG розділена на два шари:
- **`src/rag.ts`** — підключення до Chroma, `createRagChain`, `ask`. Ядро для CLI/сервера.
- **`src/ingest.ts`** — одноразовий скрипт: PDF→MD (docling) → `chunkMarkdown` → E5 embeddings → Chroma.
- **`src/embeddings.ts`** — `E5Embeddings` (обгортка з префіксами `passage:`/`query:`).
- **`src/chunking.ts`** — markdown-aware чанкінг, зберігає таблиці цілісно.

Дві фази RAG:
1. **Ingestion** (`npm run ingest`, один раз): `data/strategiya-2026-2028.pdf` → docling-serve → Markdown → markdown-aware чанки → E5 embeddings → **Chroma** (Docker, персистентна).
2. **Запит** (`createRagChain` + `ask`, на кожне питання): питання → similarity search у Chroma → top-K чанків → `{context}` промпту → Gemini → відповідь.

Потік: `src/{cli,server}.ts` → `src/rag.ts` → Chroma (:8000) + embeddings (локально) + Gemini (хмара).
Детальний розбір — у `docs/WORKFLOW.md`.

### Дві незалежні моделі
Модель **пошуку** (embeddings, `Xenova/multilingual-e5-small`, 384-вим., локально/безкоштовно) і модель **відповіді** (LLM, `gemini-3.1-flash-lite`, задається `CHAT_MODEL` у `src/constants.ts`) — окремі компоненти. Embeddings для чанків і для питання **мусять бути одна й та сама модель**. E5 вимагає префіксів: `passage:` при індексації, `query:` при пошуку — інакше вектори несумісні.

## Конвенції та підводні камені

- **ESM-проєкт** (`"type": "module"`). Імпорти локальних модулів пишуться з розширенням **`.js`**, хоча файли — `.ts` (напр. `import { ask } from "./rag.js"`). Інакше рантайм не знайде модуль.
- **Уся конфігурація централізована** у `src/constants.ts` (модель, температура, `CHUNK_SIZE`/`CHUNK_OVERLAP`, `RETRIEVER_K`, порт, шляхи, таймаути docling) і `src/prompts.ts` (`SYSTEM_PROMPT`). Змінювати поведінку/моделі/чанкінг — там, а не в `rag.ts`.
- **`.npmrc` має `legacy-peer-deps=true`** — навмисно, через опційні peer-конфлікти LangChain-інтеграцій. Не прибирати.
- **Chroma (Docker)**: `docker compose up -d` запускає два контейнери — `chromadb/chroma:0.5.23` (:8000) і `quay.io/docling-project/docling-serve:latest` (хост-порт :5002 → контейнер :5001). Дані зберігаються у `.chroma/` (git-ignored). Щоб перебудувати індекс — `npm run ingest`. docling потрібен **лише** під час ingest; для запитів достатньо Chroma.
- **`web/` має `"ai-langchain-faq": "file:.."`** у залежностях, але `App.tsx` фактично спілкується з бекендом лише через `fetch("/api/ask")` — RAG-логіку не імпортує.
- **`data/faq.md`** — артефакт попередньої (in-memory) версії, наразі не використовується. Джерело правди — `data/strategiya-2026-2028.pdf` → колекція `strategiya` у Chroma.
- Системний промпт жорстко тримає бота в межах контексту (`temperature: 0`): немає відповіді в чанках → бот має сказати «не знаю», а не вигадувати.
