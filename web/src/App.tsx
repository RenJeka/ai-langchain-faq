import { useState, useEffect } from "react";
import { TEXTS } from "./constants/texts";
import { ThemeToggle } from "./components/ThemeToggle";
import { Header } from "./components/Header";
import { QuestionForm } from "./components/QuestionForm";
import { AnswerCard } from "./components/AnswerCard";
import { ExamplesModal } from "./components/ExamplesModal";

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
      setAnswer(data.answer ?? data.error ?? TEXTS.errorUnknown);
    } catch {
      setAnswer(TEXTS.errorApi);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 640, marginTop: "2rem", padding: "0 16px" }}>
      <ThemeToggle 
        theme={theme} 
        onToggle={() => setTheme(theme === "light" ? "dark" : "light")} 
      />
      
      <Header />

      <QuestionForm 
        question={question}
        setQuestion={setQuestion}
        loading={loading}
        onAsk={handleAsk}
        onOpenExamples={() => setIsModalOpen(true)}
      />

      <AnswerCard answer={answer} />

      <ExamplesModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={(q) => {
          setQuestion(q);
          setIsModalOpen(false);
        }}
      />
    </main>
  );
}


