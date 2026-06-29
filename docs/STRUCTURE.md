# Структура проєкту

Карта репозиторію у вигляді дерева. Призначення кожного компонента — у коментарях
праворуч. Детальніше про архітектуру й потік даних — у
[`ARCHITECTURE.md`](ARCHITECTURE.md) і [`WORKFLOW.md`](WORKFLOW.md).

```
ai-langchain-faq/
├── data/                            Дані та джерело правди
│   ├── strategiya-2026-2028.pdf     Корпоративний PDF — джерело правди для RAG
│   ├── strategiya-2026-2028.md      Кеш Markdown після docling (пропускає конвертацію)
│   └── faq.md                       Артефакт старої in-memory версії (не використовується)
│
├── src/                             Бекенд (TypeScript, виконується через tsx)
│   ├── constants.ts                 Уся конфігурація: моделі, чанкінг, порти, URL, таймаути
│   ├── prompts.ts                   SYSTEM_PROMPT (тримає бота в межах контексту)
│   ├── embeddings.ts                E5Embeddings (префікси passage:/query:) + getEmbeddings()
│   ├── chunking.ts                  Markdown-aware чанкінг (таблиці атомарно)
│   ├── ingest.ts                    Ingest: PDF → docling → чанки → E5 → Chroma
│   ├── rag.ts                       Ядро запиту: buildRetriever() + createRagChain() + ask()
│   ├── cli.ts                       Термінальний інтерфейс
│   └── server.ts                    Express API: POST /api/ask
│
├── web/                             Фронтенд (Vite + React, окремий package.json)
│   ├── src/
│   │   ├── components/              UI-компоненти
│   │   │   ├── AnswerCard.tsx       Картка відповіді бота
│   │   │   ├── ExamplesModal.tsx    Модалка з прикладами питань
│   │   │   ├── Header.tsx           Шапка застосунку
│   │   │   ├── QuestionForm.tsx     Форма вводу питання
│   │   │   └── ThemeToggle.tsx      Перемикач теми
│   │   ├── constants/
│   │   │   └── texts.ts             Тексти UI
│   │   ├── styles/
│   │   │   └── pico.min.css         Pico CSS
│   │   ├── App.tsx                  Корінь UI (спілкується з бекендом через fetch /api/ask)
│   │   └── main.tsx                 Точка входу React
│   ├── index.html
│   ├── vite.config.ts              Vite + проксі /api → :3000
│   ├── tsconfig.json
│   └── package.json
│
├── docs/                            Документація
│   ├── ARCHITECTURE.md              Структура, компоненти, інфраструктура, нюанси docling
│   ├── WORKFLOW.md                  Покроковий розбір RAG-потоку
│   ├── STRUCTURE.md                 Цей файл — карта репозиторію
│   └── plans/                       Плани реалізації (історичні)
│       └── 2026-06-26-vector-db-rag.md
│
├── docker-compose.yml               Chroma (:8000) + docling-serve (:5002 → :5001)
├── package.json                     Залежності й скрипти бекенду
├── tsconfig.json                    Перевірка типів IDE (без білду; tsx виконує напряму)
├── CLAUDE.md                        Інструкції для Claude Code
├── AGENTS.md                        Інструкції для AI-агентів (дзеркало CLAUDE.md)
└── README.md                        Опис проєкту, запуск, workflow
```

> Не показано (git-ignored): `node_modules/`, `.chroma/` (персистентні дані Chroma),
> `.env` (містить `GOOGLE_API_KEY`).
