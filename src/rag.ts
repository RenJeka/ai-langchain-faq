/**
 * Ядро RAG (Retrieval-Augmented Generation).
 *
 * Тут зосереджена вся логіка LangChain. І CLI, і Express-сервер користуються
 * цими ж функціями — UI лише викликає API. Дві фази:
 *
 *   1) Індексація  (buildRetriever):  faq.md → чанки → embeddings → vector store
 *   2) Запит       (ask):             питання → пошук схожих чанків → Gemini
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

import {
  EMBEDDINGS_MODEL,
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  RETRIEVER_K,
  FAQ_DATA_DIR,
  FAQ_FILE_NAME,
} from "./constants.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAQ_PATH = join(__dirname, "..", FAQ_DATA_DIR, FAQ_FILE_NAME);

/**
 * Модель embeddings — перетворює текст на вектор (масив чисел, що кодує зміст).
 * Працює ЛОКАЛЬНО через transformers.js: без API-ключа й без оплати.
 * Перший запуск завантажить модель (~30 МБ) і закешує її.
 */
export function getEmbeddings() {
  return new HuggingFaceTransformersEmbeddings({
    model: EMBEDDINGS_MODEL,
  });
}

/**
 * ФАЗА 1 — Індексація.
 * Читає базу знань, ріже на чанки, рахує embeddings і складає у векторне
 * сховище в памʼяті. Повертає retriever — обʼєкт, що вміє шукати найсхожіші
 * чанки за змістом питання.
 */
export async function buildRetriever() {
  const raw = await readFile(FAQ_PATH, "utf-8");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const docs = await splitter.createDocuments([raw]);

  const vectorStore = await MemoryVectorStore.fromDocuments(docs, getEmbeddings());

  // k: RETRIEVER_K — скільки найрелевантніших чанків повертати на кожне питання.
  return vectorStore.asRetriever({ k: RETRIEVER_K });
}

type Retriever = Awaited<ReturnType<typeof buildRetriever>>;



/**
 * Збирає RAG-ланцюг: retriever (пошук) + промпт + Gemini (генерація).
 * createRetrievalChain автоматично: бере питання → отримує чанки з retriever →
 * підставляє їх у {context} → надсилає Gemini → повертає відповідь.
 */
export async function createRagChain(retriever: Retriever) {
  const llm = new ChatGoogleGenerativeAI({
    // Gemini 2.5 Flash-Lite — найшвидша й найдешевша модель Gemini, ідеальна
    // для FAQ (простий, масовий Q&A). Для складніших відповідей можна змінити
    // на "gemini-2.5-flash" або "gemini-2.5-pro".
    // Ключ береться з GOOGLE_API_KEY (див. .env.example).
    model: CHAT_MODEL,
    temperature: CHAT_TEMPERATURE, // детерміновані відповіді — добре для FAQ
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", "{input}"],
  ]);

  const combineDocsChain = await createStuffDocumentsChain({ llm, prompt });

  return createRetrievalChain({ retriever, combineDocsChain });
}

export type RagChain = Awaited<ReturnType<typeof createRagChain>>;

/**
 * ФАЗА 2 — Запит. Ставимо питання ланцюгу й отримуємо відповідь.
 * result.context містить чанки, які знайшов retriever (зручно для дебагу/демо).
 */
export async function ask(chain: RagChain, question: string) {
  const result = await chain.invoke({ input: question });
  return result as {
    answer: string;
    context: { pageContent: string }[];
  };
}
