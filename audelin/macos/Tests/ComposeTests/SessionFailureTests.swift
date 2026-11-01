import BlockingTestWork
import Foundation
import Session
import Testing
import TrackFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionFailureTests {

    @Test(arguments: [SessionSide.microphone, .call])
    func failedTrackOpenLeavesTheOtherCaptureRecording(side: SessionSide) async throws {

        try await withSessionRig { rig, folder in
            let pieces = rig.pieces
            let handler = pieces.handler()
            let name = side == .microphone ? "microphone.caf" : "call.caf"
            let blocked = folder.appendingPathComponent(name)
            let unavailable = String(describing: SessionPieces.Failure.unavailableTrack(side))
            let trackFailure = String(describing: POSIXError(.EEXIST) as NSError)
            var state = SessionState()
            for command in [SessionEvent.begin(liveText: true), .end] {
                var event = command
                while true {
                    let (updated, effect) = SessionReducer.reduce(state, event)
                    state = updated
                    guard let effect else { break }
                    event = await handler.handle(effect)
                    if case .createFolder = effect {
                        try await offPool { try Data("existing track".utf8).write(to: blocked) }
                    }
                }
                #expect(state.phase == (command == .end ? .ended : .recording))
                #expect(state.callText == .down)
                #expect(side == .microphone ? state.microphoneCapture == .down : state.callCapture == .down)
                #expect(state.health(of: .track(side)) == .failed(trackFailure))
                #expect(state.health(of: .callText) == .failed(unavailable))
                #expect(state.health(of: .capture(side)) == .failed(unavailable))
                #expect(state.failures == [
                    .init(piece: "\(side) track", message: trackFailure),
                    .init(piece: "call text", message: unavailable),
                    .init(piece: "\(side) capture", message: unavailable),
                ])
                let other: SessionSide = side == .microphone ? .call : .microphone
                #expect(state.health(of: .track(other)) == .fine)
                #expect(state.health(of: .capture(other)) == .fine)
                let otherCapture = side == .microphone ? state.callCapture : state.microphoneCapture
                #expect(otherCapture == (command == .end ? .closed : .up))
            }
            #expect(rig.microphone.starts.all == (side == .microphone ? [] : [true]))
            #expect(rig.call.starts.all == (side == .call ? [] : [true]))
            #expect(try await offPool { try String(contentsOf: blocked, encoding: .utf8) } == "existing track")
            let otherName = side == .microphone ? "call.caf" : "microphone.caf"
            #expect(try await recordedSamples(folder.appendingPathComponent(otherName))
                == (side == .microphone ? [-0.25, 0.5, -0.125] : [0.25, -0.5, 0.125]))
        }
    }

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func failedWriteAndItsFailedStopReachSessionBeforeEnd(side: SessionSide, stopEndsStream: Bool) async throws {

        var construction = SessionConstruction()
        construction.recordingTrack = { current, track in
            if current == side { return FailingTrack(track: track) }
            return CaptureTrack(track: track)
        }
        try await withSessionRig(construction: construction, stopFailure: side, stopEndsStream: stopEndsStream) { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            if side == .microphone {
                rig.microphone.source.continuation.yield(.init(samples: [0.75], sampleRate: 48_000))
            } else {
                rig.call.source.continuation.yield(.init(samples: [0.75], sampleRate: 48_000))
            }
            let failed = try await rig.state { $0.health(of: .capture(side)) == .failed("failed") }
            #expect(failed.phase == .recording)
            #expect(failed.health(of: .track(side)) == .failed("failed"))
            #expect(failed.failures == [
                .init(piece: "\(side) track", message: "failed"),
                .init(piece: "\(side) capture", message: "failed"),
            ])
            try await expectOtherSideRecords(rig, failedSide: side, folder: folder, failures: failed.failures)
        }
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func failedWriteReachesSessionBeforeEnd(side: SessionSide) async throws {

        var construction = SessionConstruction()
        construction.recordingTrack = { current, track in
            if current == side { return FailingTrack(track: track) }
            return CaptureTrack(track: track)
        }
        try await withSessionRig(construction: construction) { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            if side == .microphone {
                rig.microphone.source.continuation.yield(.init(samples: [0.75], sampleRate: 48_000))
            } else {
                rig.call.source.continuation.yield(.init(samples: [0.75], sampleRate: 48_000))
            }
            let failed = try await rig.state { $0.health(of: .track(side)) == .failed("failed") }
            #expect(failed.phase == .recording)
            #expect(failed.failures == [.init(piece: "\(side) track", message: "failed")])
            let other: SessionSide = side == .microphone ? .call : .microphone
            #expect(failed.health(of: .track(other)) == .fine)
            #expect(failed.health(of: .capture(other)) == .fine)
            #expect(side == .microphone ? failed.callCapture == .up : failed.microphoneCapture == .up)
            try await expectOtherSideRecords(rig, failedSide: side, folder: folder, failures: failed.failures)
        }
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func failedCaptureReachesSessionBeforeEnd(side: SessionSide) async throws {

        try await withSessionRig { rig, folder in
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            if side == .microphone { rig.microphone.source.continuation.finish(throwing: ScriptFailure.failed) }
            else { rig.call.source.continuation.finish(throwing: ScriptFailure.failed) }
            let failed = try await rig.state { $0.health(of: .capture(side)) == .failed("failed") }
            #expect(failed.phase == .recording)
            #expect(failed.failures == [.init(piece: "\(side) capture", message: "failed")])
            let other: SessionSide = side == .microphone ? .call : .microphone
            #expect(failed.health(of: .capture(other)) == .fine)
            #expect(failed.health(of: .track(other)) == .fine)
            #expect(side == .microphone ? failed.callCapture == .up : failed.microphoneCapture == .up)
            try await expectOtherSideRecords(rig, failedSide: side, folder: folder, failures: failed.failures)
        }
    }
}

private func expectOtherSideRecords(
    _ rig: SessionRig, failedSide: SessionSide, folder: URL, failures: [SessionFailure]
) async throws {

    if failedSide == .microphone {
        rig.call.source.continuation.yield(.init(samples: [0.625], sampleRate: 48_000))
        await rig.theirs.heard.next()
        #expect(await rig.theirs.chunks.last?.samples == [0.625])
    } else {
        rig.microphone.source.continuation.yield(.init(samples: [0.625], sampleRate: 48_000))
        await rig.mine.heard.next()
        #expect(await rig.mine.chunks.last?.samples == [0.625])
    }
    await rig.session.send(.end)
    let ended = try await rig.state { $0.phase == .ended }
    #expect(ended.failures == failures)
    let name = failedSide == .microphone ? "call.caf" : "microphone.caf"
    let samples: [Float] = failedSide == .microphone ? [-0.25, 0.5, 0.625, -0.125] : [0.25, -0.5, 0.625, 0.125]
    #expect(try await recordedSamples(folder.appendingPathComponent(name)) == samples)
}

private struct FailingTrack: RecordingTrack {

    let track: TrackFile

    func write(_ samples: [Float], sampleRate: Double) async throws {

        if samples == [0.75] { throw ScriptFailure.failed }
        try await track.write(samples, sampleRate: sampleRate)
    }
}
