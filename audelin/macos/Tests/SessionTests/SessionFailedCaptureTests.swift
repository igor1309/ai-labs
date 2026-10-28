import Foundation
@testable import Machine
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionFailedCaptureTests {

    @Test(arguments: [SessionSide.microphone, .call])
    func failedCaptureStillStartingStopsOnceItIsUp(_ side: SessionSide) {

        var state = SessionState(
            phase: .bringingUp,
            folder: .up,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: side == .microphone ? .starting : .up,
            callCapture: side == .call ? .starting : .up
        )
        var effect: SessionEffect?
        (state, effect) = SessionReducer.reduce(state, .pieceFailed(.capture(side), error: "stream failed"))
        #expect(effect == nil)
        (state, effect) = SessionReducer.reduce(state, .captureFinished(side, error: nil))
        #expect(effect == .stopCapture(side))
        #expect(status(state, side) == .stopping)
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func failedCaptureStopsOnceTheOtherCaptureStarts(_ side: SessionSide) {

        let other: SessionSide = side == .microphone ? .call : .microphone
        var state = SessionState(
            phase: .bringingUp,
            folder: .up,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: side == .microphone ? .up : .starting,
            callCapture: side == .call ? .up : .starting
        )
        var effect: SessionEffect?
        (state, effect) = SessionReducer.reduce(state, .pieceFailed(.capture(side), error: "stream failed"))
        #expect(effect == nil)
        (state, effect) = SessionReducer.reduce(state, .captureFinished(other, error: nil))
        #expect(effect == .stopCapture(side))
        #expect(status(state, side) == .stopping)
        #expect(status(state, other) == .up)
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func failedCaptureStopsOnceLiveTextIsSet(_ side: SessionSide) {

        let request = SessionState.LiveTextRequest(id: 1, enabled: false)
        var state = SessionState(
            wantedLiveText: false,
            liveTextRequestID: 1,
            pendingLiveText: request,
            phase: .recording,
            folder: .up,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: .up,
            callCapture: .up,
            transcript: .up,
            callText: .up
        )
        var effect: SessionEffect?
        (state, effect) = SessionReducer.reduce(state, .pieceFailed(.capture(side), error: "stream failed"))
        #expect(effect == nil)
        (state, effect) = SessionReducer.reduce(state, .liveTextSet(request: request, error: nil))
        #expect(effect == .stopCapture(side))
        #expect(status(state, side) == .stopping)
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func failedCaptureStopsOnceTheOtherCaptureStops(_ side: SessionSide) {

        let other: SessionSide = side == .microphone ? .call : .microphone
        var state = SessionState(
            phase: .recording,
            folder: .up,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: side == .microphone ? .up : .stopping,
            callCapture: side == .call ? .up : .stopping
        )
        var effect: SessionEffect?
        (state, effect) = SessionReducer.reduce(state, .pieceFailed(.capture(side), error: "stream failed"))
        #expect(effect == nil)
        (state, effect) = SessionReducer.reduce(state, .captureStopped(other, error: nil))
        #expect(effect == .stopCapture(side))
        #expect(status(state, side) == .stopping)
        #expect(status(state, other) == .closed)
    }


    private func status(_ state: SessionState, _ side: SessionSide) -> SessionState.PieceStatus {

        side == .microphone ? state.microphoneCapture : state.callCapture
    }
}
