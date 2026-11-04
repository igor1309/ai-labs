import type { QuestionScreenProps } from "../src/QuestionScreen.tsx";

// Controlled presentation: correctness and history are inputs, never computed here.
export function questionProps(overrides: Partial<QuestionScreenProps> = {}): QuestionScreenProps {
  return {
    language: "en", prompt: "mass", number: 4, total: 10,
    steps: ["right", "wrong", "right", "current", ...Array<"to-come">(6).fill("to-come")],
    best: 8,
    left: { id: "triceratops", name: "Triceratops", picture: "/src/assets/dinos/triceratops/body.webp", value: undefined, mark: undefined, chosen: false },
    right: { id: "velociraptor", name: "Velociraptor", picture: "/src/assets/dinos/velociraptor/body.webp", value: undefined, mark: undefined, chosen: false },
    answered: false, last: false, onChoose: () => {}, onNext: () => {}, onHome: () => {},
    ...overrides
  };
}
