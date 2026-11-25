# Tap safety

A child of 5–7 often taps twice. In RexLab a quick double tap does what one
tap does: its second tap never opens a screen twice and never presses
anything on the screen that appears next, such as a button of the museum
after a double tap on MUSEUM.

It is built from parts that do not know of each other. No screen waits for
its pictures and no button keeps a one-off guard against double taps; the
catalogue counts its start with the screen change, as keys and far taps
pass the filter. A leaving parent menu still catches taps while it
animates out.

## The parts

1. **Screen state.** App and each game module keep their screens with
   `useScreens(first, transitionFor)` from `src/screens.ts`, the only
   place screen state is written. It changes the screen through `go`,
   which knows nothing of pictures or input.
2. **Animation.** Each module's pure `transitionFor` gives each change its
   view transition type, or none. No call site names a transition type.
3. **Timers.** A timer that changes the screen later is stopped when its
   visit, board or puzzle ends, the game left included.
4. **Double taps.** One double-tap filter at the root of the app swallows
   the second tap of a double tap, by time and place: less than 500 ms and
   100 px from the release of the tap before it, timed by each event's own
   time, which `src/root.ts` hands it. It knows nothing of screens. Its
   exact behaviour (when the window opens, drags, repeated taps, keyboard)
   and its accepted costs are in `docs/features/double-tap.feature`.
5. **Pictures.** One `<Picture>` component holds a picture's place with a
   shimmer while it loads and fades it in once decoded, so no screen waits
   for its pictures before it changes (`docs/features/pictures.feature`).
   Every screen that shows a picture uses it, each with its own loading
   and failure behaviour.

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

An architecture test searches for every item but the last.

- `startTransition` or `addTransitionType` outside `src/screens.ts`.
- In App and the game modules, a `useState` or `useReducer` without its
  type written, or with a type whose name ends in `Screen`.
- `setTimeout`, `setInterval`, `Date.now()`, `performance.now()`, an
  argless `new Date()` or an event's `timeStamp` outside `src/root.ts`, or
  the service worker's own root, `src/offline/sw.ts`, which runs apart from
  the app and its taps.
- `waitForPictures` anywhere in `src/`, or a `LoadPicture` named in `src/`
  outside `src/Picture.tsx`, whose store alone calls the loader.
- A new guard against double taps on a single button. No search finds it;
  code review does.
