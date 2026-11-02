import BlockingTestWork
import Composer
import Foundation
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallRecordingTranscriptTests {
    @Test func detectedCallLeavesBothTracksAndAFinishedTranscript() async throws {
        let binding = CallBinding(fails: false, input: false), deadlines = FixtureDeadlines()
        let microphone = FedCapture(), call = FedCapture()
        defer { microphone.end(); call.end(); deadlines.end() }
        let mine = Array(repeating: Float(0.25), count: 4_800)
        let theirs = Array(repeating: Float(-0.5), count: 4_800)

        try await withComposition(preferences: {
            .init(automaticRecording: true, liveText: true, callsFolder: $0)
        }, configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            boundary.time = deadlines.time(over: boundary.time)
            boundary.microphone = FixtureMicrophone { microphone.started }
            boundary.callAudio = FixtureCallAudio { _ in call.started }
        }) { rig in
            binding.setInput(true)
            _ = try await rig.state { $0.phase == .recording }
            microphone.send(mine)
            call.send(theirs)
            await rig.mine.heard.next()
            await rig.theirs.heard.next()

            binding.setInput(false)
            await deadlines.fire()
            _ = try await rig.state { $0.phase == .idle && !$0.callOn }

            let name = "1970.01.01-0000 Zoom"
            #expect(try await offPool {
                try FileManager.default.contentsOfDirectory(atPath: rig.root.path).sorted()
            } == [name, "preferences.json"])
            let folder = rig.folder(name)
            #expect(await offPool { isFolder(folder.path) })
            let microphoneTrack = try await audioFile(folder.appendingPathComponent("microphone.caf"))
            let callTrack = try await audioFile(folder.appendingPathComponent("call.caf"))
            #expect(microphoneTrack.sampleRate == 48_000)
            #expect(microphoneTrack.samples == mine)
            #expect(callTrack.sampleRate == 48_000)
            #expect(callTrack.samples == theirs)
            #expect(try await transcriptText(of: rig, folder: name)
                == "# Transcript\n\n**Me** 00:00:00\nmine final\n\n**Them** 00:00:00\ntheirs final\n")
        }
    }
}
