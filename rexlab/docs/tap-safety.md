# Tap safety

A child of 5–7 often taps twice. In RexLab a quick double tap does what one
tap does: its second tap never opens a screen twice and never presses
anything on the screen that appears next. The rule came from MUSEUM on the
home page (LAB-290): a double tap opened the museum once, but its second
tap could have landed on a button of the museum.

## Four parts, each on its own

1. **Screen state.** A tap that changes the screen changes it at once.
   Each module that has screens (App and each game) keeps them with
   `useScreens(first, transitionFor)` from `src/screens.ts`, which gives
   the screen showing and `go(next)`, the only way to change it. `go`
   takes a screen and nothing else, and nothing waits for pictures
   before it. A timer a screen starts to change the screen later (a
   reveal, a departure, a celebration) is stopped when that screen is
   left, so it never changes a screen the child has gone from.
2. **Animation.** Each module passes `useScreens` a pure
   `transitionFor(from, to)` that gives the view transition type of each
   change: the next question, a page closing to its card, a page sliding
   left or right, or a plain screen change. `go` applies the type it
   gives, in the same React transition as the change; no caller names a
   type.
3. **Pictures.** One `<Picture>` component shows every picture. While the
   picture loads it holds its place, with a shimmer unless its screen
   says otherwise (a body that fades in over its skeleton holds none),
   and it fades the picture in once decoded. A picture that fails shows
   what its screen gives for it: the dinosaur symbol on a card, nothing
   behind a skeleton. Loading pictures ahead (a page's neighbours) is
   `<Picture>`'s too. Nothing else knows where pictures come from or
   when they arrive.
4. **Double taps.** One input filter at the root of the app works on
   presses, a finger or pointer going down. A press that comes less than
   500 ms after the last press that counted, and less than 100 px from
   it, is the second tap of a double tap: the filter swallows its whole
   gesture, the press, any drag that follows, the release and its click.
   Any other press counts. The filter reads the clock `src/root.ts`
   injects and knows nothing of screens: a quick tap elsewhere is a new,
   deliberate tap, on whatever screen is showing. Actions inside a
   screen keep the states their games give them.

## Why 500 ms and 100 px

Platforms recognise a double tap by time and place: a window of 300 to
500 ms (Android and Hammer.js 300 ms, WebKit's media controls 350 ms,
React Native Gesture Handler 500 ms) and Android's double-tap slop of
100 dp. No study measures how far apart a child of 5–7 taps twice by
accident; 500 ms takes the cautious end. If deliberate taps are lost on
an iPad, lower it toward 350 ms. Sources: Nácher et al., IJHCS 73:37–51,
2015 (children of 2–3, 300 ms); Guerreiro, PhD thesis, 2014,
arXiv:1402.1036, section 6 (about 400 ms, some up to 750 ms).

## Forbidden

- `startTransition` or `addTransitionType` outside `src/screens.ts`, or a
  screen state written other than through `go`.
- A call of `waitForPictures` anywhere but `<Picture>`, or of the loader
  `src/root.ts` makes with `decodedPictures`.
- A one-off guard on a single button.
- `setTimeout`, `setInterval`, `Date.now()`, `performance.now()` or an
  event's `timeStamp` outside `src/root.ts`; screens and games use the
  timer and clock it injects.

## How it is checked

- `docs/features/double-tap.feature` (LAB-298): a double tap on one
  control of each kind opens one screen and presses nothing on it. Its
  rows are examples: the filter covers every control by sitting at the
  root, not by a list.
- Unit tests of each part on its own (LAB-299): `useScreens` as plain
  state, each module's `transitionFor` as a table, `<Picture>` with
  pictures that load, fail or never arrive, a screen's timer stopped as
  the screen is left, and the filter with a fake clock.
- An architecture test (LAB-300) fails on each forbidden item above,
  with a message pointing here.
