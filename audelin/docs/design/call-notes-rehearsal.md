# Settings rehearsal comparison

Before summary logic or production wiring, ran from `audelin/macos`:

```sh
scripts/rehearsal.sh all --out <evidence-directory>
```

The command exited 0 and exported 34 images: all 17 Settings states in both
appearances. Visually inspected all images, including the six existing Recording
states. Compared all 11 new Call notes states with the committed design exports.
The loading and load-failed layouts match their content bounds. All runtime
cards, fields, complete disclosures, banners, footer actions and checkbox values
are visible in the remaining states, with no clipping or black margins.

Initial comparison found a clipped hosted-API disclosure and enabled Save in the
saved preview. Both were corrected; native action tests prove saved Save cannot
submit, and rendered text tests check the entire disclosure. The native menu
affordance differs from the drawn chevron as planned. Native text control metrics
make loaded layouts 6–7 pt taller than the design; spacing, width and wrapping
remain consistent, and the production container can scroll. This is a visual
comparison, not a claim of pixel equality.

The external host exports Retina images with its display ICC profile, while the
sandbox exported 1x sRGB. Comparison copies were converted to sRGB and normalized
to 668 pt width; originals were preserved. This avoids treating display color
encoding or pixel density as a UI color/layout change.

Focused external verification passed: 11 tests across CallNotesInteractionTests
and CallNotesRenderTests, including 22 appearance/state OCR cases. Native control
tests assert exact labels and editable values. OCR copy assertions normalize only
Vision's visually identical Ukrainian І/і in mixed Russian/API text. Tab labels
are checked through native accessibility because full-window OCR intermittently
omits or misreads the selected tab. Existing Settings render tests passed in the
external full-suite run. Its new OCR failures were corrected and rerun focused.

The Agister builder completed. The workflow's repair handoff then failed parsing
a UTF-8 test-output prompt; its external test record was preserved. Sandbox-only
Vision/Core ML/device failures were not treated as production failures: those
existing suites passed externally. No unrelated component was changed to hide
them. Python rehearsal tooling tests and CI path-selection tests passed.

This checkpoint approves the Settings presentation phase. Runtime, persistence,
recording handoff and production wiring follow it in the same PR.

After wiring and native-control repairs, repeated `rehearsal.sh all`: all 34
exports passed. Inspected all 12 Recording images and all 22 Call notes images
against the design in both appearances. Content, errors, status tones, disabled
actions and complete disclosures remain visible. The documented native-menu and
text-metric differences remain; no new layout difference was found. Additional
native probes passed for rejected/normalized live edits, both runtime menus,
updated callbacks, tab selection, keyboard and accessibility activation. Pixel
probes verify error outlines and all three status tones in both appearances.
