import Session
import Testing

struct SessionAudioWarningTests {

    @Test func prolongedCallZerosWithRecentMicActivityWarnOnce() {

        let state = makeAudioState(callThrough: 1, silentSince: 0, microphoneSince: 299.9, microphoneThrough: 300)
        let event = call(1, 300)
        assert(state, event) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
        assert(state, event, delivers: nil)
        let warned = makeWarned()
        assert(warned, call(300, 301)) { $0.audioObservation.callCoveredThrough = 301 }
        assert(warned, call(300, 301), delivers: nil)
    }

    @Test func staleMicActivityDoesNotWarn() {

        let state = makeAudioState(microphoneThrough: 300, activity: [.init(qualifiedAt: 0.1, through: 0.1)])
        assert(state, call(0, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.microphoneActivity = []
        }
        assert(state, call(0, 300), delivers: nil)
    }

    @Test func nonzeroCallSampleResetsSilenceInterval() {

        let state = makeAudioState(callThrough: 299, silentSince: 0)
        assert(state, call(299, 300, nonzero: true)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.callSilentSince = 300
        }
        assert(state, call(299, 300, nonzero: true), delivers: nil)
        let reset = makeAudioState(callThrough: 300, silentSince: 300, microphoneSince: 599.9, microphoneThrough: 600)
        assert(reset, call(300, 599.98)) { $0.audioObservation.callCoveredThrough = 599.98 }
        assert(reset, call(300, 599.98), delivers: nil)
        let beforeThreshold = reset.with { $0.audioObservation.callCoveredThrough = 599.98 }
        assert(beforeThreshold, call(599.98, 600)) {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
        assert(beforeThreshold, call(599.98, 600), delivers: nil)
    }

    @Test func laterCallAudioClearsWarningWithoutRearmingNotification() {

        let state = makeWarned()
        assert(state, call(300, 300.02, nonzero: true)) {
            $0.audioObservation.callCoveredThrough = 300.02
            $0.audioObservation.callSilentSince = 300.02
            $0.audioWarning = nil
        }
        assert(state, call(300, 300.02, nonzero: true), delivers: nil)
        let later = makeAudioState(callThrough: 300.02, silentSince: 300.02, microphoneSince: 600, microphoneThrough: 600.1,
                                  activity: [.init(qualifiedAt: 300, through: 300), .init(qualifiedAt: 600.1, through: 600.1)], issued: true)
        assert(later, call(300.02, 600.1)) {
            $0.audioObservation.callCoveredThrough = 600.1
            $0.audioObservation.microphoneActivity.removeFirst()
        }
        assert(later, call(300.02, 600.1), delivers: nil)
    }

    @Test(arguments: [0.0, 1_000.0])
    func captureStartOffsetsDoNotCauseWarning(origin: Double) {

        let microphoneFirst = makeAudioState(microphoneSince: origin + 699.9, microphoneThrough: origin + 700)
        assert(microphoneFirst, call(origin + 400, origin + 699.98)) {
            $0.audioObservation.callCoveredThrough = origin + 699.98
            $0.audioObservation.callSilentSince = origin + 400
        }
        assert(microphoneFirst, call(origin + 400, origin + 699.98), delivers: nil)

        let callFirst = makeAudioState(callThrough: origin + 300, silentSince: origin,
                                      microphoneSince: origin + 400, microphoneThrough: origin + 400.08, activity: [])
        let event = level(origin + 400.08, origin + 400.1)
        assert(callFirst, event) {
            $0.audioObservation.microphoneCoveredThrough = origin + 400.1
            $0.audioObservation.microphoneActivity = [.init(qualifiedAt: origin + 400.1, through: origin + 400.1)]
        }
        assert(callFirst, event, delivers: nil)
    }

    @Test(arguments: [0.0, 299.9])
    func delayedCallStatisticsDoNotCauseFalseWarning(earlierActivity: Double) {

        let state = makeAudioState(callThrough: 1, silentSince: 0, microphoneSince: 599.9, microphoneThrough: 600,
                                  activity: [.init(qualifiedAt: earlierActivity + 0.1, through: earlierActivity + 0.1),
                                             .init(qualifiedAt: 600, through: 600)])
        let warns = earlierActivity == 299.9
        assert(state, call(1, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.warningIssued = warns
            $0.audioWarning = warns ? .callSilent : nil
            if !warns { $0.audioObservation.microphoneActivity.removeFirst() }
        }
        assert(state, call(1, 300), delivers: nil)
    }

    @Test(arguments: [299.98, 300.0])
    func callSilenceThresholdIncludesExactly300Seconds(end: Double) {

        let state = makeAudioState(microphoneSince: 299.9, microphoneThrough: 300)
        let warns = end == 300
        assert(state, call(0, end)) {
            $0.audioObservation.callCoveredThrough = end
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.warningIssued = warns
            $0.audioWarning = warns ? .callSilent : nil
        }
        assert(state, call(0, end), delivers: nil)
    }

    @Test(arguments: [300.0, 300.02])
    func microphoneRecencyIncludesExactly120Seconds(end: Double) {

        let state = makeAudioState(microphoneThrough: end, activity: [.init(qualifiedAt: 180, through: 180)])
        let warns = end == 300
        assert(state, call(0, end)) {
            $0.audioObservation.callCoveredThrough = end
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.warningIssued = warns
            $0.audioWarning = warns ? .callSilent : nil
            if !warns { $0.audioObservation.microphoneActivity = [] }
        }
        assert(state, call(0, end), delivers: nil)
    }

    @Test(arguments: [0.099, 0.1])
    func microphoneActivityNeeds100Milliseconds(duration: Double) {

        let state = makeAudioState(callThrough: 300, silentSince: 0, microphoneSince: 300 - duration,
                                  microphoneThrough: 299.98, activity: [])
        let qualifies = duration == 0.1
        assert(state, level(299.98, 300)) {
            $0.audioObservation.microphoneCoveredThrough = 300
            if qualifies {
                $0.audioObservation.microphoneActivity = [.init(qualifiedAt: 300, through: 300)]
                $0.audioObservation.warningIssued = true
                $0.audioWarning = .callSilent
            }
        }
        assert(state, level(299.98, 300), delivers: nil)
    }

    @Test(arguments: [0.0099, 0.01, Double.nan, .infinity, -.infinity])
    func microphoneActivityIncludesRMSOfPoint01(rms: Double) {

        let state = makeAudioState(callThrough: 300, silentSince: 0, microphoneSince: 299.9,
                                  microphoneThrough: 299.98, activity: [])
        assert(state, level(299.98, 300, rms: rms)) {
            $0.audioObservation.microphoneCoveredThrough = 300
            if rms == 0.01 {
                $0.audioObservation.microphoneActivity = [.init(qualifiedAt: 300, through: 300)]
                $0.audioObservation.warningIssued = true
                $0.audioWarning = .callSilent
            } else { $0.audioObservation.microphoneActiveSince = nil }
        }
        assert(state, level(299.98, 300, rms: rms), delivers: nil)
    }

    @Test func gapInMicrophoneWindowsBreaksSustainedActivity() {

        let state = makeAudioState(callThrough: 300.02, silentSince: 0, microphoneSince: 299.88,
                                  microphoneThrough: 299.96, activity: [])
        assert(state, level(299.98, 300.02)) {
            $0.audioObservation.microphoneCoveredThrough = 300.02
            $0.audioObservation.microphoneActiveSince = 299.98
        }
        assert(state, level(299.98, 300.02), delivers: nil)
    }

    @Test func quietMicrophoneWindowBreaksSustainedActivity() {

        let state = makeAudioState(callThrough: 300.02, silentSince: 0, microphoneSince: 299.88,
                                  microphoneThrough: 299.96, activity: [])
        assert(state, level(299.96, 299.98, rms: 0)) {
            $0.audioObservation.microphoneCoveredThrough = 299.98
            $0.audioObservation.microphoneActiveSince = nil
        }
        assert(state, level(299.96, 299.98, rms: 0), delivers: nil)
        let quiet = state.with {
            $0.audioObservation.microphoneCoveredThrough = 299.98
            $0.audioObservation.microphoneActiveSince = nil
        }
        assert(quiet, level(299.98, 300.02)) {
            $0.audioObservation.microphoneCoveredThrough = 300.02
            $0.audioObservation.microphoneActiveSince = 299.98
        }
        assert(quiet, level(299.98, 300.02), delivers: nil)
    }

    @Test func delayedMicrophoneCoverageDoesNotWarnEarly() {

        let state = makeAudioState(microphoneSince: 299.88, microphoneThrough: 299.98)
        assert(state, call(0, 600)) {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.callSilentSince = 0
        }
        assert(state, call(0, 600), delivers: nil)
        let callAhead = state.with {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.callSilentSince = 0
        }
        assert(callAhead, level(299.98, 300)) {
            $0.audioObservation.microphoneCoveredThrough = 300
            $0.audioObservation.microphoneActivity[0].through = 300
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
        assert(callAhead, level(299.98, 300), delivers: nil)
    }

    @Test func gapsInCallStatisticsDoNotCountAsExactZeros() {

        let state = makeAudioState(callThrough: 299, silentSince: 0, microphoneSince: 599.9, microphoneThrough: 600)
        assert(state, call(400, 600)) {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.callSilentSince = 400
        }
        assert(state, call(400, 600), delivers: nil)
    }

    @Test(arguments: [SessionState.Phase.idle, .bringingUp, .ending, .ended])
    func audioEventsOutsideRecordingAreIgnored(phase: SessionState.Phase) {

        let state = makeWarned().with { $0.phase = phase }
        for event in [call(300, 301, nonzero: true), level(300, 300.02)] {
            assert(state, event)
            assert(state, event, delivers: nil)
        }
    }

    @Test func beginStartsWithCleanAudioObservation() {

        let state = makeWarned().with { $0.phase = .idle }
        assert(state, .begin(liveText: false)) {
            $0.phase = .bringingUp
            $0.wantedLiveText = false
            $0.audioWarning = nil
            $0.audioObservation = .init()
        }
        assert(state, .begin(liveText: false), delivers: .checkModels)
    }

    @Test func warningLeavesHealthFailuresAndRecordabilityAlone() {

        let state = makeAudioState(microphoneSince: 299.9, microphoneThrough: 300).with {
            $0.health[.capture(.call)] = .failed("lost")
            $0.failures = [.init(piece: "call", message: "lost")]
            $0.cannotRecord = "kept reason"
        }
        assert(state, call(0, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
        assert(state, call(0, 300), delivers: nil)
    }

    @Test func nonzeroCallAudioClearsWarningEvenWhileMicrophoneLags() {

        let state = makeWarned()
        assert(state, call(300, 400, nonzero: true)) {
            $0.audioObservation.callCoveredThrough = 400
            $0.audioObservation.callSilentSince = 400
            $0.audioWarning = nil
        }
        assert(state, call(300, 400, nonzero: true), delivers: nil)
    }

    @Test func invalidAndOverlappingIntervalsAreIgnored() {

        let state = makeWarned()
        let events = [
            call(300, 300), call(301, 300), call(.nan, 301), call(300, .infinity),
            call(299.98, 300.02, nonzero: true), call(0, 300, nonzero: true),
            level(300, 300), level(301, 300), level(-.infinity, 301), level(300, .nan),
            level(299.98, 300.02),
        ]
        for event in events {
            assert(state, event)
            assert(state, event, delivers: nil)
        }
    }

    @Test func microphoneActivityExtendsAnExistingWindow() {

        let state = makeAudioState(microphoneSince: 299.9, microphoneThrough: 300)
        assert(state, level(300, 300.02)) {
            $0.audioObservation.microphoneCoveredThrough = 300.02
            $0.audioObservation.microphoneActivity[0].through = 300.02
        }
        assert(state, level(300, 300.02), delivers: nil)
    }

    @Test(arguments: [0.02, 0.099, 0.1])
    func firstMicrophoneWindowStartsActivity(duration: Double) {

        let state = makeAudioState(callThrough: 300, silentSince: 0)
        let event = level(299.9, 299.9 + duration)
        assert(state, event) {
            $0.audioObservation.microphoneCoveredThrough = 299.9 + duration
            $0.audioObservation.microphoneActiveSince = 299.9
            if duration == 0.1 {
                $0.audioObservation.microphoneActivity = [.init(qualifiedAt: 300, through: 300)]
                $0.audioObservation.warningIssued = true
                $0.audioWarning = .callSilent
            }
        }
        assert(state, event, delivers: nil)
    }

    @Test func callSilenceWithoutQualifiedMicrophoneActivityDoesNotWarn() {

        let state = makeAudioState(microphoneSince: 299.98, microphoneThrough: 300.02, activity: [])
        assert(state, call(0, 300.02)) {
            $0.audioObservation.callCoveredThrough = 300.02
            $0.audioObservation.callSilentSince = 0
        }
        assert(state, call(0, 300.02), delivers: nil)
    }

    private func call(_ start: Double, _ end: Double, nonzero: Bool = false) -> SessionEvent {

        .callAudioStatistics(start: start, end: end, hasFiniteNonzeroSample: nonzero)
    }

    private func level(_ start: Double, _ end: Double, rms: Double = 0.01) -> SessionEvent {

        .microphoneLevel(start: start, end: end, rms: rms)
    }

    private func makeAudioState(
        callThrough: Double? = nil, silentSince: Double? = nil,
        microphoneSince: Double? = nil, microphoneThrough: Double? = nil,
        activity: [SessionAudioObservation.Activity]? = nil, issued: Bool = false
    ) -> SessionState {

        let windows = activity ?? microphoneSince.map {
            [SessionAudioObservation.Activity(qualifiedAt: $0 + 0.1, through: microphoneThrough!)]
        } ?? []
        return SessionState(phase: .recording, audioObservation: .init(
            callCoveredThrough: callThrough, callSilentSince: silentSince,
            microphoneCoveredThrough: microphoneThrough, microphoneActiveSince: microphoneSince,
            microphoneActivity: windows, warningIssued: issued))
    }

    private func makeWarned() -> SessionState {

        makeAudioState(callThrough: 300, silentSince: 0, microphoneSince: 299.9, microphoneThrough: 300, issued: true).with {
            $0.audioWarning = .callSilent
        }
    }
}
