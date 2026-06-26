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
  console.log("Підключаюся до векторної БД...");
  let retriever;
  try {
    retriever = await buildRetriever();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const chain = await createRagChain(retriever);

  console.log("Готово! Став питання про Стратегію розвитку 2026–2028 (порожній рядок або Ctrl+C — вихід).\n");

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
