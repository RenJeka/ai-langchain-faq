import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CHUNK_SIZE, CHUNK_OVERLAP } from "./constants.js";

const isHeading = (l: string) => /^#{1,6}\s/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);

interface Block {
  type: "text" | "table";
  text: string;
}

/** Розбиває рядки секції на послідовні блоки тексту й таблиць. */
function partitionBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buf: string[] = [];
  let mode: "text" | "table" = "text";
  const flush = () => {
    if (buf.join("").trim()) blocks.push({ type: mode, text: buf.join("\n") });
    buf = [];
  };
  for (const line of lines) {
    const t: "text" | "table" = isTableRow(line) ? "table" : "text";
    if (t !== mode) {
      flush();
      mode = t;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

/**
 * Таблицю тримаємо атомарно. Якщо вона більша за ліміт — ріжемо по рядках,
 * повторюючи у кожному чанку заголовок секції + рядок-шапку таблиці (+ розділювач).
 */
function splitTable(table: string, heading: string): string[] {
  const rows = table.split("\n").filter((r) => r.trim());
  const prefix = heading ? `## ${heading}\n\n` : "";
  const full = prefix + rows.join("\n");
  if (full.length <= CHUNK_SIZE) return [full];

  const header = rows.slice(0, 2); // шапка + рядок "|---|---|"
  const body = rows.slice(2);
  const baseSize = prefix.length + header.join("\n").length;

  const chunks: string[] = [];
  let group: string[] = [];
  let size = baseSize;
  for (const row of body) {
    if (size + row.length > CHUNK_SIZE && group.length) {
      chunks.push(prefix + [...header, ...group].join("\n"));
      group = [];
      size = baseSize;
    }
    group.push(row);
    size += row.length + 1;
  }
  if (group.length) chunks.push(prefix + [...header, ...group].join("\n"));
  return chunks;
}

export async function chunkMarkdown(markdown: string, source: string): Promise<Document[]> {
  // 1) Поділ на секції за заголовками.
  const sections: { heading: string; lines: string[] }[] = [];
  let current = { heading: "", lines: [] as string[] };
  for (const line of markdown.split("\n")) {
    if (isHeading(line)) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: line.replace(/^#{1,6}\s/, "").trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.length) sections.push(current);

  // 2) У межах секції — окремо текст, окремо таблиці.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const docs: Document[] = [];

  for (const section of sections) {
    for (const block of partitionBlocks(section.lines)) {
      if (block.type === "table") {
        for (const chunk of splitTable(block.text, section.heading)) {
          docs.push(
            new Document({
              pageContent: chunk,
              metadata: { source, section: section.heading, type: "table" },
            }),
          );
        }
      } else {
        const prefix = section.heading ? `## ${section.heading}\n\n` : "";
        for (const piece of await splitter.splitText(block.text.trim())) {
          if (!piece.trim()) continue;
          docs.push(
            new Document({
              pageContent: prefix + piece,
              metadata: { source, section: section.heading, type: "text" },
            }),
          );
        }
      }
    }
  }
  return docs;
}
