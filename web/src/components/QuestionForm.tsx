import { TEXTS } from "../constants/texts";

interface QuestionFormProps {
  question: string;
  setQuestion: (val: string) => void;
  loading: boolean;
  onAsk: () => void;
  onOpenExamples: () => void;
}

export function QuestionForm({ question, setQuestion, loading, onAsk, onOpenExamples }: QuestionFormProps) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAsk(); }}>
      <fieldset disabled={loading}>
        <label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span>{TEXTS.yourQuestion}</span>
            <button 
              type="button" 
              className="outline" 
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", width: "auto", margin: 0, border: "none" }}
              onClick={onOpenExamples}
            >
              {TEXTS.examplesBtn}
            </button>
          </div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onAsk();
              }
            }}
            rows={3}
            placeholder={TEXTS.placeholder}
          />
        </label>
      </fieldset>

      <button type="submit" aria-busy={loading}>
        {loading ? TEXTS.loading : TEXTS.askBtn}
      </button>
    </form>
  );
}
