import type { LevelResultScreenProps } from "../src/LevelResultScreen.tsx";

export const resultProps = (props: Partial<LevelResultScreenProps> = {}): LevelResultScreenProps => ({
  presentation: "dig-site", language: "en", score: 7, total: 10, best: 7, beaten: 6,
  celebration: "new-best", hero: "/src/assets/dinos/tyrannosaurus/body.webp", level: "explorer",
  onLevel: () => {}, onPlayAgain: () => {}, onHome: () => {}, ...props
});
