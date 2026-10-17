# rexlab — Change Log

## 2026-10-17

- Added 12 more dinosaurs, from 18 to 30 (LAB-269): Carnotaurus, Giganotosaurus, Therizinosaurus, Edmontosaurus, Deinonychus, Oviraptor, Coelophysis, Psittacosaurus, Styracosaurus, Kentrosaurus, Baryonyx and Apatosaurus, with height and mass from the trusted sources and artwork in the same picture-book style; Deinonychus, Oviraptor and Therizinosaurus are feathered.
- Designed the dinosaur catalogue in `design/rexlab.pen` (LAB-268): a list of all dinosaurs with height, weight and a coloured MEAT or PLANTS tag on each card, a page per dinosaur with its food type as a tag under the name, and a catalogue tile for the home page.
- Listed the trusted science sources for dinosaur facts in `docs/sources.md`: the Natural History Museum (London), the American Museum of Natural History, the Smithsonian National Museum of Natural History, the University of California Museum of Paleontology and Encyclopaedia Britannica.
- Gave the whole app the Field Guide Midnight look: an ink-navy base on warm paper with amber and terracotta, the Lexend font and Lucide icons. The home page shows two locked tiles for games still to come; answers get ✓ RIGHT and ✗ WRONG badges; the result shows the best score, and confetti only for a new best.
- Added a Midnight edition of the Field Guide design, with an ink-navy base instead of forest green, to `design/rexlab.pen`.
- Saved the app's designs in `design/rexlab.pen`, opened with Pencil: the original home and parent menus, the Lagoon redesign (LAB-267) and the calmer Field Guide redesign, with their pictures in `design/images/`.
- Replaced the placeholder dinosaur pictures with generated artwork in one picture-book style, credited in `CREDITS.md`; the style prompt now asks for a pose turned slightly toward the viewer.
- Redesigned the home page to the owner's design: a large COMPARE card with two dinosaurs facing off over rolling hills, a RexLab wordmark, and the language and theme switches as small menus for parents (Fredoka, Nunito and Lucide icons, bundled with the app).
- Gave every dinosaur card its own picture: an 800×600 WebP per dinosaur at `src/assets/dinos/<id>/body.webp`, served under a content-hashed name and named in the chosen language. Until the artwork is generated each is a placeholder with the dinosaur's name, made by `scripts/make-placeholders.sh` and credited in `CREDITS.md`; a test reads every picture's size from its file.
- Added a README that describes the app and points to the features, the architecture notes and `AGENTS.md`.
- Gave the quiz one entry point and the screens their own display types, so the answer rule lives only in the quiz; tests now enforce these module boundaries, show the celebrations, and check that progress and the language are saved in `localStorage`.
- Added the dark theme: System, Light or Dark, chosen by a parent with a small switch in a corner of the home page and remembered in `localStorage`. System follows the device appearance, also while the app is open, and the ✓ and ✗ marks keep at least 3:1 contrast with their cards in both themes.
- Wrote all text for children in capitals, in English and Russian: prompts, buttons, marks, score, best score, stars, the turn-sideways picture and units. The language switch and the version footer, for parents, stay in normal case.

## 2026-10-16

- Added `AGENTS.md`: product principles (gamification is essential; text for children who are learning to read), where the specs live, running the app locally, and shipping a release.
- Added English and Russian: interface text from typed dictionaries, dinosaur names in both languages, values written with the chosen language's numbers and units, the device language first, and a small "EN | RU" switch for parents on the home page, remembered in `localStorage`.
- Added the result screen: the score as a number and in stars, the best score, first-best and new-best celebrations, Play again and Home, and progress kept in `localStorage` in the versioned record, read and saved on a best-effort basis.
- Added answering a question: a pressed card, ✓ and ✗ marks in colour, both values revealed in kilograms, tonnes or metres, only the first tap counting, and "See result" on the last question.
- Added the compare-dinosaurs quiz card on the home page, the shipped dinosaur list, fair-pair round generation and the question screen, with the turn-sideways picture in portrait (React, TypeScript, Vite).
- Added a Hello RexLab page and its tag release to Cloudflare Pages at rexlab.enoa.ai (LAB-265).
- Added MVP infrastructure notes: static Cloudflare Pages app, client-side quiz, no backend.
- Started RexLab, inspired by [Mesoris](https://mesoris.com/ru).
