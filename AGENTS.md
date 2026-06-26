# About AI assistant

Цей проєкт — навчальний **FAQ-бот на LangChain.js** з RAG (Retrieval-Augmented Generation).
Локальні embeddings (transformers.js, офлайн) + Gemini для генерації відповіді.
Документація українською; код і коментарі — теж українською.

## Команди

```bash
npm install                  # залежності бекенду (корінь)
npm install --prefix web     # залежності фронтенду (окремий package.json)
cp .env.example .env         # вписати GOOGLE_API_KEY (єдиний потрібний ключ)

npm run cli                  # CLI: питання прямо в терміналі
npm run server               # Express API на :3000 (POST /api/ask)
npm run web                  # Vite + React UI на :5173 (проксує /api → :3000)
```

- **Тестів, лінтера й білд-кроку для `src/` немає.** TypeScript виконується напряму через `tsx` — компіляція не потрібна. `tsconfig.json` існує лише для перевірки типів IDE (`noEmit`-стиль, `include: ["src"]`).
- Білд є тільки у фронтенді: `npm --prefix web run build` (Vite).
- Сервер і CLI потрібно запускати в **окремих терміналах**; UI без запущеного `server` отримає помилку fetch.

## Архітектура

Уся логіка RAG зосереджена в **`src/rag.ts`** — це єдине ядро. CLI, Express-сервер і React UI лише викликають його функції (UI — через HTTP). Жодного дублювання логіки в інтерфейсах.

Дві фази RAG:
1. **Індексація** (`buildRetriever`, один раз на старті): `data/faq.md` → `RecursiveCharacterTextSplitter` (чанки) → локальні embeddings → `MemoryVectorStore` → retriever.
2. **Запит** (`createRagChain` + `ask`, на кожне питання): питання → similarity search → top-K чанків у `{context}` промпту → Gemini → відповідь.

Потік: `src/{cli,server}.ts` → `src/rag.ts` → embeddings (локально) + Gemini (хмара).
Детальний розбір — у `docs/WORKFLOW.md`.

### Дві незалежні моделі
Модель **пошуку** (embeddings, `Xenova/all-MiniLM-L6-v2`, локально/безкоштовно) і модель **відповіді** (LLM, `gemini-2.5-flash-lite`) — окремі компоненти від різних провайдерів. LangChain абстрагує обидві, тож заміна — зазвичай один рядок. Embeddings для чанків і для питання **мусять бути одна й та сама модель**, інакше вектори несумісні.

## Конвенції та підводні камені

- **ESM-проєкт** (`"type": "module"`). Імпорти локальних модулів пишуться з розширенням **`.js`**, хоча файли — `.ts` (напр. `import { ask } from "./rag.js"`). Інакше рантайм не знайде модуль.
- **Уся конфігурація централізована** у `src/constants.ts` (модель, температура, `CHUNK_SIZE`/`CHUNK_OVERLAP`, `RETRIEVER_K`, порт, шляхи) і `src/prompts.ts` (`SYSTEM_PROMPT`). Змінювати поведінку/моделі/чанкінг — там, а не в `rag.ts`.
- **`.npmrc` має `legacy-peer-deps=true`** — навмисно, через опційні peer-конфлікти LangChain-інтеграцій. Не прибирати.
- **In-memory vector store**: індекс перебудовується при кожному старті, не персиститься. Це свідомий вибір для навчального проєкту.
- **`web/` має `"ai-langchain-faq": "file:.."`** у залежностях, але `App.tsx` фактично спілкується з бекендом лише через `fetch("/api/ask")` — RAG-логіку не імпортує.
- Системний промпт жорстко тримає бота в межах контексту (`temperature: 0`): немає відповіді в чанках → бот має сказати «не знаю», а не вигадувати.
