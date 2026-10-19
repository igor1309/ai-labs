import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DigRevealScreen } from "../src/DigRevealScreen.tsx";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { withPictures } from "./pictures.tsx";

const props = {
  language: "en" as const,
  name: "Pachycephalosaurus",
  picture: "/pictures/pachycephalosaurus.webp",
  dugUp: 42,
  total: 42,
  newStar: true,
  celebration: "new-best" as const,
  badge: true,
  level: "explorer" as const,
  onLevel: vi.fn(),
  onDigAgain: vi.fn(),
  onHome: vi.fn()
};

describe("the dig reveal", () => {
  it("holds its level switch and actions until the reward has landed", () => {
    const view = render(<DigRevealScreen {...props} landed={false} />, withPictures);
    const switcher = screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch });

    expect(within(switcher).getAllByRole("button")).toHaveLength(AGE_LEVELS.length);
    expect(within(switcher).getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: TEXTS.en.digAgain }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: TEXTS.en.home }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(switcher).getByRole("button", { name: TEXTS.en.ageLevels.paleontologist.name }));
    expect(props.onLevel).not.toHaveBeenCalled();

    view.rerender(<DigRevealScreen {...props} landed={true} />);
    fireEvent.click(within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels.paleontologist.name }));
    expect(props.onLevel).toHaveBeenCalledWith("paleontologist");
  });
});
