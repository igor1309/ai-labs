import { AgeLevelSwitch, type AgeLevelSwitchProps } from "./AgeLevelSwitch.tsx";
import { ResultScreen, type ResultScreenProps } from "./ResultScreen.tsx";

export type SortResultScreenProps = Omit<ResultScreenProps, "levelSwitch"> & AgeLevelSwitchProps;

export function SortResultScreen({ level, onChoose, ...result }: SortResultScreenProps) {
  return <ResultScreen {...result} levelSwitch={<AgeLevelSwitch language={result.language} level={level} onChoose={onChoose} />} />;
}
