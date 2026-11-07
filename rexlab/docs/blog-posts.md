# Blog posts

How to write a post about a RexLab change, such as a redesign or a new game.

## Pictures are required

A post about anything a child can see shows it. Every screen the post
describes has a screenshot next to the words about it; a post without
pictures of a visual change is not ready for review.

- Take the screenshots from a fresh build of the released code, the way
  `showcase/AGENTS.md` describes: `npm run build`, `npx vite preview --port
  4799`, then a Playwright script at iPad landscape (1180×820) at 2x, in
  English. `showcase/screenshots.mjs` is a starting point; add the screens the
  post needs.
- Show light and dark where the theme matters, and a phone or upright iPad
  where the post talks about other devices.
- Screens that start blank (DIG, FIND THE PAIR's welcome) are shown in play
  or left out; never publish an empty board.
- Convert each to WebP with `cwebp -q 82 -resize 1600 0`.
- Look at every picture before using it: right screen, nothing cut off, no
  debug state, no placeholder art.
- Keep the pictures beside the post and give each alt text that says what it
  shows.

## Words

- Write for parents and curious readers, not for developers: what changed for
  the child and why.
- Take facts from `docs/log.md` and the code, not from memory; dinosaur facts
  follow `docs/sources.md`.
- Name games as the app does, in capitals (FIND THE PAIR, WHOSE JAW?).
- End with the live link, https://rexlab.enoa.ai.

## Review

Igor approves each post, with its pictures, before it is published.
