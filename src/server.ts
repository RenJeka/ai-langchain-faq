/**
 * Express API. Будуємо vector store + RAG-ланцюг ОДИН раз на старті й тримаємо
 * у памʼяті. React UI звертається до POST /api/ask.
 *
 * Запуск:  npm run server
 */
import "dotenv/config";
import express from "express";
import cors from "cors";

import { buildRetriever, createRagChain, ask, type RagChain } from "./rag.js";
import { SERVER_PORT } from "./constants.js";

const PORT = SERVER_PORT;

const app = express();
app.use(cors());
app.use(express.json());

let chain: RagChain;

app.post("/api/ask", async (req, res) => {
  const question = req.body?.question;
  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "Поле 'question' обовʼязкове." });
  }
  try {
    const result = await ask(chain, question);
    res.json({ answer: result.answer });
  } catch (err) {
    console.error(err);
    // Gemini періодично віддає 503 (перевантажений) або 429 (ліміт) — це тимчасово
    // й не наша помилка. Повертаємо зрозуміле повідомлення, а не сухий 500.
    const status = (err as { status?: number })?.status;
    if (status === 503 || status === 429) {
      return res.status(503).json({
        error: "Модель Gemini зараз перевантажена. Спробуйте, будь ласка, ще раз за кілька секунд.",
      });
    }
    res.status(500).json({ error: "Внутрішня помилка сервера." });
  }
});

async function main() {
  console.log("Підключаюся до векторної БД...");
  let retriever;
  try {
    retriever = await buildRetriever();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  chain = await createRagChain(retriever);

  app.listen(PORT, () => {
    console.log(`API готовий: http://localhost:${PORT}  (POST /api/ask)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
