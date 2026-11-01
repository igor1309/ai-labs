import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";

// A run belongs to the level of its finished boards. Declines belong to
// the level played, rather than the next level the card offers.
export type LevelOffer = { level: AgeLevel | null; strong: number; declined: readonly AgeLevel[] };

export const NO_LEVEL_OFFER: LevelOffer = { level: null, strong: 0, declined: [] };

export function countBoard(state: LevelOffer, level: AgeLevel, strong: boolean): LevelOffer {
  return { ...state, level, strong: strong ? (state.level === level ? state.strong : 0) + 1 : 0 };
}

export function offeredLevel(state: LevelOffer): AgeLevel | undefined {
  if (state.level === null || state.strong < (state.declined.includes(state.level) ? 5 : 3)) return undefined;
  return AGE_LEVELS[AGE_LEVELS.indexOf(state.level) + 1];
}

// Saving as soon as the card rises makes an unanswered card a decline,
// including when the app reloads while the card is still open.
export function showOffer(state: LevelOffer): LevelOffer {
  if (state.level === null || offeredLevel(state) === undefined) return state;
  return { ...state, strong: 0, declined: [...new Set([...state.declined, state.level])] };
}

export function acceptOffer(state: LevelOffer): LevelOffer {
  return { ...state, strong: 0, declined: state.declined.filter((level) => level !== state.level) };
}
