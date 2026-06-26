import { TEXTS } from "../constants/texts";

interface AnswerCardProps {
  answer: string;
}

export function AnswerCard({ answer }: AnswerCardProps) {
  if (!answer) return null;

  return (
    <article style={{ marginTop: "2rem" }}>
      <header>{TEXTS.answerHeader}</header>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {answer}
      </div>
    </article>
  );
}
