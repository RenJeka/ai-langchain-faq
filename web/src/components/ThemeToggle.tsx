import { TEXTS } from "../constants/texts";

interface ThemeToggleProps {
  theme: string;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <nav style={{ marginBottom: "1rem" }}>
      <ul></ul>
      <ul>
        <li>
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={theme === "dark"}
              onChange={onToggle}
            />
            {theme === "light" ? TEXTS.themeDark : TEXTS.themeLight}
          </label>
        </li>
      </ul>
    </nav>
  );
}
