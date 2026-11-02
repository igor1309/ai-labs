import Composer
import LiveText
import Testing

/// However long the call, a word only changes the text it belongs to.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct TrackTextDeltaTests {

    @Test(arguments: [20, 800, 6_000])
    func keepsTextAcrossRevisionsAdvanceAndFinish(count: Int) async throws {

        let words = (0...count).map { Word("word\($0).", start: Double($0 * 3), end: Double($0 * 3) + 0.5) }
        let start = Double(count * 3)
        let recognizer = ScriptRecognizer(hearings: [
            .success(Hearing(words: words, finalThrough: words.last!.end)),
            .success(Hearing(words: [Word("draft", start: start + 0.5, end: start + 1)])),
            .success(Hearing(words: [Word("next.", start: start + 4, end: start + 4.5)], finalThrough: start + 4.5)),
        ], endings: [.success(Hearing(words: [Word("last", start: start + 4.5, end: start + 5)]))])
        let microphone = FedCapture()
        defer { microphone.end() }
        try await withComposition(recognizers: (recognizer, SessionRecognizer(name: "theirs")), configure: { boundary in
            boundary.microphone = FixtureMicrophone { microphone.started }
        }) { rig in
            try await rig.start()
            microphone.send([0])
            _ = try await rig.panel { entries(of: $0).contains { $0.speaker == .me && $0.settled == "word\(count)." } }
            microphone.send([1])
            _ = try await rig.panel { entries(of: $0).contains { $0.speaker == .me && $0.settled == "word\(count)." && $0.pending == "draft" } }
            microphone.send([2])
            let advanced = try await rig.panel { entries(of: $0).contains { $0.speaker == .me && $0.settled == "next." } }
            let mine = entries(of: advanced).filter { $0.speaker == .me }
            #expect(mine.count == count + 2)
            #expect(mine.first?.settled == "word0.")
            #expect(mine[count].settled == "word\(count). draft")
            try await rig.stop()
            #expect(await recognizer.chunks.count == 3)
            #expect(await recognizer.finishes == 1)
            let transcript = try await transcriptText(of: rig)
            #expect(transcript.contains("word0."))
            #expect(transcript.contains("word\(count). draft"))
            #expect(transcript.contains("next. last"))
            #expect(!transcript.contains("failed"))
        }
    }
}
