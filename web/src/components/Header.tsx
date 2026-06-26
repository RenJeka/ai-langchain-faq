import { TEXTS } from "../constants/texts";

export function Header() {
  return (
    <hgroup>
      <h1>{TEXTS.title}</h1>
      <p>{TEXTS.description}</p>
    </hgroup>
  );
}
