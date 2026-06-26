import { useState, useEffect } from "react";

const EXAMPLES = [
  "Що таке Lumio?",
  "Скільки коштує Lumio?",
  "Як скинути пароль?",
  "Чи працює Lumio офлайн?",
  "Як експортувати нотатки?",
  "Чи шифруються мої дані?",
  "Як видалити акаунт?",
  "Скільки пристроїв можна підключити?",
  "Які формати підтримує експорт?",
  "Скільки нотаток можна створити безкоштовно?",
  "Чи є наскрізне шифрування?",
  "Що буде після видалення акаунта?",
  "Як відновити пароль, якщо лист не прийшов?",
  "На яких платформах доступний Lumio?",
  "Скільки коштує тариф Pro на рік?"
];

export function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("light");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  async function handleAsk() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "Невідома помилка.");
    } catch {
      setAnswer("Не вдалося звʼязатися з API. Чи запущено сервер (npm run server)?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 640, marginTop: "2rem", padding: "0 16px" }}>
      <nav style={{ marginBottom: "1rem" }}>
        <ul></ul>
        <ul>
          <li>
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={theme === "dark"}
                onChange={() => setTheme(theme === "light" ? "dark" : "light")}
              />
              {theme === "light" ? "Темна тема" : "Світла тема"}
            </label>
          </li>
        </ul>
      </nav>

      <hgroup>
        <h1>LangChain FAQ</h1>
        <p>
          Постав питання про Lumio — відповідь будується через RAG (пошук схожих
          чанків + Gemini).
        </p>
      </hgroup>

      <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }}>
        <fieldset disabled={loading}>
          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span>Ваше питання</span>
              <button 
                type="button" 
                className="outline" 
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", width: "auto", margin: 0, border: "none" }}
                onClick={() => setIsModalOpen(true)}
              >
                Приклади питань
              </button>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              rows={3}
              placeholder="Напр.: Як скинути пароль?"
            />
          </label>
        </fieldset>

        <button type="submit" aria-busy={loading}>
          {loading ? "Думаю..." : "Запитати"}
        </button>
      </form>

      {answer && (
        <article style={{ marginTop: "2rem" }}>
          <header>Відповідь</header>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {answer}
          </div>
        </article>
      )}

      <dialog open={isModalOpen}>
        <article>
          <header>
            <button 
              aria-label="Close" 
              rel="prev" 
              onClick={() => setIsModalOpen(false)}
            ></button>
            <strong>Приклади питань</strong>
          </header>
          <div style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "1rem" }}>
            <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
              {EXAMPLES.map((q, i) => (
                <li key={i} style={{ marginBottom: "0.5rem" }}>
                  <a 
                    href="#" 
                    className="secondary"
                    onClick={(e) => {
                      e.preventDefault();
                      setQuestion(q);
                      setIsModalOpen(false);
                    }}
                  >
                    {q}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </dialog>
    </main>
  );
}

