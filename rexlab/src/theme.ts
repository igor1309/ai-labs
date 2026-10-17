export type Theme = "light" | "dark";

// What a parent chooses: a theme of its own, or System, which follows the
// device.
export type ThemeChoice = "system" | Theme;

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice);
}

export function themeOf(choice: ThemeChoice, device: Theme): Theme {
  return choice === "system" ? device : choice;
}
