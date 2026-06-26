import { useState } from "react";

export function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

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
    <main
      style={{
        maxWidth: 640,
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "system-ui, sans-serif",
        color: "#1a1a1a",
      }}
    >
      <h1>LangChain FAQ</h1>
      <p style={{ color: "#666" }}>
        Постав питання про Lumio — відповідь будується через RAG (пошук схожих
        чанків + Gemini).
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAsk();
        }}
        rows={3}
        placeholder="Напр.: Як скинути пароль?"
        style={{ width: "100%", padding: 8, fontSize: 16, boxSizing: "border-box" }}
      />

      <button
        onClick={handleAsk}
        disabled={loading}
        style={{ marginTop: 8, padding: "8px 16px", fontSize: 16, cursor: "pointer" }}
      >
        {loading ? "Думаю..." : "Запитати"}
      </button>

      {answer && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: "#f5f5f5",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {answer}
        </div>
      )}
    </main>
  );
}
