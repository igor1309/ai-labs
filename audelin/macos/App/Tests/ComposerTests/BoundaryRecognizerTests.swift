import BlockingTestWork
import Composer
import Foundation
import SessionRehearsal
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct BoundaryRecognizerTests {
    @Test func sessionRecordsWhileGettingReadyThenReadsBothTracksFromStart() async throws {
        let mine = SessionRecognizer(name: "mine"), theirs = SessionRecognizer(name: "theirs")
        let beganMine = Signal(), beganTheirs = Signal(), release = DrainGate()
        defer { beganMine.end(); beganTheirs.end(); release.release() }
        try await withComposition(configure: { boundary in
            boundary.recognizers = FixtureRecognizers(source: { side in
                if side == .microphone { beganMine.send() } else { beganTheirs.send() }
                await release.wait()
                return RehearsalRecognizer(side == .microphone ? mine : theirs)
            }, missing: { [] }, load: { Task {} })
        }) { rig in
            try await rig.start()
            await beganMine.next(); await beganTheirs.next()
            _ = try await rig.panel { if case .preparing = $0.log { true } else { false } }
            #expect(await mine.chunks.isEmpty)
            #expect(await theirs.chunks.isEmpty)
            let folder = rig.folder()
            try await waitUntil("both tracks record while the recognizers prepare") {
                let microphone = try? await recordedSamples(folder.appendingPathComponent("microphone.caf"))
                let call = try? await recordedSamples(folder.appendingPathComponent("call.caf"))
                return microphone == [0.25, -0.5] && call == [-0.25, 0.5]
            }
            #expect(await mine.chunks.isEmpty)
            #expect(await theirs.chunks.isEmpty)
            release.release()
            await mine.heard.next(); await theirs.heard.next()
            try await rig.stop()
            #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
            #expect(await mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
            #expect(await theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.125])
            #expect(try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) }
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }
}
