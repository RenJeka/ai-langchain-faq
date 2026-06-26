# Vector DB RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести навчальний RAG із in-memory FAQ на продакшен-наближену архітектуру: PDF-джерело з таблицями → docling → markdown-aware чанки → багатомовні E5-embeddings → персистентна Chroma.

**Architecture:** Окремий скрипт `npm run ingest` парсить PDF через `docling-serve` (Docker), ріже markdown із збереженням таблиць, рахує E5-embeddings локально та завантажує у Chroma (Docker). Сервер/CLI на старті лише підключаються до готової колекції.

**Tech Stack:** LangChain.js, `@huggingface/transformers` (E5), `docling-sdk` + `docling-serve`, `chromadb` + `@langchain/community/vectorstores/chroma`, Gemini, Docker Compose, TypeScript/tsx.

## Global Constraints

- **ESM-проєкт** (`"type": "module"`): локальні імпорти — з розширенням `.js`, хоча файли `.ts` (напр. `import { getEmbeddings } from "./embeddings.js"`).
- **Без тестового фреймворку**: верифікація кожної задачі — запуск реального скрипта/команди й спостереження виводу (узгоджено з CLAUDE.md). Не додавати jest/vitest.
- **Уся конфігурація — у `src/constants.ts`** (моделі, чанкінг, URL, колекція) і `src/prompts.ts`. Не «зашивати» значення в логіку.
- **E5 потребує префіксів**: `passage: ` для документів, `query: ` для питань. Без них — деградація пошуку.
- **`.npmrc` має `legacy-peer-deps=true`** — лишити.
- Embeddings для чанків і для питання — **одна й та сама модель**.
- Код і коментарі — українською.
- **Точки звірки версій/портів (НЕ вгадувати як факт):** клієнт `chromadb` має відповідати лінійці серверного образу та `@langchain/community@0.3.x` (не 3.x); внутрішній порт контейнера `docling-serve` підтвердити через `docker compose logs`. У відповідних задачах є кроки перевірки.

---

### Task 1: Docker-інфраструктура (Chroma + docling-serve)

**Files:**
- Create: `docker-compose.yml`
- Modify: `.gitignore` (додати `.chroma/` та `data/strategiya-2026-2028.md`)

**Interfaces:**
- Produces: запущені сервіси `chroma` на `http://localhost:8000` і `docling-serve` на `http://localhost:5001`.

- [ ] **Step 1: Створити `docker-compose.yml`**

```yaml
services:
  chroma:
    image: chromadb/chroma:0.5.23
    ports:
      - "8000:8000"
    volumes:
      - ./.chroma:/chroma/chroma
    restart: unless-stopped

  docling-serve:
    image: quay.io/docling-project/docling-serve:latest
    ports:
      - "5001:5001"
    restart: unless-stopped
```

- [ ] **Step 2: Підняти сервіси**

Run: `docker compose up -d`
Expected: два контейнери у стані `Up`/`healthy` (`docker compose ps`).

- [ ] **Step 3: Перевірити Chroma heartbeat**

Run: `curl -s http://localhost:8000/api/v1/heartbeat`
Expected: JSON виду `{"nanosecond heartbeat": ...}`. Якщо 404 — звірити версію API образу (`/api/v2/heartbeat`) і зафіксувати робочий шлях.

- [ ] **Step 4: Підтвердити порт docling-serve**

Run: `docker compose logs docling-serve | grep -i "running\|listening\|uvicorn"` та `curl -s http://localhost:5001/docs -o /dev/null -w "%{http_code}\n"`
Expected: `200`. Якщо ні — подивитися в логах фактичний внутрішній порт і виправити маппінг `ports:` у `docker-compose.yml`, потім `docker compose up -d`.

- [ ] **Step 5: Додати ігнори у `.gitignore`**

```
.chroma/
data/strategiya-2026-2028.md
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .gitignore
git commit -m "feat(infra): add Chroma + docling-serve docker-compose"
```

---

### Task 2: Залежності та конфігурація

**Files:**
- Modify: `package.json` (deps + скрипт `ingest`)
- Modify: `src/constants.ts`

**Interfaces:**
- Produces: константи `EMBEDDINGS_MODEL`, `CHUNK_SIZE`, `CHUNK_OVERLAP`, `RETRIEVER_K`, `DATA_DIR`, `PDF_FILE_NAME`, `MARKDOWN_CACHE_NAME`, `CHROMA_URL`, `CHROMA_COLLECTION`, `DOCLING_URL`, `SERVER_PORT`.

- [ ] **Step 1: Встановити залежності**

Run:
```bash
npm install docling-sdk
npm install chromadb@^1.10.5
```
Expected: успішна інсталяція. **Перевірка сумісності:** `chromadb` має бути 1.x (під `@langchain/community@0.3.x`), а не 3.x. Якщо `Chroma.fromDocuments` згодом (Task 5) кине помилку протоколу — вирівняти версію клієнта `chromadb` і тег образу `chromadb/chroma` (Task 1) в одну лінійку.

- [ ] **Step 2: Додати скрипт у `package.json`**

У секцію `"scripts"` додати:
```json
"ingest": "tsx src/ingest.ts"
```

- [ ] **Step 3: Переписати `src/constants.ts`**

```ts
export const EMBEDDINGS_MODEL = "Xenova/multilingual-e5-small";

export const CHAT_MODEL = "gemini-2.5-flash-lite";
export const CHAT_TEMPERATURE = 0;

// E5 обрізає вхід на ~512 токенів — тримаємо чанки помірними.
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;
export const RETRIEVER_K = 4;

export const SERVER_PORT = 3000;

export const DATA_DIR = "data";
export const PDF_FILE_NAME = "strategiya-2026-2028.pdf";
export const MARKDOWN_CACHE_NAME = "strategiya-2026-2028.md";

export const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";
export const CHROMA_COLLECTION = "strategiya";
export const DOCLING_URL = process.env.DOCLING_URL ?? "http://localhost:5001";
```

- [ ] **Step 4: Перевірити типи**

Run: `npx tsc --noEmit`
Expected: помилки лише про ще-неіснуючі імпорти у `rag.ts` (їх приберемо в Task 6). Помилок у `constants.ts` бути не має.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/constants.ts
git commit -m "feat(config): switch to e5 embeddings, add Chroma/docling/ingest config"
```

---

### Task 3: E5-обгортка embeddings

**Files:**
- Create: `src/embeddings.ts`

**Interfaces:**
- Consumes: `EMBEDDINGS_MODEL` із `constants.ts`.
- Produces: `class E5Embeddings extends HuggingFaceTransformersEmbeddings`; `function getEmbeddings(): E5Embeddings`.

- [ ] **Step 1: Створити `src/embeddings.ts`**

```ts
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { EMBEDDINGS_MODEL } from "./constants.js";

/**
 * E5-моделі (intfloat/multilingual-e5) вимагають префіксів:
 *   - "passage: " — для індексованих документів,
 *   - "query: "   — для пошукового запиту.
 * Без них вектори запиту й документів погано співставляються.
 * Базовий клас робить mean-pooling + L2-нормалізацію — лишаємо як є.
 */
export class E5Embeddings extends HuggingFaceTransformersEmbeddings {
  embedDocuments(texts: string[]): Promise<number[][]> {
    return super.embedDocuments(texts.map((t) => `passage: ${t}`));
  }

  embedQuery(text: string): Promise<number[]> {
    return super.embedQuery(`query: ${text}`);
  }
}

export function getEmbeddings(): E5Embeddings {
  return new E5Embeddings({ model: EMBEDDINGS_MODEL });
}
```

- [ ] **Step 2: Перевірити вимір вектора (smoke-run)**

Run:
```bash
npx tsx -e "import('./src/embeddings.ts').then(async m => { const e = m.getEmbeddings(); const v = await e.embedQuery('тест'); console.log('dim =', v.length); })"
```
Expected: перший запуск завантажує модель (~кілька десятків МБ), далі `dim = 384`.

- [ ] **Step 3: Commit**

```bash
git add src/embeddings.ts
git commit -m "feat(embeddings): add E5 wrapper with query/passage prefixes"
```

---

### Task 4: Markdown-aware чанкінг

**Files:**
- Create: `src/chunking.ts`

**Interfaces:**
- Consumes: `CHUNK_SIZE`, `CHUNK_OVERLAP` із `constants.ts`.
- Produces: `async function chunkMarkdown(markdown: string, source: string): Promise<Document[]>`. Кожен `Document.metadata` має `{ source: string, section: string, type: "table" | "text" }`.

- [ ] **Step 1: Створити `src/chunking.ts`**

```ts
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CHUNK_SIZE, CHUNK_OVERLAP } from "./constants.js";

const isHeading = (l: string) => /^#{1,6}\s/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);

interface Block {
  type: "text" | "table";
  text: string;
}

/** Розбиває рядки секції на послідовні блоки тексту й таблиць. */
function partitionBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buf: string[] = [];
  let mode: "text" | "table" = "text";
  const flush = () => {
    if (buf.join("").trim()) blocks.push({ type: mode, text: buf.join("\n") });
    buf = [];
  };
  for (const line of lines) {
    const t: "text" | "table" = isTableRow(line) ? "table" : "text";
    if (t !== mode) {
      flush();
      mode = t;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

/**
 * Таблицю тримаємо атомарно. Якщо вона більша за ліміт — ріжемо по рядках,
 * повторюючи у кожному чанку заголовок секції + рядок-шапку таблиці (+ розділювач).
 */
function splitTable(table: string, heading: string): string[] {
  const rows = table.split("\n").filter((r) => r.trim());
  const prefix = heading ? `## ${heading}\n\n` : "";
  const full = prefix + rows.join("\n");
  if (full.length <= CHUNK_SIZE) return [full];

  const header = rows.slice(0, 2); // шапка + рядок "|---|---|"
  const body = rows.slice(2);
  const baseSize = prefix.length + header.join("\n").length;

  const chunks: string[] = [];
  let group: string[] = [];
  let size = baseSize;
  for (const row of body) {
    if (size + row.length > CHUNK_SIZE && group.length) {
      chunks.push(prefix + [...header, ...group].join("\n"));
      group = [];
      size = baseSize;
    }
    group.push(row);
    size += row.length + 1;
  }
  if (group.length) chunks.push(prefix + [...header, ...group].join("\n"));
  return chunks;
}

export async function chunkMarkdown(markdown: string, source: string): Promise<Document[]> {
  // 1) Поділ на секції за заголовками.
  const sections: { heading: string; lines: string[] }[] = [];
  let current = { heading: "", lines: [] as string[] };
  for (const line of markdown.split("\n")) {
    if (isHeading(line)) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: line.replace(/^#{1,6}\s/, "").trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.length) sections.push(current);

  // 2) У межах секції — окремо текст, окремо таблиці.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const docs: Document[] = [];

  for (const section of sections) {
    for (const block of partitionBlocks(section.lines)) {
      if (block.type === "table") {
        for (const chunk of splitTable(block.text, section.heading)) {
          docs.push(
            new Document({
              pageContent: chunk,
              metadata: { source, section: section.heading, type: "table" },
            }),
          );
        }
      } else {
        const prefix = section.heading ? `## ${section.heading}\n\n` : "";
        for (const piece of await splitter.splitText(block.text.trim())) {
          if (!piece.trim()) continue;
          docs.push(
            new Document({
              pageContent: prefix + piece,
              metadata: { source, section: section.heading, type: "text" },
            }),
          );
        }
      }
    }
  }
  return docs;
}
```

- [ ] **Step 2: Перевірити на синтетичному markdown із таблицею**

Run:
```bash
npx tsx -e "import('./src/chunking.ts').then(async m => { const md = '# Розділ\n\nТекст абзацу.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'; const d = await m.chunkMarkdown(md, 'test'); console.log(JSON.stringify(d.map(x => ({type: x.metadata.type, section: x.metadata.section, head: x.pageContent.slice(0,40)})), null, 2)); })"
```
Expected: щонайменше два документи — один `type:"text"`, один `type:"table"`; чанк таблиці містить рядок `| A | B |` цілісно (не розрізаний).

- [ ] **Step 3: Commit**

```bash
git add src/chunking.ts
git commit -m "feat(chunking): markdown-aware splitter that keeps tables intact"
```

---

### Task 5: Скрипт індексації (ingest)

**Files:**
- Create: `src/ingest.ts`

**Interfaces:**
- Consumes: `getEmbeddings` (`embeddings.ts`), `chunkMarkdown` (`chunking.ts`), константи `DATA_DIR`, `PDF_FILE_NAME`, `MARKDOWN_CACHE_NAME`, `DOCLING_URL`, `CHROMA_URL`, `CHROMA_COLLECTION`.
- Produces: заповнену колекцію `strategiya` у Chroma; кеш `data/strategiya-2026-2028.md`.

- [ ] **Step 1: Створити `src/ingest.ts`**

```ts
import "dotenv/config";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Docling } from "docling-sdk";
import { ChromaClient } from "chromadb";
import { Chroma } from "@langchain/community/vectorstores/chroma";

import { getEmbeddings } from "./embeddings.js";
import { chunkMarkdown } from "./chunking.js";
import {
  DATA_DIR,
  PDF_FILE_NAME,
  MARKDOWN_CACHE_NAME,
  DOCLING_URL,
  CHROMA_URL,
  CHROMA_COLLECTION,
} from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = (name: string) => join(__dirname, "..", DATA_DIR, name);

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** PDF → Markdown через docling-serve. Кешує результат, щоб повторні запуски не парсили заново. */
async function pdfToMarkdown(): Promise<string> {
  const cachePath = dataPath(MARKDOWN_CACHE_NAME);
  if (await fileExists(cachePath)) {
    console.log(`Знайдено кеш Markdown: ${MARKDOWN_CACHE_NAME}`);
    return readFile(cachePath, "utf-8");
  }

  console.log("Конвертую PDF через docling-serve (це може зайняти час)...");
  const client = new Docling({ api: { baseUrl: DOCLING_URL } });
  const buffer = await readFile(dataPath(PDF_FILE_NAME));
  const result = await client.convert(buffer, PDF_FILE_NAME, { to_formats: ["md"] });
  const markdown = result.document.md_content;

  await writeFile(cachePath, markdown, "utf-8");
  console.log(`Markdown збережено: ${MARKDOWN_CACHE_NAME}`);
  return markdown;
}

async function main(): Promise<void> {
  const markdown = await pdfToMarkdown();

  const docs = await chunkMarkdown(markdown, PDF_FILE_NAME);
  const tables = docs.filter((d) => d.metadata.type === "table").length;
  console.log(`Чанків: ${docs.length} (таблиці: ${tables}, текст: ${docs.length - tables})`);

  // Пересоздаємо колекцію, щоб уникнути дублів при повторному запуску.
  const client = new ChromaClient({ path: CHROMA_URL });
  try {
    await client.deleteCollection({ name: CHROMA_COLLECTION });
    console.log(`Стару колекцію "${CHROMA_COLLECTION}" видалено.`);
  } catch {
    // Колекції ще не було — нормально.
  }

  await Chroma.fromDocuments(docs, getEmbeddings(), {
    collectionName: CHROMA_COLLECTION,
    url: CHROMA_URL,
    collectionMetadata: { "hnsw:space": "cosine" },
  });

  console.log(`Готово. Колекцію "${CHROMA_COLLECTION}" заповнено у Chroma.`);
}

main().catch((err) => {
  console.error("Помилка індексації:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Звірити API клієнта `chromadb` з установленою версією**

Перед запуском підтвердити конструктор: у `chromadb` 1.x — `new ChromaClient({ path: CHROMA_URL })`. Якщо встановлено іншу лінійку і конструктор інший — привести у відповідність (і узгодити з Task 2, Step 1). Перевірити можна: `npm ls chromadb`.

- [ ] **Step 3: Запустити індексацію**

Run: `npm run ingest`
Expected: лог `Конвертую PDF...` → `Markdown збережено` → `Чанків: N (таблиці: T, текст: ...)` з `T > 0` → `Готово...`. Без винятків.

- [ ] **Step 4: Перевірити цілісність таблиць у кеші вручну**

Прочитати `data/strategiya-2026-2028.md` і впевнитися, що таблиці збереглися як markdown-сітки (`| ... | ... |` з рядком `|---|`), а не сплющені в суцільний текст.

- [ ] **Step 5: Перевірити, що колекція непорожня**

Run: `curl -s http://localhost:8000/api/v1/collections`
Expected: у відповіді присутня колекція `strategiya`. (Якщо шлях API інший — використати підтверджений у Task 1, Step 3.)

- [ ] **Step 6: Commit**

```bash
git add src/ingest.ts
git commit -m "feat(ingest): PDF->markdown via docling, chunk, embed into Chroma"
```

---

### Task 6: Підключення retriever до Chroma

**Files:**
- Modify: `src/rag.ts`

**Interfaces:**
- Consumes: `getEmbeddings` (`embeddings.ts`), `CHROMA_URL`, `CHROMA_COLLECTION`, `RETRIEVER_K`.
- Produces: `buildRetriever()` тепер підключається до наявної колекції (не індексує); реекспорт `getEmbeddings`; `createRagChain`/`ask` без зміни сигнатур.

- [ ] **Step 1: Замінити верхні імпорти та `getEmbeddings`/`buildRetriever` у `src/rag.ts`**

Прибрати імпорти `readFile`, `HuggingFaceTransformersEmbeddings`, `RecursiveCharacterTextSplitter`, `MemoryVectorStore`, а також `FAQ_DATA_DIR`/`FAQ_FILE_NAME`/`CHUNK_*`. Додати:

```ts
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { getEmbeddings } from "./embeddings.js";
import {
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  RETRIEVER_K,
  CHROMA_URL,
  CHROMA_COLLECTION,
} from "./constants.js";

export { getEmbeddings };
```

Замінити стару `getEmbeddings` і `buildRetriever` на:

```ts
/**
 * ФАЗА 1 — Підключення до індексу.
 * На відміну від попередньої версії, нічого не індексує на старті:
 * приєднується до колекції Chroma, яку наповнив `npm run ingest`.
 */
export async function buildRetriever() {
  const store = new Chroma(getEmbeddings(), {
    collectionName: CHROMA_COLLECTION,
    url: CHROMA_URL,
  });

  const collection = await store.ensureCollection();
  if ((await collection.count()) === 0) {
    throw new Error(
      `Колекція "${CHROMA_COLLECTION}" порожня. Спершу проіндексуй базу знань: npm run ingest`,
    );
  }

  // k: RETRIEVER_K — скільки найрелевантніших чанків повертати на кожне питання.
  return store.asRetriever({ k: RETRIEVER_K });
}
```

`createRagChain`, `ask` та `RagChain`/`Retriever` типи лишити без змін.

- [ ] **Step 2: Звірити API wrapper'а**

Підтвердити, що у встановленій версії `@langchain/community` метод `ensureCollection()` повертає chromadb-колекцію з `.count()`. Якщо ні — замінити перевірку порожнечі на `await store.similaritySearch("тест", 1)` у `try/catch` із тим самим повідомленням про `npm run ingest`.

- [ ] **Step 3: Перевірити типи**

Run: `npx tsc --noEmit`
Expected: без помилок.

- [ ] **Step 4: Smoke-перевірка retriever**

Run:
```bash
npx tsx -e "import('./src/rag.ts').then(async m => { const r = await m.buildRetriever(); const docs = await r.invoke('Які цілі стратегії?'); console.log('знайдено чанків:', docs.length); console.log(docs[0]?.pageContent.slice(0,120)); })"
```
Expected: `знайдено чанків: 4` (= `RETRIEVER_K`) і релевантний фрагмент українською.

- [ ] **Step 5: Commit**

```bash
git add src/rag.ts
git commit -m "feat(rag): connect retriever to persistent Chroma collection"
```

---

### Task 7: Дружні помилки в CLI/сервері + системний промпт

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/server.ts`
- Modify: `src/prompts.ts`

**Interfaces:**
- Consumes: `buildRetriever` (кидає помилку «порожня колекція»).
- Produces: CLI/сервер при відсутньому індексі друкують підказку `npm run ingest`; оновлений `SYSTEM_PROMPT`.

- [ ] **Step 1: Оновити `src/prompts.ts`**

Скоригувати `SYSTEM_PROMPT` під нову базу знань, зберігши grounded-поведінку:

```ts
export const SYSTEM_PROMPT = `Ти — асистент, що відповідає на питання щодо документа «Стратегія розвитку 2026–2028».
Відповідай українською, спираючись ВИКЛЮЧНО на наведений контекст.
Якщо у контексті містяться таблиці — читай їх уважно й цитуй конкретні значення.
Якщо відповіді в контексті немає — чесно скажи, що не маєш цієї інформації, і не вигадуй.

Контекст:
{context}`;
```

(Зберегти наявні плейсхолдери промпту, які очікує ланцюг — узгодити `{context}` з поточним шаблоном у `rag.ts`.)

- [ ] **Step 2: Обгорнути старт у `src/cli.ts` та `src/server.ts`**

У місці виклику `buildRetriever()` додати обробку помилки порожнього індексу, напр.:

```ts
try {
  retriever = await buildRetriever();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
```

(Адаптувати до фактичної структури кожного файлу — у `server.ts` це в bootstrap до `app.listen`, у `cli.ts` — до циклу читання питань.)

- [ ] **Step 3: Перевірити негативний сценарій (порожня колекція)**

Run (тимчасово видаливши колекцію): `curl -s -X DELETE http://localhost:8000/api/v1/collections/strategiya` потім `npm run cli`
Expected: повідомлення «Колекція ... порожня. Спершу проіндексуй ... npm run ingest» і вихід без стектрейсу. Після перевірки повернути індекс: `npm run ingest`.

- [ ] **Step 4: Перевірити позитивний сценарій сервера**

Run: `npm run server` (окремий термінал), потім
```bash
curl -s -X POST http://localhost:3000/api/ask -H "Content-Type: application/json" -d '{"question":"Які пріоритети визначені у стратегії?"}'
```
Expected: JSON із відповіддю українською по суті документа.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/server.ts src/prompts.ts
git commit -m "feat(ux): friendly empty-index errors, strategy-aware system prompt"
```

---

### Task 8: Документація та env

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Modify: `docs/WORKFLOW.md`
- Modify: `README.md` (якщо є)

**Interfaces:**
- Produces: актуальна документація нового пайплайну (docker → ingest → server/cli).

- [ ] **Step 1: Доповнити `.env.example`**

```
GOOGLE_API_KEY=

# Опційно (є дефолти у constants.ts):
# CHROMA_URL=http://localhost:8000
# DOCLING_URL=http://localhost:5001
```

- [ ] **Step 2: Оновити документацію скілом**

Викликати скіл `update-docs`: оновити `CLAUDE.md` (нові команди `docker compose up -d`, `npm run ingest`; нова архітектура: docling → Chroma → E5; нові файли `embeddings.ts`, `chunking.ts`, `ingest.ts`, `docker-compose.yml`) і `docs/WORKFLOW.md` (дві фази тепер розділені: ingest офлайн, запит онлайн).

- [ ] **Step 3: Фінальна наскрізна перевірка (clean run)**

```bash
docker compose down && docker compose up -d
rm -f data/strategiya-2026-2028.md
npm run ingest
npm run server   # окремий термінал
# питання по таблиці:
curl -s -X POST http://localhost:3000/api/ask -H "Content-Type: application/json" -d '{"question":"<питання, відповідь на яке у таблиці документа>"}'
# питання поза документом → бот має сказати, що не має інформації
curl -s -X POST http://localhost:3000/api/ask -H "Content-Type: application/json" -d '{"question":"Який прогноз погоди на завтра?"}'
```
Expected: відповідь по таблиці коректна й `context` містить чанк `type:"table"`; на питання поза документом — «не маю цієї інформації». Перезапуск сервера НЕ перебудовує індекс.

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md docs/WORKFLOW.md README.md
git commit -m "docs: document docker + ingest + Chroma RAG pipeline"
```

---

## Self-Review

**Spec coverage** (проти design-плану `mutable-knitting-ullman.md`):
- PDF→Markdown зі збереженням таблиць → Task 1 (docling-serve), Task 5 (виклик convert).
- multilingual-e5-small (384) + префікси → Task 2 (модель), Task 3 (префікси).
- Chroma персистентна → Task 1 (Docker+volume), Task 5 (наповнення), Task 6 (підключення).
- Окремий ingest → Task 5; сервер/CLI лише читають → Task 6, Task 7.
- Markdown-aware чанкінг із цілісними таблицями → Task 4.
- Grounded-промпт «не знаю» → Task 7.

**Точки невизначеності, винесені у кроки-перевірки (а не вгадані):** версія/конструктор `chromadb` (Task 2 Step 1, Task 5 Step 2), шлях API Chroma (Task 1 Step 3), внутрішній порт docling-serve (Task 1 Step 4), наявність `ensureCollection().count()` у встановленій версії wrapper'а (Task 6 Step 2). Кожна має конкретну команду перевірки й fallback.

**Placeholder scan:** без «TBD/TODO» — увесь код наведено повністю.
