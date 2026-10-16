---
date: 2026-10-16
model: gpt-6
status: proposed
description: "RexLab MVP infrastructure and technical architecture: a static Cloudflare Pages app, client-side quiz engine, static JSON content, localStorage progress. Infrastructure direction agreed; implementation details proposed."
---

# RexLab MVP — Infrastructure and Technical Architecture

## 1. Product scope

- **Platform:** Web application, optimized for iPad in landscape orientation.
- **Audience:** Children around 6 years old; large, readable text and touch-friendly controls.
- **First game:** Two dinosaur cards; choose the dinosaur that matches a comparison question (e.g., bigger, heavier, taller).
- **Round:** 10 pairs/questions, with immediate answer feedback and a final score.
- **Gamification:** Scores, achievements, and personal-best celebration. Compare the new score with the **highest historical score**, never with the most recent score if it is lower.
- **Accounts:** None for MVP.
- **Data durability:** Best effort only; losing browser-local scores is acceptable.

## 2. Infrastructure decision

**Use existing Cloudflare Pages setup to host a fully static web app.** The quiz engine runs in the browser; no application server or hosted database is required for the MVP.

| Concern | MVP solution | Notes |
| --- | --- | --- |
| Hosting | Cloudflare Pages (Free tier) | User already has Cloudflare Pages deployments. |
| Deployments | GitHub → Cloudflare Pages build/deploy | Use existing workflow where possible. |
| Front end | React + TypeScript + Vite | Proposed stack. |
| Quiz machinery | Client-side TypeScript | Select pairs, evaluate answers, advance rounds. |
| Dinosaur information | Versioned static JSON | Source-controlled; fetched with the app. |
| Images | Static WebP/AVIF files | Served from Cloudflare Pages alongside the app. |
| Active game state | React state | Current question, answer, score and round. |
| Progress and achievements | `localStorage` | Device/browser scoped; can be reset. |
| User authentication | None | Not part of MVP. |
| Backend / database | None | Reconsider only when a concrete use case appears. |
| Offline use | Optional PWA enhancement | Manifest and service worker can be added later. |

**Cost target:** $0/month for static hosting within Cloudflare Pages Free limits, using an existing or free Pages subdomain. A newly registered custom domain would have a separate annual cost.

## 3. Content model

Each dinosaur is a record with descriptive metadata, multiple image variants, and comparable attributes. The following is an **illustrative schema** (values are examples requiring scientific/content validation):

```json
{
  "id": "triceratops",
  "name": "Triceratops",
  "images": {
    "thumbnail": "/dinos/triceratops/thumb.webp",
    "fullBody": "/dinos/triceratops/body.webp",
    "head": "/dinos/triceratops/head.webp"
  },
  "attributes": {
    "lengthMeters": 9,
    "heightMeters": 3,
    "weightKg": 7000,
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
5. After 10 questions, calculate the score, award achievements, and update personal best if improved.

The same comparison machinery can support **length, height, weight/mass, and number of horns**. Possible future attributes include age/geological period, but those require well-defined rules and appropriate wording for children.

**Fairness constraint:** Dinosaur size and mass are estimates. Generate pairs with sufficiently different values to make each answer unambiguous; avoid close or scientifically disputed comparisons.

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

On round completion:

```ts
const newBest = Math.max(previousBest, currentScore);
const beatPersonalBest = currentScore > previousBest;
```

Use `beatPersonalBest` to trigger a **new personal best** celebration. Example initial achievements: first completed round, perfect 10/10, improved personal best. Browser storage may be cleared; this is an accepted product trade-off.

## 6. iPad interaction constraints

- Landscape-first layout with side-by-side cards.
- Large typography and large touch targets for six-year-olds.
- Immediate visual feedback on card selection.
- Full-body dinosaur illustrations where useful for size comparisons; additional thumbnails/head images for other screens or games.

## 7. Deployment workflow

1. Maintain the app, dinosaur JSON and image assets in the source repository.
2. Build the static site with Vite.
3. Deploy the generated assets to Cloudflare Pages on Git push.
4. Serve content over HTTPS through Cloudflare's CDN.
5. Update game content with normal version-controlled deployments.

## 8. Open implementation choices

- Use an existing Cloudflare Pages project/subdomain or create a new project for RexLab.
- Specify the validated dinosaur dataset and image sourcing/licensing workflow.
- Finalize comparison attributes and pair-selection thresholds.
- Decide whether installable PWA/offline support belongs in MVP or a later iteration.

**Bottom line:** Infrastructure can remain static and free-tier for this MVP. The principal work is quiz UX, content quality, and reliable pair generation rather than server operations.
