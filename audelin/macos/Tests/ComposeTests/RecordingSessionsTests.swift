import Foundation
import Recording
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct RecordingSessionsTests {

    @Test func readyUsesOneFactoryAndTheLiveTextPreference() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection()
            let ids = Values<UInt64>()
            let adapter = RecordingSessions(makePieces: { id in ids.append(id); return rig.pieces },
                                            liveText: { true }, report: connection.report, connect: connection.connect)
            #expect(await adapter.begin(id: 12) == .ready)
            #expect(await adapter.begin(id: 12) == .ready)
            #expect(ids.all == [12])
            #expect(await connection.session.snapshot().wantedLiveText)
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status != .off)
            await adapter.end(id: 12)
            let ended = await connection.session.snapshot()
            #expect(ended.phase == .ended)
            #expect(ended.microphoneTrack == .closed)
            #expect(ended.callTrack == .closed)
            #expect(ended.transcript == .closed)
            #expect(await text.state.status == .finished)
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.stops.all == [true])
            #expect(connection.joined.all == [true])
            #expect(connection.reports.all.isEmpty)
        }
    }

    @Test func cannotRecordIsTheBeginResult() async throws {

        let started = Signal(), release = Signal()
        defer { started.end(); release.end() }
        try await withSessionRig(connect: disconnected, beforeMicrophoneStartReturns: {
            started.send(); await release.next()
        }) { rig, _ in
            let connection = RecordingConnection()
            let adapter = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect)
            let begin = Task { await adapter.begin(id: 3) }
            await started.next()
            await rig.pieces.news.continuation.yield(.pieceFailed(.folder, error: "unavailable"))
            #expect(await begin.value == .cannotRecord("folder: unavailable"))
            let end = Task { await adapter.end(id: 3) }
            _ = try await sessionState(connection.session) { $0.phase == .ending }
            release.end()
            await end.value
            #expect(connection.reports.all.isEmpty)
            #expect(connection.joined.all == [true])
        }
    }

    @Test func laterCannotRecordIsReportedOnce() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection()
            let adapter = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect)
            #expect(await adapter.begin(id: 7) == .ready)
            rig.microphone.source.continuation.finish(throwing: ScriptFailure.failed)
            rig.call.source.continuation.finish(throwing: ScriptFailure.failed)
            await connection.reported.next()
            await rig.pieces.news.continuation.yield(.pieceFailed(.transcript, error: "unavailable"))
            _ = try await sessionState(connection.session) { $0.health(of: .transcript) == .failed("unavailable") }
            await adapter.end(id: 7)
            #expect(connection.reports.all == [.init(id: 7, report: .cannotRecord("no track can record"))])
            #expect(connection.joined.all == [true])
        }
    }

    @Test func endDuringBringUpWaitsForThePendingCapture() async throws {

        let started = Signal(), release = Signal()
        defer { started.end(); release.end() }
        try await withSessionRig(connect: disconnected, beforeMicrophoneStartReturns: {
            started.send(); await release.next()
        }) { rig, _ in
            let connection = RecordingConnection()
            let adapter = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect)
            let begin = Task { await adapter.begin(id: 4) }
            await started.next()
            let end = Task { await adapter.end(id: 4) }
            _ = try await sessionState(connection.session) { $0.phase == .ending }
            #expect(rig.microphone.stops.all.isEmpty)
            release.end()
            #expect(await begin.value == .ended)
            await end.value
            #expect(await connection.session.snapshot().phase == .ended)
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.starts.all.isEmpty)
            #expect(connection.joined.all == [true])
            #expect(connection.reports.all.isEmpty)
        }
    }

    @Test func recordingWiringForwardsLaterFailureAndEndsTheSession() async throws {

        try await withSessionRig(connect: disconnected) { rig, folder in
            let recording = composeRecording(initial: .init(missing: []), makePieces: { _ in rig.pieces }, liveText: { false })
            recording.send(.userStart)
            _ = try await recordingState(recording) { $0.phase == .recording }
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .off)
            rig.microphone.source.continuation.finish(throwing: ScriptFailure.failed)
            rig.call.source.continuation.finish(throwing: ScriptFailure.failed)
            let ended = try await recordingState(recording) { $0.phase == .idle }
            #expect(ended.cannotRecord == "no track can record")
            #expect(ended.session == nil)
            #expect(try recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5])
            #expect(try recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5])
            await recording.end()
        }
    }

    @Test func endingUnknownAndAlreadyEndedIdsReturnsWithoutBuilding() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection(), ids = Values<UInt64>()
            let adapter = RecordingSessions(makePieces: { id in ids.append(id); return rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect)
            await adapter.end(id: 99)
            #expect(ids.all.isEmpty)
            #expect(await adapter.begin(id: 8) == .ready)
            await adapter.end(id: 8)
            #expect(connection.cancelled.all == [true])
            await adapter.end(id: 8)
            #expect(ids.all == [8])
            #expect(connection.joined.all == [true])
            #expect(connection.reports.all.isEmpty)
        }
    }

    @Test func anEndBeforeItsBeginLeavesNothingRecording() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection(), ids = Values<UInt64>()
            let adapter = RecordingSessions(makePieces: { id in ids.append(id); return rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect)
            await adapter.end(id: 5)
            #expect(await adapter.begin(id: 5) == .ended)
            #expect(ids.all.isEmpty)
            #expect(connection.sessions.all.isEmpty)
            #expect(await adapter.begin(id: 6) == .ready)
            await adapter.end(id: 6)
            #expect(ids.all == [6])
        }
    }

    @Test func sessionsAndUnexpectedEndReportsStayWithTheirIds() async throws {

        try await withSessionRig(connect: disconnected) { first, _ in
            try await withSessionRig(connect: disconnected) { second, _ in
                let reports = RecordingConnection(), firstConnection = RecordingConnection(), secondConnection = RecordingConnection()
                let adapter = RecordingSessions(makePieces: { $0 == 21 ? first.pieces : second.pieces }, liveText: { false },
                                                report: reports.report, connect: { pieces, session in
                    if pieces === first.pieces { return firstConnection.connect(pieces, session) }
                    return secondConnection.connect(pieces, session)
                })
                #expect(await adapter.begin(id: 21) == .ready)
                #expect(await adapter.begin(id: 34) == .ready)
                firstConnection.session.send(.end)
                await reports.reported.next()
                await adapter.end(id: 21)
                #expect(reports.reports.all == [.init(id: 21, report: .ended)])
                #expect(await secondConnection.session.snapshot().phase == .recording)
                #expect(second.microphone.stops.all.isEmpty)
                #expect(second.call.stops.all.isEmpty)
                await adapter.end(id: 34)
                #expect(firstConnection.joined.all == [true])
                #expect(secondConnection.joined.all == [true])
                #expect(second.microphone.stops.all == [true])
                #expect(second.call.stops.all == [true])
                #expect(reports.reports.all == [.init(id: 21, report: .ended)])
            }
        }
    }
}

private func disconnected(_: SessionPieces, _: Session) -> Task<Void, Never> { Task {} }

private struct SessionReport: Equatable, Sendable {

    let id: UInt64
    let report: RecordingSessionReport
}

private final class RecordingConnection: Sendable {

    let sessions = Values<Session>()
    let reports = Values<SessionReport>()
    let reported = Signal()
    let joined = Values<Bool>()
    let cancelled = Values<Bool>()

    var session: Session { sessions.all[0] }

    func report(_ id: UInt64, _ report: RecordingSessionReport) {

        reports.append(.init(id: id, report: report))
        reported.send()
    }

    func connect(_ pieces: SessionPieces, _ session: Session) -> Task<Void, Never> {

        sessions.append(session)
        let subscription = subscribe(pieces, to: session)
        return Task {
            await withTaskCancellationHandler {
                await subscription.value
                // Stay alive until cancelled, so only the adapter's cancel can end this.
                let (held, _) = AsyncStream<Void>.makeStream()
                for await _ in held {}
                joined.append(true)
            } onCancel: {
                cancelled.append(true)
                subscription.cancel()
            }
        }
    }
}

private func sessionState(_ session: Session, where matches: (SessionState) -> Bool) async throws -> SessionState {

    for await state in await session.states() {
        if matches(state) { return state }
    }
    throw ScriptFailure.failed
}

private func recordingState(_ recording: Recording, where matches: (RecordingState) -> Bool) async throws -> RecordingState {

    for await state in await recording.states() {
        if matches(state) { return state }
    }
    throw ScriptFailure.failed
}
