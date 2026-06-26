import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import type { PretrainedOptions } from "@huggingface/transformers";
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
  return new E5Embeddings({
    model: EMBEDDINGS_MODEL,
    // fp32 — це поточний дефолт transformers.js на CPU; вказуємо явно лише щоб
    // прибрати warning "dtype not specified". Вектори не змінюються — переіндексація
    // не потрібна. (Типи @langchain звужують pretrainedOptions, тож каст.)
    pretrainedOptions: { dtype: "fp32" } as unknown as PretrainedOptions,
  });
}
