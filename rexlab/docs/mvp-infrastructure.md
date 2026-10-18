---
date: 2026-10-16
model: gpt-6
status: proposed
description: "RexLab MVP infrastructure and technical architecture: a static Cloudflare Pages app, client-side quiz engine, static JSON content, localStorage progress. Infrastructure direction agreed; implementation details proposed."
---

# RexLab MVP — Infrastructure and Technical Architecture

## 1. Product scope

- **Platform:** Web application, optimized for iPad in landscape orientation.
- **Audience:** Children aged 5–7, who are just learning to read: dinosaur names in large capitals, meaning carried by symbols and pictures, touch-friendly controls.
- **First game:** Two dinosaur cards; choose the dinosaur that matches a comparison question (e.g., bigger, heavier, taller).
- **Round:** 10 pairs/questions, with immediate answer feedback and a final score.
- **First build:** compares mass and height, always asking which dinosaur has more ("WHO IS HEAVIER?", "WHO IS TALLER?"). In English and Russian, chosen from the device language and switchable by a parent. In a light or dark theme that follows the device, or that a parent chooses. Behaviour: `docs/features/`.
- **Gamification:** Essential. Scores and personal-best celebration in the first build; achievements follow (LAB-266). Compare the new score with the **highest historical score**, never with the most recent score if it is lower.
- **Accounts:** None for MVP.
- **Data durability:** Best effort only; losing browser-local scores is acceptable.

## 2. Infrastructure decision

**Use existing Cloudflare Pages setup to host a fully static web app.** The quiz engine runs in the browser; no application server or hosted database is required for the MVP.

| Concern | MVP solution | Notes |
| --- | --- | --- |
| Hosting | Cloudflare Pages (Free tier) | User already has Cloudflare Pages deployments. |
| Deployments | `rexlab_v<version>` tag → `release-unit.yml` → Wrangler → Cloudflare Pages | Pages project `rexlab`, domain `rexlab.enoa.ai`. |
| Front end | React + TypeScript + Vite | Proposed stack. |
| Quiz machinery | Client-side TypeScript | Select pairs, evaluate answers, advance rounds. |
| Dinosaur information | Versioned static JSON | Source-controlled; fetched with the app. |
| Images | Static WebP/AVIF files | Served from Cloudflare Pages alongside the app. |
| Active game state | React state | Current question, answer, score and round. |
| Progress (achievements later, LAB-266) | `localStorage` | Device/browser scoped; can be reset. |
| User authentication | None | Not part of MVP. |
| Backend / database | None | Reconsider only when a concrete use case appears. |
| Offline use | Optional PWA enhancement | Manifest and service worker can be added later. |

**Cost target:** $0/month for static hosting within Cloudflare Pages Free limits, on the existing `enoa.ai` domain.

## 3. Content model

Each dinosaur is a record with descriptive metadata, multiple image variants, and comparable attributes. The following is an **illustrative schema** (values are examples requiring scientific/content validation):

```json
{
  "id": "triceratops",
  "name": { "en": "Triceratops", "ru": "Трицератопс" },
  "images": {
    "thumbnail": "/dinos/triceratops/thumb.webp",
    "fullBody": "/dinos/triceratops/body.webp",
    "head": "/dinos/triceratops/head.webp"
  },
  "attributes": {
    "lengthMeters": 9,
    "heightMeters": 3,
    "massKg": 7000,
    "hornCount": 3
  }
}
```

Additional views can be added to `images` without changing the hosting architecture. Standardize measurement definitions and keep estimates clearly distinguished from verified counts.

**What each attribute measures** (LAB-263). The shipped list asks two; `docs/sources.md` holds the full rules and each value's references.

| Attribute | Measures | Unit | Comes from |
| --- | --- | --- | --- |
| `heightMeters` | Hip height: ground to the top of the hip, standing; never head, neck, crest, plates or shoulder | metres | The leg bones end to end (femur, tibia, third metatarsal) in peer-reviewed tables; a missing bone, or the whole leg, in the closest relative's proportion |
| `massKg` | Live body mass | kilograms | The trusted sources' estimates; Britannica's short tons at 907 kg |

Length and horn count are not asked yet; each gets its definition here when a game asks it.

## 4. Comparison quiz engine

**Round flow:**

1. Generate a valid question: comparison attribute + two distinct dinosaurs. The first build always asks which has more; a "less" direction ("WHO IS LIGHTER?") is future work.
2. Display the question and two large tappable dinosaur cards.
3. Evaluate the selected answer entirely in the browser.
4. Display clear correct/incorrect feedback, then proceed to the next pair.
5. After 10 questions, calculate the score and update the personal best if improved. Achievements follow the first build (LAB-266).

The same comparison machinery can support **length, height, weight/mass, and number of horns**. Possible future attributes include age/geological period, but those require well-defined rules and appropriate wording for children.

**Fairness constraint:** Dinosaur size and mass are estimates. In each question the larger value is at least 1.5 times the smaller one, and no two questions in a round use the same two dinosaurs, whichever attribute they compare. The dinosaur list must hold enough such pairs to fill a round.

## 5. Scores, and achievements later

Store progress under versioned browser-local keys, for example (`achievements` arrives with LAB-266; the first build does not write it):

```json
{
  "schemaVersion": 1,
  "games": {
    "compare-dinosaurs": {
      "bestScore": 8,
      "roundsPlayed": 3,
      "achievements": ["first-round"]
    }
  }
}
```

Each game keeps its own entry under `games`, and saving one leaves the others as they are: the compare quiz `compare-dinosaurs`, the sorting game `sort-dinosaurs`, both with `bestScore` and `roundsPlayed`, dinosaur care `dinosaur-care`, with `bestScore`, `visitsFinished` and `friends`, and the skeleton game `skeleton-assembly`, with `bestScore`, `earned`, the ids of the dinosaurs whose skeleton has earned its star, and `rebuilding`, the ids of those knocked down to be built again, whose museum stands await them; a rebuild's fitted bones are not kept. Beside them, the home page keeps `home-featured`: `starts`, how many times each game has been started, by its home page id, and `featured`, the day's game as `{ "day": "2026-10-18", "game": "care" }`. A featured entry with a start count that is not a whole number of starts, or a featured game the home page no longer offers, is read as no starts and no game, and the count of a game no longer offered is dropped. Every game scores a finished round by the one rule below (`src/bestScore.ts`).

`bestScore` is `null` until a round is finished. On round completion:

```ts
const firstBest = previousBest === null && currentScore > 0;
const beatPersonalBest = previousBest !== null && currentScore > previousBest;
const newBest = previousBest === null ? currentScore : Math.max(previousBest, currentScore);
```

Use `firstBest` and `beatPersonalBest` to trigger the **first best** and **new personal best** celebrations; a first round of 0/10 is not celebrated. Each finished round increments `roundsPlayed`; an unfinished round changes nothing. Stored progress that is unreadable or has an unknown `schemaVersion` counts as no progress: the round is scored as a first round and its record replaces the bad one. When storage cannot be read at all, the round shows its score but no best score and no celebration. When progress can be read but not saved, the round is shown and celebrated against what was read, and nothing is saved. Achievements (LAB-266) start with: first completed round, perfect 10/10, improved personal best. Browser storage may be cleared; this is an accepted product trade-off.

## 6. iPad interaction constraints

- Landscape-first layout with side-by-side cards.
- Large typography and large touch targets for six-year-olds.
- Immediate visual feedback on card selection: a pressed state on tap, then a ✓ or ✗ mark with colour, never colour alone.
- In portrait, a screen asks to turn the iPad sideways.
- Dinosaur pictures on question cards are all the same size, so the picture never gives away or contradicts the answer; the revealed values do. Additional thumbnails/head images for other screens or games.

## 7. Deployment workflow

Agreed: RexLab ships through the repository's tag release, like the Notio frontend. There is no deploy on push.

1. Keep the app, dinosaur JSON and image assets in `rexlab/`; `rexlab/package.json` holds the version.
2. Every pull request that touches RexLab runs `rexlab-core.yml`: typecheck, tests, Vite build.
3. A `rexlab_v<version>` tag on trunk runs `release-unit.yml`, which checks the tag against `release-units.toml` and calls `rexlab-deploy.yml`.
4. The deploy builds `rexlab/dist`, runs `wrangler pages deploy` to the Cloudflare Pages project `rexlab`, and passes only when `https://rexlab.enoa.ai/` serves the tag's version in its `rexlab-version` meta tag.
5. Cloudflare serves the site over HTTPS through its CDN at `rexlab.enoa.ai`.

## 8. Testing

Agreed: Vitest, the runner that comes with the Vite stack, with Testing Library for screens.

1. Behaviour is specified in Gherkin under `rexlab/docs/features/`; each scenario is proved by a test under `rexlab/tests/`. A feature tagged `@next` is not yet built.
2. Game rules are plain functions, free of React and of the browser, and are tested directly in Node (`*.test.ts`). For the quiz, `src/quiz/` makes a round: every question compares two distinct dinosaurs on an attribute it can ask, with the larger value at least 1.5 times the smaller, and no pair repeats (`round.test.ts`, over many seeds and the shipped list). The best score keeps the best ever, not the last round (`bestScore.test.ts`, `progress.test.ts`). The care, sorting, pairs and skeleton rules are tested the same way.
3. Screens and whole flows render `App` in jsdom (`*.test.tsx`), with the app's stylesheet loaded so computed styles can be checked. jsdom lays nothing out, so where fit matters (a name on one line) the widths are measured in ems of the font and checked against each iPad's width.
4. Whatever the browser decides is passed to `App` by `src/root.ts`, the composition root: local storage, the random source, the clock, timers, picture loading, orientation, theme and motion queries. Tests pass their own: a memory storage, a seeded random source, a fixed clock, timers and pictures that fire when the test says. So a weighted draw, a day boundary or a slow picture is tested without waiting or chance. `root.test.ts` checks that the root wires the real browser.
5. `architecture.test.ts` reads the import graph and keeps it so: the quiz is reached only through `src/quiz/index.ts` and imports nothing but the languages, and screens, texts and themes are kept free of the quiz.
6. `rexlab/scripts/test.sh` runs the same steps as CI: clean install, typecheck, tests, build. CI runs them on every pull request that touches RexLab (section 7).

## 9. Open implementation choices

- Specify the validated dinosaur dataset and image sourcing/licensing workflow.
- Choose the thresholds for attributes after mass and height (length, horns).
- Decide whether installable PWA/offline support belongs in MVP or a later iteration.

**Bottom line:** Infrastructure can remain static and free-tier for this MVP. The principal work is quiz UX, content quality, and reliable pair generation rather than server operations.
