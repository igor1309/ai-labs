# Blog publication checklist

Use this for a new blog post or showcase article, and repeat it after substantive
edits. Keep the completed review beside the draft or in its issue. These are
editorial checks performed by a reviewer; they are not an automated CI gate.

## Establish the destination

- Name the channel, audience, language and approximate length before drafting.
  Use explicit user instructions first, then the destination's existing voice
  guide. If neither establishes a destination, label the draft's assumption.
- The Dragoman has its own [Russian voice guide](../../dragoman/docs/post-pipeline/voice-guide.md).
  Do not treat an English engineering note as ready for that channel, or apply
  its Russian requirement to every other destination.
- A suggested schedule is not permission to publish. Keep drafting, review and
  publication as separate actions; publish only when authorized.

## Read the prose

- One central observation, one concrete example and an earned ending. Cut
  release-note lists, repeated explanations, internal process and generic advice.
- Explain unfamiliar terms on first use. Prefer descriptive source links over
  bare PR numbers. Check grammar, idiom, paragraph rhythm and the chosen voice.
- Respect the requested length; record the actual word count. No universal word
  limit substitutes for the audience and channel.
- First-person claims must reflect the author's documented work. Do not invent
  personal experience, results, quotes or motivations to make the post lively.

## Check the claims and links

- Trace every technical or numerical claim to a source actually read. Distinguish
  local timings from CI measurements, examples from totals, and emulation from
  physical-device evidence. Record caveats adjacent to the claim.
- Check that the described change shipped or merged if the post says it did.
- Open reader-facing links without credentials where possible; record when only
  authenticated access was checked. A private source can support internal review
  but cannot serve as a public reader's evidence link.
- Review text and images for credentials, personal information, private URLs,
  internal discussions and material the author has no right to publish.

## Review the visuals

- Include a visual when it explains something the prose cannot show as quickly;
  otherwise record why none is needed. Avoid decorative images added to meet a quota.
- Prefer a real product screenshot for product claims. Label a schematic or
  generated illustration clearly; never present it as a screenshot or test result.
- Inspect the exported image. Check clipping, contrast, label size, spelling and
  whether it remains readable at the intended display width. For text-heavy
  diagrams, provide a full-size image and an equivalent explanation in prose.
- Supply alt text, a caption, source/rights information, and the actual image
  file. A local path or an image placeholder is not a delivered visual.

## Review the publication page

- Preview the final text and assets in the actual destination at a narrow phone
  width (about 375 px) and desktop width (about 1280 px), or its equivalent preview.
  Check image scaling, readable labels, paragraph breaks, links, alt text and
  horizontal overflow. Record the preview URL or screenshots and review date.
- Confirm title, excerpt and social image where the destination supports them;
  mark unsupported features not applicable with a reason.
- If the destination is unknown or inaccessible, report “editorially reviewed;
  destination preview pending”, not “ready for publication”.
- Mark “ready for publication” only after applicable checks pass. The final
  publishing action still follows the user's authorization.

## Copyable review record

```text
Draft/revision and review date:
Destination / audience / language / voice guide:
Requested length / actual word count:
Central observation:
Evidence reviewed / numerical caveats / merge status:
Reader-facing links / anonymous access checked:
Privacy and image rights:
Visual file / caption / alt text / image inspection:
Phone and desktop destination preview evidence:
Title / excerpt / social image (or reason not applicable):
Verdict: needs revision | editorially reviewed, destination preview pending | ready for publication
Remaining checks and who or what resolves them:
Publishing authorization:
```

Automation may check file existence, links and markup. It cannot certify voice,
truthfulness, image usefulness or destination rendering by counting words or
finding a checklist heading. Keep those judgments explicit in the review record.
