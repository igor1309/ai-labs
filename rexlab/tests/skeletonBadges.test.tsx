import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { fit, homeOf, keptSkeletons, moveTo, openPuzzle, press, release, reveal, revealNow, savedSkeletons, skeletonOf, spotOf } from "./skeletonsApp.tsx";
import { memoryStorage, type ManualPictures } from "./support.ts";

// skeleton-assembly-badges.feature: a skeleton built at Explorer or
// Paleontologist without help's last step earns that level's badge, kept
// on its stand for good.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

function spend(pictures: ManualPictures, seconds: number) {
  for (let second = 0; second < seconds; second++) act(() => pictures.fire(1000));
}

// Builds `id` at `level` on `storage`, `seconds` of help shown before the
// first piece fits, and reveals it.
async function build(id: string, level: AgeLevel, storage = memoryStorage(), seconds = 0) {
  const skeleton = skeletonOf(id);
  const opened = await openPuzzle(skeleton.name.en.toUpperCase(), { ageLevels: levelOf(level), storage });
  spend(opened.pictures, seconds);
  for (const { id: piece } of skeleton.cuts[level] ?? skeleton.cuts.hatchling) fit(skeleton, piece);
  revealNow(opened.pictures, id);
  return opened;
}

// The level badges in `within`, by their names.
const badgesIn = (element: Element | null) => [...(element ?? document.body).querySelectorAll(".level-badge")].map((badge) => badge.getAttribute("aria-label"));

// The museum opened from the reveal, and the badges on `name`'s stand.
async function standBadges(user: Awaited<ReturnType<typeof build>>["user"], name: string) {
  await user.click(within(reveal() ?? document.body).getByRole("button", { name: "MUSEUM" }));
  return badgesIn(screen.getByRole("region", { name }));
}

describe("a level badge", () => {
  it("is earned by a skeleton built at Explorer with only help's first two steps shown, and shows on its stand", async () => {
    const storage = memoryStorage();
    const { user } = await build("triceratops", "explorer", storage, 20);

    expect(badgesIn(reveal())).toEqual(["EXPLORER BADGE"]);
    expect(within(reveal() ?? document.body).getByText("EXPLORER BADGE")).toBeTruthy();
    expect(await standBadges(user, "TRICERATOPS")).toEqual(["EXPLORER BADGE"]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: ["explorer"] } });
  });

  it("is not earned once a piece has moved towards its home, the star earned all the same", async () => {
    const storage = memoryStorage();
    const { user } = await build("stegosaurus", "paleontologist", storage, 30);

    expect([badgesIn(reveal()), within(reveal() ?? document.body).getByRole("img", { name: "STAR" }).hasAttribute("data-new")]).toEqual([[], true]);
    expect(await standBadges(user, "STEGOSAURUS")).toEqual([]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["stegosaurus"], bestScore: 1, rebuilding: [] });
  });

  it.each<AgeLevel>(["explorer", "paleontologist"])("is earned at %s when the last step falls due only while the last piece is held, and it fits", async (level) => {
    const storage = memoryStorage();
    const triceratops = skeletonOf("triceratops");
    const cut = triceratops.cuts[level] ?? [];
    const last = cut.at(-1)?.id ?? "";
    const { pictures, user } = await openPuzzle("TRICERATOPS", { ageLevels: levelOf(level), storage });
    for (const { id } of cut.slice(0, -1)) fit(triceratops, id);
    spend(pictures, 29);
    const { left, top } = spotOf(last).getBoundingClientRect();

    press(spotOf(last), { clientX: left + 40, clientY: top + 40 });
    moveTo(homeOf(triceratops, last));
    spend(pictures, 2);
    const moved = document.querySelector(".skeleton-piece[data-nudge]");
    release(homeOf(triceratops, last));
    revealNow(pictures, "triceratops");

    const badge = level === "explorer" ? "EXPLORER BADGE" : "PALEONTOLOGIST BADGE";
    expect([moved, badgesIn(reveal())]).toEqual([null, [badge]]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: [level] } });
    expect(await standBadges(user, "TRICERATOPS")).toEqual([badge]);
  });

  it("is kept after a later try with help", async () => {
    const storage = keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: ["explorer"] } });
    const { user } = await build("triceratops", "explorer", storage, 30);

    expect(badgesIn(reveal())).toEqual([]);
    expect(await standBadges(user, "TRICERATOPS")).toEqual(["EXPLORER BADGE"]);
  });

  it("is each level's own: Paleontologist's joins Explorer's, after it", async () => {
    const storage = keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: ["explorer"] } });
    const { user } = await build("triceratops", "paleontologist", storage);

    expect(badgesIn(reveal())).toEqual(["PALEONTOLOGIST BADGE"]);
    expect(await standBadges(user, "TRICERATOPS")).toEqual(["EXPLORER BADGE", "PALEONTOLOGIST BADGE"]);
  });

  it("is never earned at Hatchling", async () => {
    const storage = memoryStorage();
    await build("tyrannosaurus", "hatchling", storage);

    expect([badgesIn(reveal()), savedSkeletons(storage)]).toEqual([[], { earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }]);
  });

  it("reads none from progress kept before badges, keeping the next one earned beside the stars", async () => {
    const storage = keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
    const { user } = await build("stegosaurus", "explorer", storage);

    await user.click(within(reveal() ?? document.body).getByRole("button", { name: "MUSEUM" }));
    expect([badgesIn(screen.getByRole("region", { name: "TRICERATOPS" })), badgesIn(screen.getByRole("region", { name: "STEGOSAURUS" }))]).toEqual([[], ["EXPLORER BADGE"]]);
    expect(within(screen.getByRole("region", { name: "TRICERATOPS" })).getByRole("img", { name: "STAR" })).toBeTruthy();
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops", "stegosaurus"], bestScore: 2, rebuilding: [], badges: { stegosaurus: ["explorer"] } });
  });

  it("is named in Russian too", async () => {
    const skeleton = skeletonOf("triceratops");
    const opened = await openPuzzle("ТРИЦЕРАТОПС", { ageLevels: levelOf("paleontologist"), deviceLanguage: "ru-RU" });
    for (const { id } of skeleton.cuts.paleontologist ?? []) fit(skeleton, id);
    revealNow(opened.pictures, "triceratops");

    expect(badgesIn(reveal())).toEqual(["ЗНАЧОК ПАЛЕОНТОЛОГА"]);
  });
});
