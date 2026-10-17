import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import {
  board,
  choices,
  finishLoading,
  fit,
  fitAll,
  hints,
  openPuzzle,
  openSkeletonsApp,
  release,
  reveal,
  skeletonOf,
  homeOf,
  keptSkeletons,
  revealNow,
  savedSkeletons,
  type SkeletonsAppOptions
} from "./skeletonsApp.tsx";
import { fakeBodyPicture, fakeSkeletonPicture, manualPictures, memoryStorage, symbolOf, words, type MemoryStorage } from "./support.ts";

const GAME = "skeleton-assembly";

const NAMES: Record<string, string> = { tyrannosaurus: "TYRANNOSAURUS", triceratops: "TRICERATOPS", stegosaurus: "STEGOSAURUS" };

// The longest the reveal waits for a body picture, in milliseconds.
const PICTURE_WAIT = 1000;

const button = (name: string) => screen.getByRole("button", { name });


// Every skeleton entry written to storage, in order.
function countingSaves(storage: MemoryStorage) {
  const writes: unknown[] = [];
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    writes.push(JSON.parse(value).games[GAME]);
    setItem(key, value);
  };
  return writes;
}

// The puzzle of the dinosaur with this id, finished, its reveal still to
// come.
async function finish(id: string, options: SkeletonsAppOptions = {}) {
  const opened = await openPuzzle(NAMES[id] ?? id, options);
  fitAll(skeletonOf(id));
  return opened;
}

const starsChip = () => screen.getByLabelText("STARS").textContent;
const bestScore = () => screen.queryByLabelText("BEST SCORE")?.textContent;
const celebration = () => screen.queryByRole("status")?.getAttribute("aria-label");
const bones = () => reveal()?.querySelector(".skeleton-reveal-bones");
const body = () => reveal()?.querySelector(".skeleton-reveal-body");

describe("the reveal of a finished skeleton", () => {
  it("shows the complete skeleton on its board first, waiting for its moment and its body picture", async () => {
    const { pictures } = await finish("tyrannosaurus");

    expect(board().hasAttribute("data-complete")).toBe(true);
    expect(reveal()).toBeNull();
    expect(pictures.loading()).toEqual([fakeBodyPicture("tyrannosaurus")]);
    expect(pictures.timers().sort()).toEqual([REVEAL.motion, PICTURE_WAIT].sort());

    act(() => pictures.finish(fakeBodyPicture("tyrannosaurus")));
    expect(reveal()).toBeNull();

    act(() => pictures.fire(REVEAL.motion));
    expect(reveal()).not.toBeNull();
  });

  it("holds the whole skeleton as long as the last piece's slide in and as long again, and only its fade with reduced motion", () => {
    expect(REVEAL).toEqual({ motion: 480, reduced: 160 });
  });

  it("fades the dinosaur's body in over its whole skeleton, in the frame they share", async () => {
    const { pictures } = await finish("tyrannosaurus");
    revealNow(pictures, "tyrannosaurus");

    const art = screen.getByRole("img", { name: "TYRANNOSAURUS" });
    expect([bones()?.getAttribute("src"), body()?.getAttribute("src")]).toEqual([fakeSkeletonPicture("tyrannosaurus", "skeleton"), fakeBodyPicture("tyrannosaurus")]);
    expect([bones()?.parentElement, body()?.parentElement]).toEqual([art, art]);
    expect([art.style.getPropertyValue("--frame-width"), art.style.getPropertyValue("--frame-height")]).toEqual(["800", "600"]);
  });

  it("shows the name in large capitals, one short fact, the star and the collection score out of 3", async () => {
    const { pictures } = await finish("tyrannosaurus");
    revealNow(pictures, "tyrannosaurus");

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(reveal()?.querySelectorAll(".skeleton-fact")).toHaveLength(1);
    expect(words(reveal()?.querySelector(".skeleton-fact") ?? document.body)).toBe("T. REX HAD TINY ARMS BUT HUGE LEGS.");
    expect(screen.getByRole("img", { name: "STAR" })).toBeDefined();
    expect(starsChip()).toBe("1/3");
  });

  it("offers BUILD ANOTHER, MUSEUM and HOME, each with its symbol", async () => {
    const { pictures } = await finish("triceratops");
    revealNow(pictures, "triceratops");

    expect([symbolOf(button("BUILD ANOTHER")), symbolOf(button("MUSEUM")), symbolOf(button("HOME"))]).toEqual(["bone", "landmark", "house"]);
  });

  it("shows no hint after completion, and counts no time towards one", async () => {
    const { pictures } = await finish("stegosaurus");

    expect(hints()).toEqual([]);
    // Only the reveal's pause and its wait for the body picture run: no
    // tick of help.
    expect(pictures.timers().sort()).toEqual([REVEAL.motion, PICTURE_WAIT].sort());
  });
});

describe("earning a star", () => {
  it("earns a first star, a collection and best score of 1/3 and a first best celebration, and starts the stand", async () => {
    const { pictures, storage } = await finish("tyrannosaurus");

    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });

    revealNow(pictures, "tyrannosaurus");
    expect([starsChip(), bestScore(), celebration()]).toEqual(["1/3", "BEST1/3", "FIRST BEST SCORE"]);
  });

  it("raises the collection and its best with a different dinosaur, celebrating a new best", async () => {
    const { pictures, storage } = await finish("triceratops", { storage: keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }) });

    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [] });

    revealNow(pictures, "triceratops");
    expect([starsChip(), bestScore(), celebration()]).toEqual(["2/3", "BEST12/3", "NEW BEST SCORE"]);
  });

  it("fills the collection with the third dinosaur, and keeps the other games' progress", async () => {
    const { pictures, storage } = await finish("stegosaurus", { storage: keptSkeletons({ earned: ["triceratops", "tyrannosaurus"], bestScore: 2, rebuilding: [] }) });

    revealNow(pictures, "stegosaurus");

    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus", "triceratops", "stegosaurus"], bestScore: 3, rebuilding: [] });
    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "").games["compare-dinosaurs"]).toEqual({ bestScore: 7, roundsPlayed: 3 });
    expect([starsChip(), bestScore()]).toEqual(["3/3", "BEST23/3"]);
  });

  it("records the star exactly once, the moment the last piece fits, whatever releases follow", async () => {
    const storage = memoryStorage();
    const writes = countingSaves(storage);
    const tyrannosaurus = skeletonOf("tyrannosaurus");
    const { pictures } = await openPuzzle("TYRANNOSAURUS", { storage });
    for (const piece of ["skull", "spine", "legs"] as const) fit(tyrannosaurus, piece);

    expect(writes).toEqual([]);

    fit(tyrannosaurus, "tail");
    release(homeOf(tyrannosaurus, "tail"));
    release(homeOf(tyrannosaurus, "tail"));

    expect(writes).toEqual([{ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }]);

    revealNow(pictures, "tyrannosaurus");
    expect(writes).toHaveLength(1);
  });

  it("keeps the star and the stand when the child leaves during the reveal, which then never shows", async () => {
    const { user, pictures, storage } = await finish("tyrannosaurus");

    await user.click(button("HOME"));
    revealNow(pictures, "tyrannosaurus");

    expect(reveal()).toBeNull();
    expect(button("COMPARE")).toBeDefined();
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
  });

  it("keeps the star when the app is reloaded during the reveal", async () => {
    const { storage } = await finish("tyrannosaurus");
    cleanup();

    openSkeletonsApp({ storage });

    expect(within(choices()[0] ?? document.body).getByRole("img", { name: "STAR" })).toBeDefined();
    expect(screen.getByLabelText("BEST SCORE").textContent).toBe("1/3");
  });

  it("still reveals and keeps the star for the visit when stored progress cannot be read, with no best to show", async () => {
    const storage = memoryStorage({}, { read: false });
    const { pictures } = await finish("triceratops", { storage });

    revealNow(pictures, "triceratops");

    expect([starsChip(), bestScore(), celebration()]).toEqual(["1/3", undefined, undefined]);
    expect(storage.items.size).toBe(0);
  });
});

describe("a body picture that cannot load", () => {
  it("reveals the skeleton once the wait for it runs out, never more than a second after the pause", async () => {
    const { pictures } = await finish("triceratops");

    act(() => pictures.fire(REVEAL.motion));
    expect(reveal()).toBeNull();

    act(() => pictures.fire(PICTURE_WAIT));
    expect(reveal()).not.toBeNull();
  });

  it("leaves the whole skeleton, the name, the fact and the reward, and the ways on", async () => {
    const { pictures } = await finish("triceratops");
    revealNow(pictures, "triceratops");

    fireEvent.error(body() ?? document.body);

    expect([body() ?? "no body", bones()?.hasAttribute("data-alone")]).toEqual(["no body", true]);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TRICERATOPS");
    expect(words(reveal()?.querySelector(".skeleton-fact") ?? document.body)).toBe("TRICERATOPS HAD THREE HORNS AND A BONY FRILL.");
    expect([starsChip(), celebration()]).toEqual(["1/3", "FIRST BEST SCORE"]);
    expect([button("BUILD ANOTHER"), button("MUSEUM")]).toHaveLength(2);
  });
});

describe("building another", () => {
  it("returns to one choice of all three dinosaurs on a double tap, the finished one starred", async () => {
    const { user, pictures } = await finish("triceratops");
    revealNow(pictures, "triceratops");

    await user.dblClick(button("BUILD ANOTHER"));

    expect(reveal()).toBeNull();
    expect(screen.getAllByRole("group", { name: "DINOSAURS" })).toHaveLength(1);
    expect(choices().map((choice) => [choice.getAttribute("aria-label"), within(choice).queryByRole("img", { name: "STAR" }) !== null])).toEqual([
      ["TYRANNOSAURUS", false],
      ["TRICERATOPS", true],
      ["STEGOSAURUS", false]
    ]);
    expect(screen.getByLabelText("BEST SCORE").textContent).toBe("1/3");
  });

  it("builds the next dinosaur from the choice", async () => {
    const { user, pictures } = await finish("triceratops");
    revealNow(pictures, "triceratops");
    await user.click(button("BUILD ANOTHER"));

    await user.click(button("STEGOSAURUS"));
    act(() => finishLoading(pictures));

    expect(board().getAttribute("aria-label")).toBe("SKELETON");
    expect(screen.getByRole("heading").textContent).toBe("STEGOSAURUS");
  });
});

describe("reduced motion", () => {
  it("reveals after the piece's short fade, with the same reward", async () => {
    const pictures = manualPictures();
    await finish("tyrannosaurus", { pictures, reducedMotion: true });

    expect(pictures.timers().sort()).toEqual([REVEAL.reduced, PICTURE_WAIT].sort());

    revealNow(pictures, "tyrannosaurus", REVEAL.reduced);

    expect([starsChip(), celebration(), button("BUILD ANOTHER").textContent]).toEqual(["1/3", "FIRST BEST SCORE", "BUILD ANOTHER"]);
  });
});

// skeleton-assembly-fact.feature
describe("the dinosaur's fact", () => {
  const FACTS: Record<Language, Record<string, string>> = {
    en: {
      tyrannosaurus: "T. REX HAD TINY ARMS BUT HUGE LEGS.",
      triceratops: "TRICERATOPS HAD THREE HORNS AND A BONY FRILL.",
      stegosaurus: "STEGOSAURUS HAD LARGE PLATES ALONG ITS BACK."
    },
    ru: {
      tyrannosaurus: "У ТИРАННОЗАВРА БЫЛИ КРОШЕЧНЫЕ ЛАПЫ И ОГРОМНЫЕ НОГИ.",
      triceratops: "У ТРИЦЕРАТОПСА БЫЛО ТРИ РОГА И КОСТЯНОЙ ВОРОТНИК.",
      stegosaurus: "У СТЕГОЗАВРА ВДОЛЬ СПИНЫ БЫЛИ БОЛЬШИЕ ПЛАСТИНЫ."
    }
  };

  it.each(LANGUAGES.flatMap((language) => Object.keys(NAMES).map((id) => [language, id] as const)))(
    "in %s, shows exactly one fact for %s, in capitals beside its picture, without waiting for speech",
    async (language, id) => {
      const skeleton = skeletonOf(id);
      const { pictures } = await openPuzzle(skeleton.name[language].toLocaleUpperCase(language), { deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
      fitAll(skeleton);
      revealNow(pictures, id);

      const facts = reveal()?.querySelectorAll(".skeleton-fact") ?? [];
      expect([...facts].map((fact) => words(fact as HTMLElement))).toEqual([FACTS[language][id]]);
      expect(facts[0]?.parentElement?.previousElementSibling).toBe(screen.getByRole("img", { name: skeleton.name[language].toLocaleUpperCase(language) }));
      expect(button(TEXTS[language].buildAnother)).toBeDefined();
    }
  );
});
