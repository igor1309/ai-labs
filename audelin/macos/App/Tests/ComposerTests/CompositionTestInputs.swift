import protocol RecordedCapture.Track
import SessionRehearsal
import Preferences
import Recording
import CoreAudioProcesses
@testable import Audelin
import Foundation
import CallAudioAccess
import CallAppProcesses
import CallFolder
import LiveText
import LiveAudio
import Session
import TrackFile
import struct CallText.State
import protocol TranscriptWriting.CallText
@testable import Composer

/// Explicit test inputs for tests of the composition's internal adapters.
struct TestLogSink: LogSink { func write(_ entry: LogEntry) {} }
let testIntervals = ProfileIntervals { _ in {} }

extension SessionPieces {
    init(
        folder: CallFolder,
        folderTitle: String? = nil,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<CaptureBuffer>,
        startCall: @escaping @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>,
        microphoneRecognizer: any Recognizer,
        callRecognizer: any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        monotonicNow: @escaping @Sendable () -> Double = { 0 },
        openTrack: @escaping @Sendable (URL) async throws -> TrackFile = { try await TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = SessionPieces.defaultRecordingTrack,
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack,
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio,
        openTranscript: @escaping @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript,
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText,
        captureLogSink: any LogSink = TestLogSink(),
        intervals: ProfileIntervals = testIntervals,
        transcriptClock: any Clock<Duration> = PassingClock()
    ) {

        self.init(
            folder: folder, folderTitle: folderTitle, processes: processes, startMicrophone: startMicrophone, startCall: startCall,
            microphoneRecognizerSource: { microphoneRecognizer }, callRecognizerSource: { callRecognizer },
            missingModels: missingModels, monotonicNow: monotonicNow,
            openTrack: openTrack, recordingTrack: recordingTrack, closeTrack: closeTrack,
            makeCaptureAudio: makeCaptureAudio, openTranscript: openTranscript, makeCallText: makeCallText,
            captureLogSink: captureLogSink, intervals: intervals, sleep: { try await transcriptClock.sleep(for: $0) }
        )
    }

    init(
        folder: CallFolder,
        folderTitle: String? = nil,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<CaptureBuffer>,
        startCall: @escaping @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>,
        microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        monotonicNow: @escaping @Sendable () -> Double = { 0 },
        openTrack: @escaping @Sendable (URL) async throws -> TrackFile = { try await TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = SessionPieces.defaultRecordingTrack,
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack,
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio,
        openTranscript: @escaping @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript,
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText,
        captureLogSink: any LogSink = TestLogSink(),
        intervals: ProfileIntervals = testIntervals,
        transcriptClock: any Clock<Duration> = PassingClock()
    ) {

        self.init(
            folder: folder, folderTitle: folderTitle, processes: processes, startMicrophone: startMicrophone, startCall: startCall,
            microphoneRecognizerSource: microphoneRecognizerSource, callRecognizerSource: callRecognizerSource,
            missingModels: missingModels, monotonicNow: monotonicNow, openTrack: openTrack, recordingTrack: recordingTrack, closeTrack: closeTrack,
            makeCaptureAudio: makeCaptureAudio, openTranscript: openTranscript, makeCallText: makeCallText,
            captureLogSink: captureLogSink, intervals: intervals, sleep: { try await transcriptClock.sleep(for: $0) }
        )
    }

}
func composeRecording(
    initial: RecordingState = .init(),
    access: AccessPolicy,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    liveText: @escaping @Sendable () -> Bool,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel,
    makeSession: @escaping MakeSessionModel
) async -> RecordingInputs {

    await composeRecording(
        initial: initial, access: access, makePieces: makePieces, liveText: liveText, sink: TestLogSink(), timeZone: { .gmt }, panel: panel, makeModel: makeModel,
        makeSession: makeSession
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore,
    access: AccessPolicy,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    panel: AudelinPanel,
    makeModel: MakeRecordingModel,
    makeSession: @escaping MakeSessionModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {

    await composeRecordingWithPreferences(
        preferences: preferences, access: access, makePieces: makePieces, makeConditions: { testRecordingConditions(recording: $0, callsURL: $1, access: access) }, panel: panel, sink: TestLogSink(), timeZone: { .gmt },
        makeModel: makeModel, makeSession: makeSession
    )
}

func composeRecordingWithPreferences(
    preferences: PreferencesStore, access: AccessPolicy,
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    makeConditions: (RecordingInputs, URL) -> RecordingConditions,
    panel: AudelinPanel, makeModel: MakeRecordingModel, makeSession: @escaping MakeSessionModel
) async -> (recording: RecordingInputs, conditions: RecordingConditions) {
    await composeRecordingWithPreferences(preferences: preferences, access: access, makePieces: makePieces,
        makeConditions: makeConditions, panel: panel, sink: TestLogSink(), timeZone: { .gmt }, makeModel: makeModel, makeSession: makeSession)
}
func testRecordingConditions(recording: RecordingInputs, callsURL: URL, access: AccessPolicy) -> RecordingConditions {
    RecordingConditions(recording: recording, microphoneAccess: { true },
        callsFolder: { FileManager.default.fileExists(atPath: callsURL.path) }, room: { true }, access: access)
}
extension CallRecordingSubscription {
    convenience init(
        calls: AsyncThrowingStream<CallEvent, any Error>, recording: RecordingInputs,
        beforeCallStarted: (@Sendable () async -> Void)? = nil,
        startedApp: (@Sendable (String) -> Void)? = nil
    ) {

        self.init(calls: calls, recording: recording, beforeCallStarted: beforeCallStarted,
                  startedApp: startedApp, sink: TestLogSink())
    }

}
extension RecordingSessions {
    init(
        makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
        liveText: @escaping @Sendable () -> Bool,
        report: @escaping @Sendable (UInt64, RecordingSessionReport) async -> Void,
        panel: AudelinPanel,
        makeSession: @escaping MakeSessionModel
    ) {

        self.init(
            makePieces: makePieces, liveText: liveText, report: report, connect: subscribe, sink: TestLogSink(), timeZone: { .gmt }, panel: panel,
            makeSession: makeSession
        )
    }

}
extension RecordingConditions {
    convenience init(
        recording: RecordingInputs,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool,
        access: AccessPolicy
    ) {

        self.init(
            send: recording.send,
            microphoneAccess: microphoneAccess,
            callsFolder: callsFolder, room: room, sink: TestLogSink(), access: access
        )
    }

}
extension AudelinPanel {
    /// Each recording reads through a fresh model from `makeReading`.
    init(makeReading: @escaping @MainActor @Sendable () -> ReadingInputs) {

        self.init(makeReading: makeReading, sink: TestLogSink())
    }

    init(makeReading: @escaping @MainActor @Sendable () -> ReadingInputs, sink: any LogSink) {

        self.init(makeReading: makeReading, now: { 0 }, ticks: { AsyncStream { $0.finish() } }, sink: sink, intervals: testIntervals)
    }

}

extension AudelinPanel {
    init(makeReading: @escaping @MainActor @Sendable () -> ReadingInputs,
         now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink) {
        self.init(makeReading: makeReading, now: now, ticks: ticks, sink: sink, intervals: testIntervals)
    }
}
func composeCalls(_ processes: CoreAudioProcesses, to recording: RecordingInputs, conditions: RecordingConditions?,
                  startedApp: (@Sendable (String) -> Void)? = nil) async throws -> CallRecordingSubscription {
    try await composeCalls(processes, to: recording, conditions: conditions, startedApp: startedApp, sink: TestLogSink())
}
func startLiveModelLoading(recognizerSource: @escaping @Sendable () async throws -> any Recognizer) -> Task<Void, any Error> {
    loadModel(recognizerSource: recognizerSource, sink: TestLogSink())
}
func composeSessionPieces(folder: CallFolder, folderTitle: String? = nil, processes: CallAppProcesses,
    startMicrophone: @escaping @Sendable () async throws -> StartedCapture<CaptureBuffer>,
    startCall: @escaping @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>,
    microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
    callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
    missingModels: @escaping @Sendable () -> [String]) -> SessionPieces {
    SessionPieces(folder: folder, folderTitle: folderTitle, processes: processes, startMicrophone: startMicrophone,
        startCall: startCall, microphoneRecognizerSource: microphoneRecognizerSource, callRecognizerSource: callRecognizerSource,
        missingModels: missingModels)
}

func composeRecordingPieces(preferences: PreferencesStore, callApp: RecordingCallApp, processes: CoreAudioProcesses,
    now: @escaping @Sendable () -> Date, timeZone: @escaping @Sendable () -> TimeZone,
    startMicrophone: @escaping @Sendable () async throws -> StartedCapture<CaptureBuffer>,
    startCall: @escaping @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>,
    recognizerSource: @escaping @Sendable () async throws -> any Recognizer,
    missingModels: @escaping @Sendable () -> [String]) -> @Sendable (UInt64) -> SessionPieces {
    var boundary = rehearsalBoundary(capturePersistence: .recorded, microphone: startMicrophone, call: startCall,
        mine: RehearsalRecognizer(SessionRecognizer(name: "unused")), theirs: RehearsalRecognizer(SessionRecognizer(name: "unused")),
        now: now, timeZone: timeZone, sleep: { _ in throw CancellationError() }, intervals: testIntervals)
    boundary.recognizers = FixtureRecognizers(source: { _ in RehearsalRecognizer(try await recognizerSource()) },
        missing: missingModels, load: { Task {} })
    return Composer.composeRecordingPieces(preferences: preferences, callApp: callApp, processes: processes, boundary: boundary)
}
