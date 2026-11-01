import CallAppProcesses
import CallFolder
import Darwin
import Foundation
import struct MicrophoneCapture.AudioPiece
import Session
import Synchronization
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionSelectionTests {

    @Test func everyAppButAudelinExcludesThisProcess() async throws {

        try await withSessionRig { rig, folder in
            let made = try await rig.pieces.create()
            try await rig.pieces.callTrack.open(in: made)
            try await rig.pieces.callCapture.start(selection: .everyAppButAudelin)
            try await rig.pieces.callCapture.stop()
            try await rig.pieces.callTrack.close()
            #expect(rig.selections.all == [.allExcept([getpid()])])
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5, -0.125])
        }
    }

    @Test(arguments: [false, true])
    func selectionIDsRetainTheirOwnAnswer(allExcept: Bool) async throws {

        try await withComposeFolder { root in
            let list = ChangingProcesses()
            let processes = CallAppProcesses(app: "meeting", list: list)
            let microphone = CaptureScript<MicrophoneCapture.AudioPiece>(
                first: .init(samples: [], sampleRate: 48_000), last: .init(samples: [], sampleRate: 48_000), fails: false
            )
            let call = CaptureScript<SystemAudioCapture.AudioPiece>(
                first: .init(samples: [0.5], sampleRate: 48_000), last: .init(samples: [0.25], sampleRate: 48_000), fails: false
            )
            defer { microphone.end(); call.end() }
            let selections = Values<SystemAudioCapture.ProcessSelection>()
            func pieces() -> SessionPieces {
                SessionPieces(
                    folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
                    processes: processes, startMicrophone: { try microphone.start() },
                    startCall: { selections.append($0); return try call.start() },
                    microphoneRecognizer: SessionRecognizer(name: "mine"), callRecognizer: SessionRecognizer(name: "theirs"),
                    missingModels: { [] }
                )
            }
            let recording = pieces()
            let folder = try await recording.create()
            list.answer.withLock { $0 = [AudioProcess(pid: 17, bundleID: nil, name: allExcept ? "Audelin" : "meeting", isAudelin: allExcept)] }
            let first = try await recording.select()
            list.answer.withLock { $0 = [AudioProcess(pid: 42, bundleID: nil, name: "meeting", isAudelin: false)] }
            let second = try await recording.select()
            #expect(first != second)
            let otherRecording = pieces()
            let foreign = try await otherRecording.select()
            await #expect(throws: SessionPieces.Failure.unknownSelection(foreign.id)) {
                try await recording.callCapture.start(selection: .chosen(foreign))
            }
            try await recording.callTrack.open(in: folder)
            try await recording.callCapture.start(selection: .chosen(first))
            try await recording.callCapture.stop()
            try await recording.callTrack.close()
            #expect(selections.all == [allExcept ? .allExcept([17]) : .only([17])])
            #expect(try await recordedSamples(root.appendingPathComponent("1970.01.01-0000/call.caf")) == [0.5, 0.25])
        }
    }
}

private final class ChangingProcesses: ProcessList, Sendable {

    let answer = Mutex<[AudioProcess]>([])

    func processes() -> [AudioProcess] { answer.withLock { $0 } }
}
