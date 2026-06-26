/**
 * Ядро RAG (Retrieval-Augmented Generation).
 *
 * Тут зосереджена вся логіка LangChain. І CLI, і Express-сервер користуються
 * цими ж функціями — UI лише викликає API. Дві фази:
 *
 *   1) Підключення (buildRetriever): приєднується до Chroma-колекції, наповненої `npm run ingest`.
 *   2) Запит       (ask):           питання → пошук схожих чанків → Gemini
 */
import "dotenv/config";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

import {
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  RETRIEVER_K,
  CHROMA_URL,
  CHROMA_COLLECTION,
} from "./constants.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { getEmbeddings } from "./embeddings.js";

export { getEmbeddings };

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

type Retriever = Awaited<ReturnType<typeof buildRetriever>>;

/**
 * Збирає RAG-ланцюг: retriever (пошук) + промпт + Gemini (генерація).
 * createRetrievalChain автоматично: бере питання → отримує чанки з retriever →
 * підставляє їх у {context} → надсилає Gemini → повертає відповідь.
 */
export async function createRagChain(retriever: Retriever) {
  const llm = new ChatGoogleGenerativeAI({
    model: CHAT_MODEL,
    temperature: CHAT_TEMPERATURE,
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
