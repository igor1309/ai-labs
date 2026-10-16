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
- **First build:** compares mass and height, always asking which dinosaur has more ("Who is heavier?", "Who is taller?"). English only; Russian, then a dark theme follow. Behaviour: `docs/features/`.
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
| Progress and achievements | `localStorage` | Device/browser scoped; can be reset. |
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

## 4. Comparison quiz engine

**Round flow:**

1. Generate a valid question: comparison attribute + two distinct dinosaurs + direction (greater/less).
2. Display the question and two large tappable dinosaur cards.
3. Evaluate the selected answer entirely in the browser.
4. Display clear correct/incorrect feedback, then proceed to the next pair.
5. After 10 questions, calculate the score and update the personal best if improved. Achievements follow the first build (LAB-266).

The same comparison machinery can support **length, height, weight/mass, and number of horns**. Possible future attributes include age/geological period, but those require well-defined rules and appropriate wording for children.

**Fairness constraint:** Dinosaur size and mass are estimates. In each question the larger value is at least 1.5 times the smaller one, and no two questions in a round use the same two dinosaurs, whichever attribute they compare. The dinosaur list must hold enough such pairs to fill a round.

## 5. Scores and achievements

Store progress under versioned browser-local keys, for example:

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

`bestScore` is `null` until a round is finished. On round completion:

```ts
const firstBest = previousBest === null && currentScore > 0;
const beatPersonalBest = previousBest !== null && currentScore > previousBest;
const newBest = previousBest === null ? currentScore : Math.max(previousBest, currentScore);
```

Use `firstBest` and `beatPersonalBest` to trigger the **first best** and **new personal best** celebrations; a first round of 0/10 is not celebrated. Each finished round increments `roundsPlayed`; an unfinished round changes nothing. Stored progress that is unreadable or has an unknown `schemaVersion` counts as no progress and is replaced; when the browser refuses storage, the round shows its score but no best score and no celebration. Example initial achievements: first completed round, perfect 10/10, improved personal best. Browser storage may be cleared; this is an accepted product trade-off.

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

## 8. Open implementation choices

- Specify the validated dinosaur dataset and image sourcing/licensing workflow.
- Finalize comparison attributes and pair-selection thresholds.
- Decide whether installable PWA/offline support belongs in MVP or a later iteration.

**Bottom line:** Infrastructure can remain static and free-tier for this MVP. The principal work is quiz UX, content quality, and reliable pair generation rather than server operations.
