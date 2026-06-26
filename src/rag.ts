/**
 * Ядро RAG (Retrieval-Augmented Generation).
 *
 * Тут зосереджена вся логіка LangChain. І CLI, і Express-сервер користуються
 * цими ж функціями — UI лише викликає API. Дві фази:
 *
 *   1) Індексація  (buildRetriever):  faq.md → чанки → embeddings → vector store
 *   2) Запит       (ask):             питання → пошук схожих чанків → Claude
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ChatAnthropic } from "@langchain/anthropic";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAQ_PATH = join(__dirname, "..", "data", "faq.md");

/**
 * Модель embeddings — перетворює текст на вектор (масив чисел, що кодує зміст).
 * Працює ЛОКАЛЬНО через transformers.js: без API-ключа й без оплати.
 * Перший запуск завантажить модель (~30 МБ) і закешує її.
 */
export function getEmbeddings() {
  return new HuggingFaceTransformersEmbeddings({
    model: "Xenova/all-MiniLM-L6-v2",
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
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const docs = await splitter.createDocuments([raw]);

  const vectorStore = await MemoryVectorStore.fromDocuments(docs, getEmbeddings());

  // k: 3 — повертати 3 найрелевантніші чанки на кожне питання.
  return vectorStore.asRetriever({ k: 3 });
}

type Retriever = Awaited<ReturnType<typeof buildRetriever>>;

const SYSTEM_PROMPT = `Ти — помічник FAQ застосунку Lumio. Відповідай на питання
користувача, спираючись ВИКЛЮЧНО на наведений нижче контекст. Якщо у контексті
немає відповіді — чесно скажи, що не маєш цієї інформації, і не вигадуй.
Відповідай стисло й тією ж мовою, що й питання.

Контекст:
{context}`;

/**
 * Збирає RAG-ланцюг: retriever (пошук) + промпт + Claude (генерація).
 * createRetrievalChain автоматично: бере питання → отримує чанки з retriever →
 * підставляє їх у {context} → надсилає Claude → повертає відповідь.
 */
export async function createRagChain(retriever: Retriever) {
  const llm = new ChatAnthropic({
    // Haiku 4.5 — швидка й дешева модель, ідеальна для FAQ (простий, масовий Q&A).
    // Можна замінити на "claude-sonnet-4-6", якщо потрібні складніші відповіді.
    //
    // Важливо: ця версія @langchain/anthropic завжди надсилає temperature/top_p/
    // top_k у запиті, а моделі Opus 4.7/4.8 ці параметри відхиляють (HTTP 400).
    // Тому для Opus спершу онови @langchain/anthropic до версії, що підтримує
    // adaptive thinking без sampling-параметрів.
    model: "claude-haiku-4-5",
    temperature: 0, // детерміновані відповіді — добре для FAQ
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
