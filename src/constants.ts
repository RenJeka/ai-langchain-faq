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
export const DOCLING_URL = process.env.DOCLING_URL ?? "http://localhost:5002";
// Конвертація PDF на CPU може тривати хвилини — даємо клієнту запас (15 хв).
// Дефолтний таймаут docling-sdk закороткий і рве запит передчасно.
export const DOCLING_TIMEOUT_MS = 900_000;
// PDF born-digital (має текстовий шар) — OCR лише сповільнює і дає порожній результат.
export const DOCLING_DO_OCR = false;
