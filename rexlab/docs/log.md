# rexlab — Change Log

## 2026-10-16

- Added English and Russian: interface text from typed dictionaries, dinosaur names in both languages, values written with the chosen language's numbers and units, the device language first, and a small "EN | RU" switch for parents on the home page, remembered in `localStorage`.
- Added the result screen: the score as a number and in stars, the best score, first-best and new-best celebrations, Play again and Home, and progress kept in `localStorage` in the versioned record, read and saved on a best-effort basis.
- Added answering a question: a pressed card, ✓ and ✗ marks in colour, both values revealed in kilograms, tonnes or metres, only the first tap counting, and "See result" on the last question.
- Added the compare-dinosaurs quiz card on the home page, the shipped dinosaur list, fair-pair round generation and the question screen, with the turn-sideways picture in portrait (React, TypeScript, Vite).
- Added a Hello RexLab page and its tag release to Cloudflare Pages at rexlab.enoa.ai (LAB-265).
- Added MVP infrastructure notes: static Cloudflare Pages app, client-side quiz, no backend.
- Started RexLab, inspired by [Mesoris](https://mesoris.com/ru).
