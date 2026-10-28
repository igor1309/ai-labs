import CallAppProcesses
import CallFolder
import Foundation
import struct MicrophoneCapture.AudioPiece
import Session
import struct SystemAudioCapture.AudioPiece
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionPiecesDefaultsTests {

    @Test func productionDefaultsRecordRecognizeDeliverAndWriteBothSides() async throws {

        try await withComposeFolder { root in
            let microphone = CaptureScript<MicrophoneCapture.AudioPiece>(
                first: .init(samples: [0.25, -0.5], sampleRate: 48_000),
                last: .init(samples: [0.125], sampleRate: 48_000), fails: false
            )
            let call = CaptureScript<SystemAudioCapture.AudioPiece>(
                first: .init(samples: [-0.25, 0.5], sampleRate: 48_000),
                last: .init(samples: [-0.125], sampleRate: 48_000), fails: false
            )
            defer { microphone.end(); call.end() }
            let mine = SessionRecognizer(name: "mine"), theirs = SessionRecognizer(name: "theirs")
            let pieces = SessionPieces(
                folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
                processes: CallAppProcesses(app: "meeting", list: SessionProcessList(answer: .success([]))),
                startMicrophone: { try microphone.start() },
                startCall: { _ in try call.start() },
                microphoneRecognizer: mine, callRecognizer: theirs, missingModels: { [] }
            )
            do {
                let folder = try await pieces.create()
                try await pieces.microphoneTrack.open(in: folder)
                try await pieces.callTrack.open(in: folder)
                try await pieces.transcript.open(in: folder)
                try await pieces.start(enabled: true)
                let writing = try #require(await pieces.writing)
                var updates = writing.updates.makeAsyncIterator()
                while let state = await updates.next() {
                    if state.status == .listening { break }
                }
                try await pieces.microphoneCapture.start()
                try await pieces.callCapture.start(selection: .everyAppButAudelin)
                await mine.heard.next()
                await theirs.heard.next()

                try await pieces.microphoneCapture.stop()
                try await pieces.callCapture.stop()
                try await pieces.microphoneTrack.close()
                try await pieces.callTrack.close()
                try await pieces.stop()
                try await pieces.transcript.close()

                // Lossless delivery retains the intermediate revisions before completion.
                var last = await updates.next()
                while let state = await updates.next() { last = state }
                let delivered = try #require(last)
                #expect(delivered.status == .finished)
                #expect(delivered.entries.map(\.speaker) == [.mine, .theirs])
                #expect(delivered.entries.map(\.text.settled) == ["mine final", "theirs final"])
                #expect(delivered.entries.map(\.text.pending) == ["", ""])
                #expect(await mine.chunks.flatMap(\.samples) == [0.25, -0.5, 0.125])
                #expect(await theirs.chunks.flatMap(\.samples) == [-0.25, 0.5, -0.125])
                #expect(await mine.finishes == 1)
                #expect(await theirs.finishes == 1)
                let destination = URL(fileURLWithPath: folder.id)
                #expect(try recordedSamples(destination.appendingPathComponent("microphone.caf")) == [0.25, -0.5, 0.125])
                #expect(try recordedSamples(destination.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
                #expect(try String(contentsOf: destination.appendingPathComponent("transcript.md"), encoding: .utf8)
                    == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
            } catch {
                microphone.end()
                call.end()
                try? await pieces.microphoneCapture.stop()
                try? await pieces.callCapture.stop()
                try? await pieces.microphoneTrack.close()
                try? await pieces.callTrack.close()
                try? await pieces.stop()
                try? await pieces.transcript.close()
                throw error
            }
        }
    }
}
