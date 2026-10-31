@testable import Session
import Testing

struct SessionAudioWarningTests {

    @Test func prolongedCallZerosWithRecentMicActivityWarnOnce() {

        let state = fold([call(0, 1)] + microphoneWindows(start: 299.9, count: 5))
        let event = call(1, 300)
        let expected = callAdvanced(state, through: 300, silentSince: 0, warning: .callSilent, issued: true)
        assert(state, event, reducedTo: expected)
        assert(state, event, delivers: nil)
        assert(expected, call(300, 301), reducedTo: callAdvanced(expected, through: 301, silentSince: 0, warning: .callSilent, issued: true))
        assert(expected, call(300, 301), delivers: nil)
    }

    @Test func staleMicActivityDoesNotWarn() {

        let state = fold(microphoneWindows(start: 0, count: 5) + [level(299.98, 300, rms: 0)])
        var expected = callAdvanced(state, through: 300, silentSince: 0)
        expected.audioObservation.microphoneActivity = []
        assert(state, call(0, 300), reducedTo: expected)
        assert(state, call(0, 300), delivers: nil)
    }

    @Test func nonzeroCallSampleResetsSilenceInterval() {

        let state = fold([call(0, 299), call(299, 300, nonzero: true)] + microphoneWindows(start: 599.9, count: 5))
        let beforeThreshold = callAdvanced(state, through: 599.98, silentSince: 300)
        assert(state, call(300, 599.98), reducedTo: beforeThreshold)
        assert(state, call(300, 599.98), delivers: nil)
        assert(beforeThreshold, call(599.98, 600), reducedTo: callAdvanced(beforeThreshold, through: 600, silentSince: 300, warning: .callSilent, issued: true))
        assert(beforeThreshold, call(599.98, 600), delivers: nil)
    }

    @Test func laterCallAudioClearsWarningWithoutRearmingNotification() {

        let state = fold([call(0, 300)] + microphoneWindows(start: 299.9, count: 5))
        #expect(state.audioWarning == .callSilent)
        let cleared = callAdvanced(state, through: 300.02, silentSince: 300.02, issued: true)
        assert(state, call(300, 300.02, nonzero: true), reducedTo: cleared)
        assert(state, call(300, 300.02, nonzero: true), delivers: nil)
        let later = fold(microphoneWindows(start: 600, count: 5), from: cleared)
        var expected = callAdvanced(later, through: 600.1, silentSince: 300.02, issued: true)
        expected.audioObservation.microphoneActivity.removeFirst()
        assert(later, call(300.02, 600.1), reducedTo: expected)
        assert(later, call(300.02, 600.1), delivers: nil)
    }

    @Test(arguments: [0.0, 1_000.0])
    func captureStartOffsetsDoNotCauseWarning(origin: Double) {

        let microphoneFirst = fold(microphoneWindows(start: origin + 699.9, count: 5))
        assert(microphoneFirst, call(origin + 400, origin + 699.98), reducedTo: callAdvanced(microphoneFirst, through: origin + 699.98, silentSince: origin + 400))
        assert(microphoneFirst, call(origin + 400, origin + 699.98), delivers: nil)

        let callFirst = fold([call(origin, origin + 300)] + microphoneWindows(start: origin + 400, count: 4))
        let event = level(origin + 400.08, origin + 400.1)
        var expected = callFirst
        expected.audioObservation.microphoneCoveredThrough = origin + 400.1
        expected.audioObservation.microphoneActivity = [.init(qualifiedAt: origin + 400.1, through: origin + 400.1)]
        assert(callFirst, event, reducedTo: expected)
        assert(callFirst, event, delivers: nil)
    }

    @Test(arguments: [0.0, 299.9])
    func delayedCallStatisticsDoNotCauseFalseWarning(earlierActivity: Double) {

        let state = fold([call(0, 1)] + microphoneWindows(start: earlierActivity, count: 5) + microphoneWindows(start: 599.9, count: 5))
        let warns = earlierActivity == 299.9
        var expected = callAdvanced(state, through: 300, silentSince: 0, warning: warns ? .callSilent : nil, issued: warns)
        if !warns { expected.audioObservation.microphoneActivity.removeFirst() }
        assert(state, call(1, 300), reducedTo: expected)
        assert(state, call(1, 300), delivers: nil)
    }

    @Test(arguments: [299.98, 300.0])
    func callSilenceThresholdIncludesExactly300Seconds(end: Double) {

        let state = fold(microphoneWindows(start: 299.9, count: 5))
        let warns = end == 300
        assert(state, call(0, end), reducedTo: callAdvanced(state, through: end, silentSince: 0, warning: warns ? .callSilent : nil, issued: warns))
        assert(state, call(0, end), delivers: nil)
    }

    @Test(arguments: [300.0, 300.02])
    func microphoneRecencyIncludesExactly120Seconds(end: Double) {

        let state = fold(microphoneWindows(start: 179.9, count: 5) + [level(end - 0.02, end, rms: 0)])
        let warns = end == 300
        var expected = callAdvanced(state, through: end, silentSince: 0, warning: warns ? .callSilent : nil, issued: warns)
        if !warns { expected.audioObservation.microphoneActivity = [] }
        assert(state, call(0, end), reducedTo: expected)
        assert(state, call(0, end), delivers: nil)
    }

    @Test(arguments: [0.099, 0.1])
    func microphoneActivityNeeds100Milliseconds(duration: Double) {

        var windows = microphoneWindows(start: 299.9, count: 5)
        windows[0] = level(300 - duration, 299.9 + 0.02)
        let state = fold(windows)
        let warns = duration == 0.1
        assert(state, call(0, 300), reducedTo: callAdvanced(state, through: 300, silentSince: 0, warning: warns ? .callSilent : nil, issued: warns))
        assert(state, call(0, 300), delivers: nil)
    }

    @Test(arguments: [0.0099, 0.01])
    func microphoneActivityIncludesRMSOfPoint01(rms: Double) {

        let state = fold(microphoneWindows(start: 299.9, count: 5, rms: rms))
        let warns = rms == 0.01
        assert(state, call(0, 300), reducedTo: callAdvanced(state, through: 300, silentSince: 0, warning: warns ? .callSilent : nil, issued: warns))
        assert(state, call(0, 300), delivers: nil)
    }

    @Test func gapInMicrophoneWindowsBreaksSustainedActivity() {

        let state = fold(microphoneWindows(start: 299.88, count: 4) + microphoneWindows(start: 299.98, count: 2))
        assert(state, call(0, 300.02), reducedTo: callAdvanced(state, through: 300.02, silentSince: 0))
        assert(state, call(0, 300.02), delivers: nil)
    }

    @Test func quietMicrophoneWindowBreaksSustainedActivity() {

        let state = fold(microphoneWindows(start: 299.88, count: 4) + [level(299.96, 299.98, rms: 0)] + microphoneWindows(start: 299.98, count: 2))
        assert(state, call(0, 300.02), reducedTo: callAdvanced(state, through: 300.02, silentSince: 0))
        assert(state, call(0, 300.02), delivers: nil)
    }

    @Test func delayedMicrophoneCoverageDoesNotWarnEarly() {

        let state = fold(microphoneWindows(start: 299.88, count: 5))
        assert(state, call(0, 600), reducedTo: callAdvanced(state, through: 600, silentSince: 0))
        assert(state, call(0, 600), delivers: nil)
        let callAhead = fold([call(0, 600)], from: state)
        var expected = callAhead
        expected.audioObservation.microphoneCoveredThrough = 300
        expected.audioObservation.microphoneActivity[0].through = 300
        expected.audioObservation.warningIssued = true
        expected.audioWarning = .callSilent
        assert(callAhead, level(299.98, 300), reducedTo: expected)
        assert(callAhead, level(299.98, 300), delivers: nil)
    }

    @Test func gapsInCallStatisticsDoNotCountAsExactZeros() {

        let state = fold([call(0, 299)] + microphoneWindows(start: 599.9, count: 5))
        assert(state, call(400, 600), reducedTo: callAdvanced(state, through: 600, silentSince: 400))
        assert(state, call(400, 600), delivers: nil)
    }

    @Test(arguments: [SessionState.Phase.idle, .bringingUp, .ending, .ended])
    func audioEventsOutsideRecordingAreIgnored(phase: SessionState.Phase) {

        var state = fold([call(0, 300)] + microphoneWindows(start: 299.9, count: 5))
        state.phase = phase
        for event in [call(300, 301, nonzero: true), level(300, 300.02)] {
            assert(state, event, reducedTo: state)
            assert(state, event, delivers: nil)
        }
    }

    @Test func beginStartsWithCleanAudioObservation() {

        var state = fold([call(0, 300)] + microphoneWindows(start: 299.9, count: 5))
        state.phase = .idle
        assert(state, .begin(liveText: false), reducedTo: SessionState(phase: .bringingUp))
        assert(state, .begin(liveText: false), delivers: .checkModels)
    }

    @Test func warningLeavesHealthFailuresAndRecordabilityAlone() {

        let initial = SessionState(health: [.capture(.call): .failed("lost")], phase: .recording, failures: [.init(piece: "call", message: "lost")], cannotRecord: "kept reason")
        let state = fold(microphoneWindows(start: 299.9, count: 5), from: initial)
        assert(state, call(0, 300), reducedTo: callAdvanced(state, through: 300, silentSince: 0, warning: .callSilent, issued: true))
        assert(state, call(0, 300), delivers: nil)
    }

    @Test func nonzeroCallAudioClearsWarningEvenWhileMicrophoneLags() {

        let warned = fold([call(0, 300)] + microphoneWindows(start: 299.9, count: 5))
        assert(warned, call(300, 400, nonzero: true), reducedTo: callAdvanced(warned, through: 400, silentSince: 400, issued: true))
        assert(warned, call(300, 400, nonzero: true), delivers: nil)
    }

    @Test func invalidAndOverlappingIntervalsAreIgnored() {

        let state = fold([call(0, 300)] + microphoneWindows(start: 299.9, count: 5))
        let events = [
            call(300, 300), call(301, 300), call(.nan, 301), call(300, .infinity),
            call(299.98, 300.02, nonzero: true), call(0, 300, nonzero: true),
            level(300, 300), level(301, 300), level(-.infinity, 301), level(300, .nan),
            level(299.98, 300.02),
        ]
        for event in events {
            assert(state, event, reducedTo: state)
            assert(state, event, delivers: nil)
        }
    }

    @Test(arguments: [Double.nan, .infinity, -.infinity])
    func nonfiniteMicrophoneRMSDoesNotQualify(rms: Double) {

        let state = fold(microphoneWindows(start: 299.9, count: 5, rms: rms))
        assert(state, call(0, 300), reducedTo: callAdvanced(state, through: 300, silentSince: 0))
        assert(state, call(0, 300), delivers: nil)
    }

    private func call(_ start: Double, _ end: Double, nonzero: Bool = false) -> SessionEvent {

        .callAudioStatistics(start: start, end: end, hasFiniteNonzeroSample: nonzero)
    }

    private func level(_ start: Double, _ end: Double, rms: Double = 0.01) -> SessionEvent {

        .microphoneLevel(start: start, end: end, rms: rms)
    }

    private func microphoneWindows(start: Double, count: Int, rms: Double = 0.01) -> [SessionEvent] {

        (0..<count).map { level(start + Double($0) * 0.02, start + Double($0 + 1) * 0.02, rms: rms) }
    }

    private func fold(_ events: [SessionEvent], from initial: SessionState = .init(phase: .recording)) -> SessionState {

        var state = initial
        var effects: [SessionEffect] = []
        for event in events {
            let (next, effect) = SessionReducer.reduce(state, event)
            state = next
            if let effect { effects.append(effect) }
        }
        #expect(effects.isEmpty)
        return state
    }

    private func callAdvanced(_ state: SessionState, through: Double, silentSince: Double, warning: SessionState.AudioWarning? = nil, issued: Bool = false) -> SessionState {

        var expected = state
        expected.audioObservation.callCoveredThrough = through
        expected.audioObservation.callSilentSince = silentSince
        expected.audioObservation.warningIssued = issued
        expected.audioWarning = warning
        return expected
    }
}

private func assert(
    _ state: SessionState, _ event: SessionEvent, reducedTo expected: SessionState,
    sourceLocation: SourceLocation = #_sourceLocation
) {

    #expect(SessionReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
