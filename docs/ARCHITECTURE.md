# Архітектура проєкту

Цей документ описує **з чого складається застосунок**, як компоненти повʼязані,
де що лежить і які операційні нюанси треба знати (особливо щодо docling у Docker).

Якщо тобі потрібен **покроковий розбір RAG-потоку** (що таке embeddings, retriever,
як питання перетворюється на відповідь) — дивись [`WORKFLOW.md`](WORKFLOW.md).
Цей файл — про **структуру й інфраструктуру**.

---

## 1. Огляд однією картинкою

```
                         ┌────────────────── INGEST (один раз) ──────────────────┐
                         │                                                        │
 data/strategiya.pdf ──► docling-serve ──► Markdown ──► chunking ──► E5 ──► Chroma │
   (джерело правди)      (Docker :5002)    (.md кеш)   (чанки)    (вектори) (:8000)│
                         └────────────────────────────────────────────────┬───────┘
                                                                           │
                                                          персистентна колекція "strategiya"
                                                                           │
                         ┌────────────────── ЗАПИТ (на кожне питання) ─────┼───────┐
                         │                                                 ▼       │
   CLI / API / React ──► src/rag.ts (ядро) ──► retriever → Chroma similarity search│
                         │                  └► Gemini (хмара) ◄── {context} з чанків│
                         └────────────────────────────────────────────────────────┘
```

Два **повністю окремі процеси**:
- **Ingest** (`npm run ingest`) — наповнює базу. Запускається вручну, один раз (або при оновленні PDF).
- **Запит** (`cli` / `server`) — читає вже наповнену базу. Нічого не індексує на старті.

---

## 2. Компоненти та їхня роль

| Компонент | Що це | Де живе | Роль |
|---|---|---|---|
| **docling-serve** | Парсер документів (НЕ мовна модель) | Docker, хост-порт `:5002` | PDF → структурований Markdown із таблицями |
| **E5 embeddings** | Модель векторизації `multilingual-e5-small` | Локально (transformers.js), офлайн | Текст → вектор із 384 чисел |
| **Chroma** | Векторна БД | Docker, `:8000`, дані в `.chroma/` | Зберігає вектори + чанки, робить similarity search |
| **Gemini 2.5 Flash-Lite** | LLM (генерація) | Хмара Google, `GOOGLE_API_KEY` | Пише відповідь на основі знайдених чанків |
| **LangChain.js** | Оркестрація | npm-пакети | Звʼязує retriever + промпт + LLM в один ланцюг |

> **Три різні «моделі», не плутати:**
> docling **парсить** PDF (нічого не «розуміє»), E5 **векторизує** текст для пошуку,
> Gemini **генерує** відповідь. У фазі ingest Gemini не бере участі; у фазі запиту
> docling не бере участі.

### Дві незалежні моделі (ключова ідея RAG)

Модель **пошуку** (E5, 384-вим., локальна) і модель **відповіді** (Gemini, хмара) —
окремі компоненти від різних провайдерів. Embeddings для чанків і для питання
**мусять бути одна й та сама модель**, інакше вектори несумісні. E5 ще й вимагає
префіксів: `passage:` при індексації, `query:` при пошуку (це робить `E5Embeddings`
у `src/embeddings.ts`).

---

## 3. Карта модулів (`src/`)

| Файл | Відповідальність |
|---|---|
| `constants.ts` | **Уся конфігурація**: моделі, температура, `CHUNK_SIZE`/`CHUNK_OVERLAP`, `RETRIEVER_K`, порти, URL, таймаути docling. Змінювати поведінку — тут. |
| `prompts.ts` | `SYSTEM_PROMPT` — інструкція Gemini «відповідай лише з контексту». |
| `embeddings.ts` | `E5Embeddings` — обгортка з префіксами `passage:`/`query:`; `getEmbeddings()`. |
| `chunking.ts` | Markdown-aware чанкінг: ділить за заголовками, таблиці тримає атомарно. |
| `ingest.ts` | Скрипт ingest: PDF → docling → Markdown (кеш) → чанки → E5 → Chroma. |
| `rag.ts` | **Ядро запиту**: `buildRetriever()`, `createRagChain()`, `ask()`. Спільне для всіх інтерфейсів. |
| `cli.ts` | Термінальний інтерфейс (цикл «питання → відповідь»). |
| `server.ts` | Express API: `POST /api/ask`. |
| `web/` | Vite + React UI. Спілкується з бекендом лише через `fetch("/api/ask")` — RAG-логіку не імпортує. |

**Усі три інтерфейси (CLI, server, web) викликають ті самі функції з `rag.ts`.**
UI не містить логіки RAG — лише збирає питання й показує відповідь.

---

## 4. Інфраструктура (Docker)

`docker compose up -d` піднімає **два контейнери**:

| Сервіс | Образ | Порт (хост → контейнер) | Призначення |
|---|---|---|---|
| `chroma` | `chromadb/chroma:0.5.23` | `8000 → 8000` | Векторна БД. Дані — у `./.chroma/` (git-ignored). |
| `docling-serve` | `quay.io/docling-project/docling-serve:latest` | `5002 → 5001` | PDF→Markdown. Потрібен **лише** під час `npm run ingest`. |

> **Чому docling на хост-порту 5002, а не 5001:** на macOS порт 5001 часто зайнятий
> системними/сторонніми сервісами (AirDrop, ControlCenter, AirDroid тощо). Усередині
> контейнера docling слухає `5001`, але назовні ми мапимо його на `5002`. Тому
> `DOCLING_URL` у `constants.ts` вказує на `http://localhost:5002`.

Конфігурація — у `docker-compose.yml` (корінь репозиторію).

---

## 5. Конфігурація та змінні середовища

- **Уся прикладна конфігурація** централізована в `src/constants.ts` і `src/prompts.ts`.
  Не розкидуй налаштування по `rag.ts`/`ingest.ts`.
- **Єдиний обовʼязковий секрет** — `GOOGLE_API_KEY` (у `.env`, скопіюй з `.env.example`).
  Embeddings локальні, тож другого ключа не треба.
- **Опційні env-перевизначення** (мають дефолти в `constants.ts`):
  `CHROMA_URL`, `DOCLING_URL`.

Ключові константи `constants.ts`:

| Константа | Значення | Сенс |
|---|---|---|
| `EMBEDDINGS_MODEL` | `Xenova/multilingual-e5-small` | модель пошуку (384-вим.) |
| `CHAT_MODEL` | `gemini-2.5-flash-lite` | модель відповіді |
| `CHAT_TEMPERATURE` | `0` | детерміновані відповіді, без фантазій |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `1000` / `150` | розмір чанка (E5 ~512 токенів) |
| `RETRIEVER_K` | `4` | скільки чанків діставати на питання |
| `CHROMA_COLLECTION` | `strategiya` | назва колекції у Chroma |
| `DOCLING_TIMEOUT_MS` | `900_000` | таймаут клієнта docling-sdk (15 хв) |
| `DOCLING_DO_OCR` | `false` | OCR вимкнено (PDF має текстовий шар) |

---

## 6. Операційні нюанси docling (важливо для ingest)

Конвертація PDF — найкрихкіший крок. Три речі, які треба знати:

1. **docling-serve потрібен лише для ingest.** Для запитів (`cli`/`server`) він не
   потрібен — достатньо Chroma. Можна навіть зупинити контейнер docling після ingest.

2. **OCR вимкнено навмисно** (`DOCLING_DO_OCR = false`). Документ born-digital — має
   текстовий шар. OCR на CPU лише сповільнює конвертацію в рази й видає попередження
   `RapidOCR returned empty result!`. Якщо колись завантажиш **скан** (без текстового
   шару) — поверни `DOCLING_DO_OCR = true`.

3. **Таймаути.** Конвертація на CPU триває ~2 хвилини. Тут аж два рівні таймаутів:
   - **клієнтський** (`DOCLING_TIMEOUT_MS` у `constants.ts`) — піднятий до 15 хв,
     бо дефолт docling-sdk закороткий;
   - **серверний sync-wait** самого docling-serve — дефолт `120с` повертав `504`
     ще до завершення. Піднятий до `600с` через env `DOCLING_SERVE_MAX_SYNC_WAIT`
     у `docker-compose.yml`.

### Шпаргалка діагностики ingest

| Симптом | Причина | Що робити |
|---|---|---|
| `<no response> [TimeoutError]` на `:5002` | docling-контейнер не стартував | `docker compose ps` — перевір статус; `docker compose up -d docling-serve` |
| `bind: address already in use` (5002) | порт зайнятий іншим процесом | `lsof -nP -iTCP:5002 -sTCP:LISTEN`; зміни хост-порт у compose + `DOCLING_URL` |
| HTTP `504` від docling, конвертація «зависла» | `max_sync_wait` < часу конвертації | підняти `DOCLING_SERVE_MAX_SYNC_WAIT` у compose, `docker compose up -d docling-serve` |
| `Колекція "strategiya" порожня` при запиті | ingest не виконувався | `npm run ingest` |

Перевірити health docling: `curl -s http://localhost:5002/health` → `{"status":"ok"}`.
Перевірити наповнення Chroma — кількість векторів у колекції `strategiya`
(після успішного ingest їх ~250).

---

## 7. Потік даних: хто з ким говорить

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

Ingest — окремий потік, що не перетинається із запитами:

```
src/ingest.ts ──► docling-serve (:5002) ──► Markdown
              ──► src/chunking.ts        ──► чанки
              ──► E5 embeddings (passage:)──► вектори
              ──► Chroma (:8000)         ──► колекція "strategiya"
```

---

## 8. Угоди проєкту (підводні камені)

- **ESM-проєкт** (`"type": "module"`). Локальні імпорти — з розширенням **`.js`**,
  хоча файли `.ts` (напр. `import { ask } from "./rag.js"`). Інакше рантайм не знайде модуль.
- **Немає білд-кроку для `src/`.** TypeScript виконується напряму через `tsx`.
  `tsconfig.json` — лише для перевірки типів IDE. Білд є тільки у `web/` (Vite).
- **`.npmrc` має `legacy-peer-deps=true`** — навмисно, через peer-конфлікти
  LangChain-інтеграцій. Не прибирати.
- **`server` і `cli` запускають в окремих терміналах.** UI без запущеного `server`
  отримає помилку fetch.
- **`web/` має `"ai-langchain-faq": "file:.."`** у залежностях, але фактично
  спілкується з бекендом лише через `fetch("/api/ask")`.
- `data/faq.md` — артефакт попередньої (in-memory) версії, наразі **не використовується**.
  Джерело правди — `data/strategiya-2026-2028.pdf` → колекція `strategiya` у Chroma.
