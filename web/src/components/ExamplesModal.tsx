import { TEXTS } from "../constants/texts";

interface ExamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (question: string) => void;
}

export function ExamplesModal({ isOpen, onClose, onSelect }: ExamplesModalProps) {
  return (
    <dialog open={isOpen}>
      <article>
        <header>
          <button 
            aria-label="Close" 
            rel="prev" 
            onClick={onClose}
          ></button>
          <strong>{TEXTS.modalTitle}</strong>
        </header>
        <div style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "1rem" }}>
          <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
            {TEXTS.examples.map((q, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                <a 
                  href="#" 
                  className="secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    onSelect(q);
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
  );
}
