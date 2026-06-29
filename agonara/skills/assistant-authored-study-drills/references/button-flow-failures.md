# Button-flow failures

Session lesson: in Telegram button quizzes, a `clarify` tool result can sometimes look as if the learner already answered, even when no distinct user message has appeared in chat yet.

## Recovery pattern

- Treat `clarify` first as **delivery**, not evidence of a completed response.
- If the runtime appears to auto-populate `user_response` immediately, do not trust it blindly.
- Pause the drill and check whether the learner actually sent a separate answer.
- If the flow is visibly broken, re-anchor with one short reset message and then re-issue the current question.
- Do not continue grading or advancing through the series on top of a suspicious tool payload.
- Do not leave the chat with a one-word grading stub (`Верно.`, `Да.`) unless the next question is truly being delivered in the same turn.

## User-specific expectation

For this user, transport glitches are much less costly than chat clutter. When the button flow is unstable, the safer behavior is:

1. acknowledge the glitch briefly,
2. reset the question cleanly,
3. then go back to one-button-card-at-a-time delivery.

Verbose self-diagnosis during the live drill is counterproductive; keep the explanation short and restore the interaction.