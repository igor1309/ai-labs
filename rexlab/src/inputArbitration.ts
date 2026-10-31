import { createContext } from "react";

export type InputArbitration = (guard: (event: Event) => void) => () => void;

// Screens register contact rejection with the host that owns input ordering.
export const InputArbitrationContext = createContext<InputArbitration | undefined>(undefined);
