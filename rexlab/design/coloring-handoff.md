# Dinosaur colouring design proposal

Visual review proposal, not a shipped game or approved final illustration.

The Pen document open in this task's checkout contains 30 new screen/state
frames and a reusable stegosaurus illustration. The frames use the existing
Field Guide Midnight tokens and Nunito, uppercase child-facing labels,
picture/symbol controls and a paper canvas that follows the selected theme.

Workshop, gallery and result each have 1180×820, 744×1133, 393×852 and
852×393 layouts, with both theme variants. Russian is shown on landscape
iPad and portrait iPhone; English on portrait iPad and landscape iPhone.
The workshop keeps twelve colours, three round brush sizes, bucket, undo
and completion visible. Landscape phones move tools beside the canvas.
Their palette uses a compact four-column, three-row grid with 52-point
colour targets and a 252-point tool column; reclaimed width goes to the
drawing. Tablet palettes use centred 56-point targets instead of stretched
colour pills. Both theme variants share these arrangements.
The selected colour carries a check; selected brush size carries amber.
Painting is clipped to the silhouette; outlines and eyes stay above paint.

The gallery separates drafts and completed works with pencil/star symbols;
both remain editable. New picture creates an independent work. The repeated
thumbnail is sample art, not evidence that separate works share edits.
An empty gallery invites creation without inventing progress.

The first saved completion shows one star, the saved collection count and
a new collection best. Repeated completion shows the existing badge without
another star increment or best celebration. Result actions offer editing,
gallery, new work and home. The house header icon returns home. The score
never judges artistic quality.

Saving freezes edits and completion until success or failure. Empty paint
disables completion. Save failure keeps the current revision in memory and
offers retry, editing and home without saving. Leaving unsaved requires an
explicit loss confirmation; do not silently discard the current revision.
The durable previous revision remains available after an unsuccessful save.

Transitions use existing shared motion tokens. The dinosaur gently moves
with its own painted appearance after a durable completion; the star flies
to the count once. Reduced motion uses short fades. Offline operation does
not imply a save failure: local durable storage is sufficient.

Validation: inspected rendered workshop layouts, gallery, reward, repeated
reward, saving and save-error screens. Corrected illustration scaling,
removed its generated background and widened phone landscape tools. Exported
all screen states to a PDF and portable HTML for recovery and review.
Physical iPad touch testing remains deferred; no child usability or runtime
performance test is claimed. The generated illustration still needs visual
acceptance and production cleanup into fill regions and protected layers.

The editable design is saved in `rexlab.pen`. The native AXDocument check
now resolves to this checkout's exact document URL and File → Save succeeds.
This resolves the earlier accessibility blocker. Revised PDF/HTML exports
include the compact palettes from the owner's visual review feedback.
