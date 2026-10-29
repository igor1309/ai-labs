import type { AgeLevel } from "../ageLevel.ts";
import type { Language } from "../language/language.ts";

export type Jaw = {
  id: string;
  name: Record<Language, string>;
  diet: "meat" | "plants";
  pair: string;
  fact: Record<Language, string>;
  hint: Record<Language, string>;
};
export type JawQuestion = { owner: Jaw; choices: readonly Jaw[] };
export type JawRound = {
  level: AgeLevel;
  questions: readonly JawQuestion[];
  placed: readonly { id: string; firstTry: boolean }[];
  errors: number;
  misses: number;
  phase: "entering" | "waiting" | "right" | "reading" | "wrong" | "done";
  target: string | undefined;
};

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let at = 0; at < result.length - 1; at++) {
    const other = at + Math.floor(random() * (result.length - at));
    [result[at], result[other]] = [result[other]!, result[at]!];
  }
  return result;
}

export function startJawRound(jaws: readonly Jaw[], level: AgeLevel, random: () => number): JawRound {
  if (jaws.length < 5 || new Set(jaws.map(({ id }) => id)).size !== jaws.length) throw new Error("A round needs five distinct jaws");
  const questions = shuffle(jaws, random).slice(0, 5).map((owner): JawQuestion => {
    let others: Jaw[];
    if (level === "paleontologist") {
      const partner = jaws.find((jaw) => jaw.id !== owner.id && jaw.pair === owner.pair);
      const otherPair = shuffle(jaws.filter((jaw) => jaw.pair !== owner.pair), random)[0]?.pair;
      others = partner ? [partner, ...jaws.filter((jaw) => jaw.pair === otherPair)] : [];
      if (others.length !== 3) throw new Error(`No look-alike choices for ${owner.id}`);
    } else {
      const count = level === "hatchling" ? 1 : 2;
      others = shuffle(jaws.filter((jaw) => jaw.diet !== owner.diet), random).slice(0, count);
      if (others.length !== count) throw new Error(`No opposite-diet choices for ${owner.id}`);
    }
    return { owner, choices: shuffle([owner, ...others], random) };
  });
  return { level, questions, placed: [], errors: 0, misses: 0, phase: "entering", target: undefined };
}

export const currentJaw = (round: JawRound): JawQuestion => round.questions[round.placed.length]!;

export function placeJaw(round: JawRound, id: string): JawRound {
  if (round.phase !== "waiting") return round;
  const { owner, choices } = currentJaw(round);
  const target = choices.find((jaw) => jaw.id === id);
  if (!target) return round;
  const right = round.level === "paleontologist" ? target.id === owner.id : target.diet === owner.diet;
  return { ...round, phase: right ? "right" : "wrong", target: id,
    errors: round.errors + (right ? 0 : 1), misses: round.misses + (right ? 0 : 1) };
}

export function advanceJaw(round: JawRound): JawRound {
  if (round.phase === "entering" || round.phase === "wrong") return { ...round, phase: "waiting", target: undefined };
  if (round.phase === "right") return { ...round, phase: "reading" };
  return round;
}

export function nextJaw(round: JawRound): JawRound {
  if (round.phase !== "reading") return round;
  const placed = [...round.placed, { id: currentJaw(round).owner.id, firstTry: round.misses === 0 }];
  return { ...round, placed, misses: 0, target: undefined, phase: placed.length === 5 ? "done" : "entering" };
}
