import Testing
@testable import SideText

/// Updates replace unread ones, so whether an id was left out can only be
/// told where each hearing arrives.
struct ReturningIDTests {

    @Test func anIDLeftOutAndBroughtBackIsANewEntryAndAKeptOneStaysTheSame() async {

        let text = ScriptedText([
            [Text(id: 0, start: 2, end: 3, pending: "old"), Text(id: 1, start: 4, end: 5, pending: "kept")],
            [Text(id: 1, start: 4, end: 5, pending: "kept")],
            [Text(id: 0, start: 12, end: 13, pending: "new"), Text(id: 1, start: 4, end: 6, pending: "kept more")],
            [Text(id: 0, start: 12, end: 14, pending: "new more"), Text(id: 1, start: 4, end: 6, pending: "kept more")],
        ])
        let audio = CueAudio()
        let side = SideText(audio: audio, text: text, fillIn: { NoFill() })

        await side.start()
        for await state in side.updates where state.status == .listening { break }
        for second in 0..<4 { await audio.send(Audio(start: Double(second), samples: [0], sampleRate: 1)) }
        let entries = await side.state.entries.map(\.text)

        #expect(entries.map(\.pending) == ["new more", "kept more"])
        #expect(entries[1].id == 1)
        #expect(![0, 1].contains(entries[0].id), "the returning id reads as the old entry")
        audio.end()
        await side.stop()
    }
}

private actor ScriptedText: LiveText {

    private var script: [[Text]]

    init(_ script: [[Text]]) { self.script = script }

    func hear(_ audio: Audio) -> TextUpdate { TextUpdate(final: [], tail: script.isEmpty ? [] : script.removeFirst()) }
    func cancelHearing() {}
    func finish() -> TextUpdate { TextUpdate(final: [], tail: []) }
    func stop() {}
}

private struct NoFill: FillingIn {

    func fillIn(from: Double, receive: @escaping @Sendable (FilledText) async -> Void) {}
    func abandon() {}
}
