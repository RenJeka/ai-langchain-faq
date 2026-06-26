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

const PORT = 3000;

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
    res.status(500).json({ error: "Внутрішня помилка сервера." });
  }
});

async function main() {
  console.log("Будую базу знань (індексація)...");
  const retriever = await buildRetriever();
  chain = await createRagChain(retriever);

  app.listen(PORT, () => {
    console.log(`API готовий: http://localhost:${PORT}  (POST /api/ask)`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
