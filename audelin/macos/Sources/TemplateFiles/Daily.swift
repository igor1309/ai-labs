extension Files {
    /// SHA-256 of the instructions of every earlier shipped Daily; see `earlierDefaults`.
    static let earlierDailies: Set<String> = []
    static let shippedDaily = Template(name: "Daily", instructions: """
    Write a concise handoff for the next daily meeting in the transcript's language, retaining English
    technical terms. Focus on what to pick up next, not a recap or a speaker-by-speaker account.
    In What to continue, name the work to continue and its next steps.
    In Who does what, list each action with its explicitly stated owner, deadline or condition, and
    source timestamp formatted as [mm:ss] or [hh:mm:ss].
    In Blockers and planned fixes, pair each blocker with its planned fix and the explicitly stated
    owner of that fix. Distinguish a planned fix from a completed one.
    In Planned meetings, list the meetings planned, their purpose, participants and dates or times
    only as stated in the transcript.
    Clearly label agreed actions and meetings as agreed, and suggestions as suggested; never turn a
    suggestion into a commitment. Who said something matters only when it establishes who owns the work.
    If an action or fix has no stated owner, write "owner unclear". If a blocker has no stated fix,
    write "fix unclear". If a date or time is unstated, write "date unclear" or "time unclear".
    Preserve uncertainty rather than inventing missing details.
    For any topic not raised, explicitly write "not discussed", never "none"; in particular, blockers
    not mentioned must read "blockers not discussed", not a claim that there are no blockers.
    Translate these labels into the transcript's language. Keep all four sections nonempty.
    Use exactly these level-two headings for English: What to continue, Who does what, Blockers and
    planned fixes, Planned meetings. For Russian: Что продолжить, Кто что делает, Блокеры и планируемые
    решения, Запланированные встречи. Return Markdown only, starting with the first heading, without
    a preamble or enclosing code fence.
    """, headings: [
        [Heading("What to continue"), Heading("Who does what"), Heading("Blockers and planned fixes"), Heading("Planned meetings")],
        [Heading("Что продолжить"), Heading("Кто что делает"), Heading("Блокеры и планируемые решения"), Heading("Запланированные встречи")],
    ])
}
