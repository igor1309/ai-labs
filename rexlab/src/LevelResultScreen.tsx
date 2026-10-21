import { LevelSwitch, type LevelSwitchProps } from "./LevelSwitch.tsx";
import { ResultScreen, type ResultScreenProps } from "./ResultScreen.tsx";

export type LevelResultScreenProps = Omit<ResultScreenProps, "levelSwitch"> & LevelSwitchProps;

// The result of a round of a game with levels: the result, with the level
// switch above PLAY AGAIN.
export function LevelResultScreen({ level, onLevel, ...result }: LevelResultScreenProps) {
  return <ResultScreen {...result} levelSwitch={<LevelSwitch language={result.language} level={level} onLevel={onLevel} />} />;
}
