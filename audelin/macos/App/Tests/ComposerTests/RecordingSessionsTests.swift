import Foundation
import Recording
import Session
import Testing
@testable import Audelin
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct RecordingSessionsTests {

    @Test func sessionHealthMapsToFaultsOnce() async throws {

        let cases: [(SessionEvent, RecordingFault?)] = [
            (.pieceFailed(.access(.microphone), error: "lost"), .microphone),
            (.pieceFailed(.capture(.microphone), error: "lost"), .microphone),
            (.accessChanged(.microphone, available: false), .microphone),
            (.pieceFailed(.access(.call), error: "lost"), .callAudio),
            (.pieceFailed(.capture(.call), error: "lost"), .callAudio),
            (.accessChanged(.call, available: false), .callAudio),
            (.pieceFailed(.track(.microphone), error: "full"), .diskFull),
            (.pieceFailed(.track(.call), error: "full"), .diskFull),
            (.pieceFailed(.folder, error: "lost"), nil),
            (.pieceFailed(.processes, error: "lost"), nil),
            (.pieceFailed(.transcript, error: "lost"), nil),
            (.pieceFailed(.callText, error: "lost"), nil),
        ]
        for (event, fault) in cases {
            try await withSessionRig(connect: disconnected) { rig, _ in
                let connection = RecordingConnection()
                let adapter = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                                report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
                #expect(await adapter.begin(id: 17) == .ready)
                await connection.session.send(event)
                await connection.session.send(event)
                await adapter.end(id: 17)
                #expect(connection.faults == fault.map { [.init(id: 17, report: .failed($0))] } ?? [], "\(event)")
            }
        }
    }

    @Test func faultsBeforeReadyAreDeliveredAfterReady() async throws {

        let started = Signal(), release = Signal()
        defer { started.end(); release.end() }
        try await withSessionRig(connect: disconnected, beforeMicrophoneStartReturns: {
            started.send(); await release.next()
        }) { rig, _ in
            let connection = RecordingConnection()
            let adapter = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
            let begin = Task { await adapter.begin(id: 18) }
            await started.next()
            await connection.session.send(.pieceFailed(.track(.microphone), error: "full"))
            _ = try await connection.session.state { $0.health(of: .track(.microphone)) == .failed("full") }
            release.end()
            #expect(await begin.value == .ready)
            await connection.session.send(.pieceFailed(.track(.call), error: "also full"))
            await adapter.end(id: 18)
            #expect(connection.faults == [.init(id: 18, report: .failed(.diskFull))])
        }
    }

    @Test func faultsAreDeduplicatedPerSession() async throws {

        try await withSessionRig(connect: disconnected) { first, _ in
            try await withSessionRig(connect: disconnected) { second, _ in
                let reports = RecordingConnection(), firstConnection = RecordingConnection(), secondConnection = RecordingConnection()
                let adapter = RecordingSessions(makePieces: { $0 == 21 ? first.pieces : second.pieces }, liveText: { false },
                                                report: reports.report, connect: { pieces, session in
                    if pieces === first.pieces { return firstConnection.connect(pieces, session) }
                    return secondConnection.connect(pieces, session)
                }, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
                for (id, connection): (UInt64, RecordingConnection) in [(21, firstConnection), (34, secondConnection)] {
                    #expect(await adapter.begin(id: id) == .ready)
                    await connection.session.send(.accessChanged(.microphone, available: false))
                    await connection.session.send(.pieceFailed(.capture(.microphone), error: "lost"))
                    await adapter.end(id: id)
                }
                #expect(reports.faults == [.init(id: 21, report: .failed(.microphone)), .init(id: 34, report: .failed(.microphone))])
            }
        }
    }

    @Test func readyUsesOneFactoryAndTheLiveTextPreference() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection()
            let ids = Values<UInt64>()
            let adapter = RecordingSessions(makePieces: { id in ids.append(id); return rig.pieces },
                                            liveText: { true }, report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
            #expect(await adapter.begin(id: 12) == .ready)
            #expect(await adapter.begin(id: 12) == .ready)
            #expect(ids.all == [12])
            _ = try await connection.session.state { $0.wantedLiveText }
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status != .off)
            await adapter.end(id: 12)
            let ended = try await connection.session.state { $0.phase == .ended }
            #expect(ended.phase == .ended)
            #expect(ended.microphoneTrack == .closed)
            #expect(ended.callTrack == .closed)
            #expect(ended.transcript == .closed)
            #expect(await text.state.status == .finished)
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.stops.all == [true])
            #expect(connection.joined.all == [true])
            #expect(connection.reports.all == [.init(id: 12, report: .callCreated(id: "1970.01.01-0000"))])
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
                                            report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
            let begin = Task { await adapter.begin(id: 3) }
            await started.next()
            await rig.pieces.news.continuation.yield(.pieceFailed(.folder, error: "unavailable"))
            #expect(await begin.value == .cannotRecord("folder: unavailable"))
            let end = Task { await adapter.end(id: 3) }
            _ = try await connection.session.state { $0.phase == .ending }
            release.end()
            await end.value
            #expect(connection.reports.all == [.init(id: 3, report: .callCreated(id: "1970.01.01-0000"))])
            #expect(connection.joined.all == [true])
        }
    }

    @Test func laterCannotRecordIsReportedOnce() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection()
            let adapter = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
            #expect(await adapter.begin(id: 7) == .ready)
            rig.microphone.source.continuation.finish(throwing: ScriptFailure.failed)
            rig.call.source.continuation.finish(throwing: ScriptFailure.failed)
            await connection.waitForReport(.init(id: 7, report: .failed(.microphone)))
            await rig.pieces.news.continuation.yield(.pieceFailed(.transcript, error: "unavailable"))
            _ = try await connection.session.state { $0.health(of: .transcript) == .failed("unavailable") }
            await connection.waitForReport(.init(id: 7, report: .cannotRecord("no track can record")))
            await adapter.end(id: 7)
            // Capture faults can arrive in either order from the independent streams.
            #expect(connection.faults.count == 2)
            #expect(connection.faults.contains(.init(id: 7, report: .failed(.microphone))))
            #expect(connection.faults.contains(.init(id: 7, report: .failed(.callAudio))))
            #expect(connection.reports.all.filter { if case .failed = $0.report { false } else { true } }
                    == [.init(id: 7, report: .callCreated(id: "1970.01.01-0000")),
                        .init(id: 7, report: .cannotRecord("no track can record"))])
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
                                            report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
            let begin = Task { await adapter.begin(id: 4) }
            await started.next()
            let end = Task { await adapter.end(id: 4) }
            _ = try await connection.session.state { $0.phase == .ending }
            #expect(rig.microphone.stops.all.isEmpty)
            release.end()
            #expect(await begin.value == .ended)
            await end.value
            _ = try await connection.session.state { $0.phase == .ended }
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.starts.all.isEmpty)
            #expect(connection.joined.all == [true])
            #expect(connection.reports.all == [.init(id: 4, report: .callCreated(id: "1970.01.01-0000"))])
        }
    }

    @Test func recordingWiringForwardsLaterFailureAndEndsTheSession() async throws {

        try await withSessionRig(connect: disconnected) { rig, folder in
            let recording = await composeRecording(initial: .init(missing: []), access: testAccessPolicy(), makePieces: { _ in rig.pieces }, liveText: { false }, panel: ReadingClockSpy().panel(), makeModel: makeRecording, makeSession: makeSession)
            await recording.send(.userStart)
            _ = try await recordingState(recording) { $0.phase == .recording }
            let text = try #require(await rig.pieces.text)
            #expect(await text.state.status == .off)
            rig.microphone.source.continuation.finish(throwing: ScriptFailure.failed)
            rig.call.source.continuation.finish(throwing: ScriptFailure.failed)
            let ended = try await recordingState(recording) { $0.phase == .idle }
            #expect(ended.cannotRecord == "no track can record")
            #expect(ended.session == nil)
            #expect(try await recordedSamples(folder.appendingPathComponent("microphone.caf")) == [0.25, -0.5])
            #expect(try await recordedSamples(folder.appendingPathComponent("call.caf")) == [-0.25, 0.5])
            await recording.end()
        }
    }

    @Test func endingUnknownAndAlreadyEndedIdsReturnsWithoutBuilding() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection(), ids = Values<UInt64>()
            let adapter = RecordingSessions(makePieces: { id in ids.append(id); return rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
            await adapter.end(id: 99)
            #expect(ids.all.isEmpty)
            #expect(await adapter.begin(id: 8) == .ready)
            await adapter.end(id: 8)
            #expect(connection.cancelled.all == [true])
            await adapter.end(id: 8)
            #expect(ids.all == [8])
            #expect(connection.joined.all == [true])
            #expect(connection.reports.all == [.init(id: 8, report: .callCreated(id: "1970.01.01-0000"))])
        }
    }

    @Test func anEndBeforeItsBeginLeavesNothingRecording() async throws {

        try await withSessionRig(connect: disconnected) { rig, _ in
            let connection = RecordingConnection(), ids = Values<UInt64>()
            let adapter = RecordingSessions(makePieces: { id in ids.append(id); return rig.pieces }, liveText: { false },
                                            report: connection.report, connect: connection.connect, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
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
                }, sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: makeSession)
                #expect(await adapter.begin(id: 21) == .ready)
                #expect(await adapter.begin(id: 34) == .ready)
                await firstConnection.session.send(.end)
                await reports.waitForReport(.init(id: 21, report: .ended))
                await adapter.end(id: 21)
                #expect(reports.reports.all == [.init(id: 21, report: .callCreated(id: "1970.01.01-0000")),
                                                .init(id: 34, report: .callCreated(id: "1970.01.01-0000")),
                                                .init(id: 21, report: .ended)])
                let secondNow = try await secondConnection.session.current()
                #expect(secondNow.phase == .recording)
                #expect(second.microphone.stops.all.isEmpty)
                #expect(second.call.stops.all.isEmpty)
                await adapter.end(id: 34)
                #expect(firstConnection.joined.all == [true])
                #expect(secondConnection.joined.all == [true])
                #expect(second.microphone.stops.all == [true])
                #expect(second.call.stops.all == [true])
                #expect(reports.reports.all == [.init(id: 21, report: .callCreated(id: "1970.01.01-0000")),
                                                .init(id: 34, report: .callCreated(id: "1970.01.01-0000")),
                                                .init(id: 21, report: .ended)])
            }
        }
    }
}

private func disconnected(_: SessionPieces, _: SessionInputs) -> Task<Void, Never> { Task {} }

private struct SessionReport: Equatable, Sendable {

    let id: UInt64
    let report: RecordingSessionReport
}

private final class RecordingConnection: Sendable {

    let sessions = Values<SessionInputs>()
    let reports = Values<SessionReport>()
    let reported = Signal()
    let joined = Values<Bool>()
    let cancelled = Values<Bool>()

    var session: SessionInputs { sessions.all[0] }

    var faults: [SessionReport] { reports.all.filter { if case .failed = $0.report { true } else { false } } }

    func report(_ id: UInt64, _ report: RecordingSessionReport) {

        reports.append(.init(id: id, report: report))
        reported.send()
    }

    func waitForReport(_ expected: SessionReport) async {
        while !reports.all.contains(expected) { await reported.next() }
    }

    func connect(_ pieces: SessionPieces, _ session: SessionInputs) -> Task<Void, Never> {

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

private func recordingState(_ recording: RecordingInputs, where matches: (RecordingState) -> Bool) async throws -> RecordingState {

    for await state in await recording.states() {
        if matches(state) { return state }
    }
    throw ScriptFailure.failed
}
