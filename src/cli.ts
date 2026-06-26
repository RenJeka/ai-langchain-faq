/**
 * CLI — найпростіший спосіб «відчути» workflow.
 * Будуємо vector store один раз, потім у циклі читаємо питання з терміналу.
 *
 * Запуск:  npm run cli
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { buildRetriever, createRagChain, ask } from "./rag.js";

async function main() {
  console.log(
    "Будую базу знань (індексація)... перший запуск завантажить модель embeddings (~30 МБ).",
  );
  const retriever = await buildRetriever();
  const chain = await createRagChain(retriever);

  console.log("Готово! Став питання (порожній рядок або Ctrl+C — вихід).\n");

  const rl = createInterface({ input, output });
  while (true) {
    const question = (await rl.question("Питання: ")).trim();
    if (!question) break;

    const result = await ask(chain, question);
    console.log("\nВідповідь:", result.answer, "\n");
  }
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
