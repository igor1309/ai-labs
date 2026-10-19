import { LevelSwitch, type LevelSwitchProps } from "./LevelSwitch.tsx";
import { ResultScreen, type ResultScreenProps } from "./ResultScreen.tsx";

export type SortResultScreenProps = Omit<ResultScreenProps, "levelSwitch"> & LevelSwitchProps;

export function SortResultScreen({ level, onLevel, ...result }: SortResultScreenProps) {
  return <ResultScreen {...result} levelSwitch={<LevelSwitch language={result.language} level={level} onLevel={onLevel} />} />;
}
