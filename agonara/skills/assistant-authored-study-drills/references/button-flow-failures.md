# Button-flow failures

Session calibration note for this user. The **rules** for button delivery — including how an immediate `clarify` `user_response` is treated and how a timed-out card is recovered — live in the `button-quiz-loop` skill; follow that, not this file. This note only records one user-specific preference.

## User-specific expectation

For this user, transport glitches are far less costly than chat clutter. When the button flow is visibly unstable, keep the repair minimal: acknowledge the glitch in one short line, re-anchor the current question, and return to one-button-card-at-a-time delivery. Verbose self-diagnosis during a live drill is counterproductive — keep it short and restore the interaction.
