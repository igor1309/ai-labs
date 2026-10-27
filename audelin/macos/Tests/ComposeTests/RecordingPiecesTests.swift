import CoreAudioProcesses
import Darwin
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Preferences
import Recording
import Session
import Synchronization
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct RecordingPiecesTests {

    @Test func folderUsesStoredSnapshotAndSessionTimeZone() async throws {

        try await withComposeFolder { root in
            let rig = try RecordingPiecesRig(root: root)
            defer { rig.finish() }
            try rig.preferences.write(Preferences(callsFolder: root.appendingPathComponent("another")))
            rig.timeZone.value.withLock { $0 = TimeZone(secondsFromGMT: 3600)! }
            let folder = try await rig.makePieces(1).create()
            #expect(folder.id == rig.callsURL.appendingPathComponent("1970.01.01-0100").path)
            var directory: ObjCBool = false
            #expect(FileManager.default.fileExists(atPath: folder.id, isDirectory: &directory))
            #expect(directory.boolValue)
        }
    }

    @Test func lastAppIsReadAtBuildAndKeptByThatSession() async throws {

        try await withComposeFolder { root in
            let rig = try RecordingPiecesRig(root: root)
            defer { rig.finish() }
            rig.callApp.started("meeting")
            let first = rig.makePieces(1)
            rig.callApp.started("other")
            let second = rig.makePieces(2)
            let firstSelection = try await first.select()
            let secondSelection = try await second.select()
            for (pieces, selection) in [(first, firstSelection), (second, secondSelection)] {
                let folder = try await pieces.create()
                try await pieces.callTrack.open(in: folder)
                try await pieces.callCapture.start(selection: .chosen(selection))
                try await pieces.callCapture.stop()
                try await pieces.callTrack.close()
            }
            #expect(rig.selections.all == [.only([72, 73]), .only([99])])
        }
    }

    @Test func manualSessionWithoutAnAppFallsBackToEveryAppButAudelin() async throws {

        try await withComposeFolder { root in
            let rig = try RecordingPiecesRig(root: root)
            defer { rig.finish() }
            let pieces = rig.makePieces(1)
            let state = await drive(.begin(liveText: false), pieces: pieces, state: SessionState())
            let ended = await drive(.end, pieces: pieces, state: state)
            #expect(state.phase == .recording)
            #expect(state.processes == .down)
            #expect(state.failures == [.init(piece: "processes", message: "noCallApp")])
            #expect(state.microphoneCapture == .up)
            #expect(state.callCapture == .up)
            #expect(rig.selections.all == [.allExcept([getpid()])])
            #expect(ended.phase == .ended)
            #expect(rig.microphones.all.first?.stops.all == [true])
            #expect(rig.calls.all.first?.stops.all == [true])
            #expect(rig.recognizers.all.isEmpty)
        }
    }

    @Test func missingKnownAppUsesTheCoreAudioListToExcludeAudelin() async throws {

        try await withComposeFolder { root in
            let rig = try RecordingPiecesRig(root: root)
            defer { rig.finish() }
            rig.callApp.started("unavailable")
            let pieces = rig.makePieces(1)
            let selection = try await pieces.select()
            let folder = try await pieces.create()
            try await pieces.callTrack.open(in: folder)
            try await pieces.callCapture.start(selection: .chosen(selection))
            try await pieces.callCapture.stop()
            try await pieces.callTrack.close()
            #expect(rig.selections.all == [.allExcept([getpid()])])
            #expect(try recordedSamples(URL(fileURLWithPath: folder.id).appendingPathComponent("call.caf")) == [-0.25, -0.5])
        }
    }

    @Test func twoIDsHaveIndependentFoldersSelectionsAndCaptures() async throws {

        try await withComposeFolder { root in
            let rig = try RecordingPiecesRig(root: root)
            defer { rig.finish() }
            rig.callApp.started("meeting")
            let first = rig.makePieces(1), second = rig.makePieces(2)
            #expect(first !== second)
            let firstFolder = try await first.create(), secondFolder = try await second.create()
            #expect(firstFolder.id == rig.callsURL.appendingPathComponent("1970.01.01-0000").path)
            #expect(secondFolder.id == rig.callsURL.appendingPathComponent("1970.01.01-0000-2").path)
            let foreign = try await first.select()
            await #expect(throws: SessionPieces.Failure.unknownSelection(foreign.id)) {
                try await second.callCapture.start(selection: .chosen(foreign))
            }
            for (pieces, folder) in [(first, firstFolder), (second, secondFolder)] {
                try await pieces.microphoneTrack.open(in: folder)
                try await pieces.microphoneCapture.start()
            }
            try await first.microphoneCapture.stop()
            let captures = rig.microphones.all
            #expect(captures.count == 2)
            #expect(captures[0].stops.all == [true])
            #expect(captures[1].stops.all.isEmpty)
            try await second.microphoneCapture.stop()
            try await first.microphoneTrack.close()
            try await second.microphoneTrack.close()
            #expect(captures[1].stops.all == [true])
            for folder in [firstFolder, secondFolder] {
                #expect(try recordedSamples(URL(fileURLWithPath: folder.id).appendingPathComponent("microphone.caf")) == [0.25, 0.5])
            }
        }
    }

    @Test func sourcesAreLazyAndGiveEachSideItsOwnRecognizer() async throws {

        try await withComposeFolder { root in
            let rig = try RecordingPiecesRig(root: root)
            defer { rig.finish() }
            let first = rig.makePieces(1), second = rig.makePieces(2)
            #expect(rig.microphones.all.isEmpty)
            #expect(rig.calls.all.isEmpty)
            #expect(rig.recognizers.all.isEmpty)
            for pieces in [first, second] {
                let mine = try await pieces.microphoneRecognizerSource()
                let theirs = try await pieces.callRecognizerSource()
                _ = try await mine.hear(.init(samples: [0.25], sampleRate: 48_000))
                _ = try await theirs.hear(.init(samples: [-0.5], sampleRate: 48_000))
            }
            #expect(rig.recognizers.all.count == 4)
            for (index, recognizer) in rig.recognizers.all.enumerated() {
                #expect(await recognizer.chunks.map(\.samples) == [index.isMultiple(of: 2) ? [0.25] : [-0.5]])
            }
        }
    }

    @Test func observerSeesEachStartOnceBeforeForwardingAndRetainsLastApp() async throws {

        let app = RecordingCallApp(), observed = Values<String>(), beforeStarts = Values<String?>()
        let recording = await composeRecording(makePieces: { _ in
            preconditionFailure("Automatic recording is off")
        }, liveText: { false })
        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        let forwarding = CallRecordingSubscription(
            calls: source.stream, recording: recording,
            beforeCallStarted: { beforeStarts.append(app.current) },
            startedApp: { app.started($0); observed.append($0) }
        )
        for event in [CallEvent.started(app: "meeting"), .ended(app: "meeting"),
                      .started(app: "other"), .started(app: "other"), .ended(app: "other")] {
            source.continuation.yield(event)
        }
        source.continuation.finish()
        await forwarding.wait()
        await recording.end()
        #expect(observed.all == ["meeting", "other", "other"])
        #expect(beforeStarts.all == ["meeting", "other", "other"])
        #expect(app.current == "other")

        let detectedApp = RecordingCallApp(), detected = Values<String>()
        let detectorRecording = await composeRecording(makePieces: { _ in
            preconditionFailure("Automatic recording is off")
        }, liveText: { false })
        let processes = CoreAudioProcesses(binding: CallBinding(fails: false), clock: UnusedCallClock())
        defer { processes.stop() }
        let subscription = try composeCalls(processes, to: detectorRecording, startedApp: {
            detectedApp.started($0)
            detected.append($0)
        })
        processes.stop()
        await subscription.wait()
        await detectorRecording.end()
        #expect(detected.all == ["us.zoom.xos"])
        #expect(detectedApp.current == "us.zoom.xos")
    }
}

private func drive(_ input: SessionEvent, pieces: SessionPieces, state: SessionState) async -> SessionState {

    let handler = pieces.handler()
    var state = state, event = input
    while true {
        let (updated, effect) = SessionReducer.reduce(state, event)
        state = updated
        guard let effect else { return state }
        event = await handler.handle(effect)
    }
}

private struct RecordingPiecesRig: Sendable {

    let preferences: PreferencesStore
    let callsURL: URL
    let callApp = RecordingCallApp()
    let timeZone = RecordingPiecesTimeZone()
    let microphones = Values<RecordingPiecesCapture<MicrophoneCapture.AudioPiece>>()
    let calls = Values<RecordingPiecesCapture<SystemAudioCapture.AudioPiece>>()
    let selections = Values<SystemAudioCapture.ProcessSelection>()
    let recognizers = Values<SessionRecognizer>()
    let makePieces: @Sendable (UInt64) -> SessionPieces

    init(root: URL) throws {

        callsURL = root.appendingPathComponent("stored-calls", isDirectory: true)
        try FileManager.default.createDirectory(at: callsURL, withIntermediateDirectories: false)
        preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
        try preferences.write(Preferences(callsFolder: callsURL))
        let microphones = microphones, calls = calls, selections = selections, recognizers = recognizers, timeZone = timeZone
        makePieces = composeRecordingPieces(
            preferences: preferences, callApp: callApp,
            processes: CoreAudioProcesses(binding: RecordingPiecesBinding(), clock: RecordingPiecesClock()),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { timeZone.value.withLock { $0 } },
            startMicrophone: {
                try await startProductionMicrophone(makeCapture: {
                    let capture = RecordingPiecesCapture<MicrophoneCapture.AudioPiece>(
                        first: .init(samples: [0.25], sampleRate: 48_000), last: .init(samples: [0.5], sampleRate: 48_000)
                    )
                    microphones.append(capture)
                    return capture
                })
            },
            startCall: { selection in
                try await startProductionCallAudio(selection, makeCapture: {
                    selections.append($0)
                    let capture = RecordingPiecesCapture<SystemAudioCapture.AudioPiece>(
                        first: .init(samples: [-0.25], sampleRate: 48_000), last: .init(samples: [-0.5], sampleRate: 48_000)
                    )
                    calls.append(capture)
                    return capture
                })
            },
            recognizerSource: {
                let recognizer = SessionRecognizer(name: "live")
                recognizers.append(recognizer)
                return recognizer
            }
        )
    }

    func finish() {

        for microphone in microphones.all { microphone.end() }
        for call in calls.all { call.end() }
    }
}

private final class RecordingPiecesCapture<Piece: Sendable>: AudioCapture {

    let audio: AsyncThrowingStream<Piece, any Error>
    let stops = Values<Bool>()
    private let continuation: AsyncThrowingStream<Piece, any Error>.Continuation
    private let last: Piece

    init(first: Piece, last: Piece) {

        (audio, continuation) = AsyncThrowingStream.makeStream(of: Piece.self)
        self.last = last
        continuation.yield(first)
    }

    func stop() {

        stops.append(true)
        continuation.yield(last)
        continuation.finish()
    }

    func end() { continuation.finish() }
}

private final class RecordingPiecesTimeZone: Sendable {

    let value = Mutex(TimeZone(secondsFromGMT: 0)!)
}

private struct RecordingPiecesClock: CallClock {

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        preconditionFailure("Listing processes must not start call detection")
    }
}

private struct RecordingPiecesBinding: ProcessBinding {

    func processObjects() -> [ProcessObject] { [1, 2, 3, 4, 5] }
    func pid(of object: ProcessObject) -> Int32? {

        switch object {
        case 1: 72
        case 2: 73
        case 3: 99
        case 4: getpid()
        default: nil
        }
    }
    func bundleID(of object: ProcessObject) -> String? { object == 2 ? "meeting.helper" : nil }
    func name(of object: ProcessObject) -> String {

        switch object {
        case 1, 5: "meeting"
        case 2: "meeting Helper"
        case 3: "other"
        default: "Audelin"
        }
    }
    func isRunningInput(_ object: ProcessObject) -> Bool { preconditionFailure("Selection must not detect calls") }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation {
        preconditionFailure("Selection must not subscribe")
    }
    func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation {
        preconditionFailure("Selection must not subscribe")
    }
}
