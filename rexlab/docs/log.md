# rexlab — Change Log

## 2026-10-17

- Added the dark theme: System, Light or Dark, chosen by a parent with a small switch in a corner of the home page and remembered in `localStorage`. System follows the device appearance, also while the app is open, and the ✓ and ✗ marks keep at least 3:1 contrast with their cards in both themes.
- Wrote all text for children in capitals, in English and Russian: prompts, buttons, marks, score, best score, stars, the turn-sideways picture and units. The language switch and the version footer, for parents, stay in normal case.

## 2026-10-16

- Added English and Russian: interface text from typed dictionaries, dinosaur names in both languages, values written with the chosen language's numbers and units, the device language first, and a small "EN | RU" switch for parents on the home page, remembered in `localStorage`.
- Added the result screen: the score as a number and in stars, the best score, first-best and new-best celebrations, Play again and Home, and progress kept in `localStorage` in the versioned record, read and saved on a best-effort basis.
- Added answering a question: a pressed card, ✓ and ✗ marks in colour, both values revealed in kilograms, tonnes or metres, only the first tap counting, and "See result" on the last question.
- Added the compare-dinosaurs quiz card on the home page, the shipped dinosaur list, fair-pair round generation and the question screen, with the turn-sideways picture in portrait (React, TypeScript, Vite).
- Added a Hello RexLab page and its tag release to Cloudflare Pages at rexlab.enoa.ai (LAB-265).
- Added MVP infrastructure notes: static Cloudflare Pages app, client-side quiz, no backend.
- Started RexLab, inspired by [Mesoris](https://mesoris.com/ru).
