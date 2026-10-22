# Preview apps

Small apps that run one feature in isolation, driven by a mock instead of the
recorder and the recogniser, to try it by hand: scrolling, selecting,
timing. They live in their own package so the product's targets never depend
on them.

| App | Feature | Mock |
|---|---|---|
| `PanelPreview` | The live panel (`PanelUI`) | `FakeCall`: a scripted call that advances one chunk per step |

Run one with `swift run PanelPreview` from this folder; `swift test` runs the
mocks' tests.

## Adding one

- One executable target per feature, named `<Feature>Preview`, depending on
  `PreviewKit` and the feature's product from the main package.
- Wrap the feature in `PreviewWindow`: the feature over the desktop tint on the
  left, the mock's controls in a form on the right, and a light/dark switch.
  Call `PreviewApp.bringToFront()` in the app's `init`.
- The mock is a value: the app holds it in `@State`, feeds it the feature's
  events and renders its `state`. That keeps the mock testable without a
  window, in `<Feature>PreviewTests`.
- A mock other apps need moves into its own library target here.
