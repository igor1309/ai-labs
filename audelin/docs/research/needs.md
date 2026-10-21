# Needs

## Scenario

Calls are in Russian with English professional terms and abbreviations
(RACI, OKR, SLA). During a call the owner watches a live transcript, selects
an unfamiliar term together with its sentence, and gets a short Russian
explanation.

## Must

1. Live transcript of both sides: microphone and the call's system audio.
2. Text appears while people speak and grows smoothly — phrases settle in
   place instead of arriving as jumping blocks.
3. Russian speech with English terms kept recognisable (Latin, not
   "оК и ОР" for OKR).
4. Text stays selectable while the transcript keeps updating; appending must
   not drop the selection.
5. The transcript window stays visible beside the call window (floating, can
   sit on top), compact, with no extra UI.
6. Recording stops when the call ends.
7. Local speech recognition on this Mac (Apple Silicon, 36 GB).

## Constraints from the owner

- No subscriptions: not $8.49/mo Superwhisper Pro, not $10/mo Raycast Pro.
- No hand-maintained vocabulary of terms; terms are unknown in advance.
- Second priority: explaining the selected term. Explanations and summaries
  go to bb (`bb thread spawn`, a new thread per request), not to Raycast.
- Summaries come after the call from the full transcript; not part of the
  live path.

## Explanation prompt (for later)

«В выделенном фрагменте разговора найди профессиональный термин или
аббревиатуру. Дай расшифровку и объясни смысл по-русски с учётом контекста.
Ответ — максимум 40 слов. Английское название сохрани. При неоднозначности
укажи наиболее вероятное значение и отметь предположительность».
