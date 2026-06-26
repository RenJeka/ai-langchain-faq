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
  DOCLING_TIMEOUT_MS,
  DOCLING_DO_OCR,
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
  const client = new Docling({ api: { baseUrl: DOCLING_URL, timeout: DOCLING_TIMEOUT_MS } });
  const buffer = await readFile(dataPath(PDF_FILE_NAME));
  const result = await client.convert(buffer, PDF_FILE_NAME, {
    to_formats: ["md"],
    do_ocr: DOCLING_DO_OCR,
  });
  const markdown = result.document.md_content;
  if (!markdown) throw new Error("docling-serve не повернув Markdown-контент");

  await writeFile(cachePath, markdown, "utf-8");
  console.log(`Markdown збережено: ${MARKDOWN_CACHE_NAME}`);
  return markdown;
}

async function main(): Promise<void> {
  const markdown = await pdfToMarkdown();

  const docs = await chunkMarkdown(markdown, PDF_FILE_NAME);
  const tables = docs.filter((d) => d.metadata.type === "table").length;
  console.log(`Чанків: ${docs.length} (таблиці: ${tables}, текст: ${docs.length - tables})`);

  // Перестворюємо колекцію, щоб уникнути дублів при повторному запуску.
  const chromaClient = new ChromaClient({ path: CHROMA_URL });
  try {
    await chromaClient.deleteCollection({ name: CHROMA_COLLECTION });
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
