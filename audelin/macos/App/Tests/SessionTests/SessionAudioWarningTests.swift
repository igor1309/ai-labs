import Session
import Testing

struct SessionAudioWarningTests {

    @Test func prolongedCallZerosWithRecentMicActivityWarn_state() {

        let state = makeAudioState(callThrough: 1, silentSince: 0, microphoneSince: 299.9, microphoneThrough: 300)
        assert(state, call(1, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
    }

    @Test func prolongedCallZerosWithRecentMicActivityWarn_effect() {

        let state = makeAudioState(callThrough: 1, silentSince: 0, microphoneSince: 299.9, microphoneThrough: 300)
        assert(state, call(1, 300), delivers: nil)
    }

    @Test func furtherCallZerosAfterTheWarningDoNotWarnAgain_state() {

        assert(makeWarned(), call(300, 301)) { $0.audioObservation.callCoveredThrough = 301 }
    }

    @Test func furtherCallZerosAfterTheWarningDoNotWarnAgain_effect() {

        assert(makeWarned(), call(300, 301), delivers: nil)
    }

    @Test func staleMicActivityDoesNotWarn_state() {

        let state = makeAudioState(microphoneThrough: 300, activity: [.init(qualifiedAt: 0.1, through: 0.1)])
        assert(state, call(0, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.microphoneActivity = []
        }
    }

    @Test func staleMicActivityDoesNotWarn_effect() {

        let state = makeAudioState(microphoneThrough: 300, activity: [.init(qualifiedAt: 0.1, through: 0.1)])
        assert(state, call(0, 300), delivers: nil)
    }

    @Test func nonzeroCallSampleResetsSilenceInterval_state() {

        assert(makeAudioState(callThrough: 299, silentSince: 0), call(299, 300, nonzero: true)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.callSilentSince = 300
        }
    }

    @Test func nonzeroCallSampleResetsSilenceInterval_effect() {

        assert(makeAudioState(callThrough: 299, silentSince: 0), call(299, 300, nonzero: true), delivers: nil)
    }

    @Test func zerosAfterAResetDoNotWarnBeforeTheThreshold_state() {

        assert(makeReset(), call(300, 599.98)) { $0.audioObservation.callCoveredThrough = 599.98 }
    }

    @Test func zerosAfterAResetDoNotWarnBeforeTheThreshold_effect() {

        assert(makeReset(), call(300, 599.98), delivers: nil)
    }

    @Test func zerosAfterAResetWarnAtTheThreshold_state() {

        let state = makeReset().with { $0.audioObservation.callCoveredThrough = 599.98 }
        assert(state, call(599.98, 600)) {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
    }

    @Test func zerosAfterAResetWarnAtTheThreshold_effect() {

        let state = makeReset().with { $0.audioObservation.callCoveredThrough = 599.98 }
        assert(state, call(599.98, 600), delivers: nil)
    }

    @Test func laterCallAudioClearsWarning_state() {

        assert(makeWarned(), call(300, 300.02, nonzero: true)) {
            $0.audioObservation.callCoveredThrough = 300.02
            $0.audioObservation.callSilentSince = 300.02
            $0.audioWarning = nil
        }
    }

    @Test func laterCallAudioClearsWarning_effect() {

        assert(makeWarned(), call(300, 300.02, nonzero: true), delivers: nil)
    }

    @Test func clearedWarningIsNotRearmed_state() {

        assert(makeCleared(), call(300.02, 600.1)) {
            $0.audioObservation.callCoveredThrough = 600.1
            $0.audioObservation.microphoneActivity.removeFirst()
        }
    }

    @Test func clearedWarningIsNotRearmed_effect() {

        assert(makeCleared(), call(300.02, 600.1), delivers: nil)
    }

    @Test(arguments: [0.0, 1_000.0])
    func callStatisticsAfterAnOffsetStartDoNotWarn_state(origin: Double) {

        let state = makeAudioState(microphoneSince: origin + 699.9, microphoneThrough: origin + 700)
        assert(state, call(origin + 400, origin + 699.98)) {
            $0.audioObservation.callCoveredThrough = origin + 699.98
            $0.audioObservation.callSilentSince = origin + 400
        }
    }

    @Test(arguments: [0.0, 1_000.0])
    func callStatisticsAfterAnOffsetStartDoNotWarn_effect(origin: Double) {

        let state = makeAudioState(microphoneSince: origin + 699.9, microphoneThrough: origin + 700)
        assert(state, call(origin + 400, origin + 699.98), delivers: nil)
    }

    @Test(arguments: [0.0, 1_000.0])
    func microphoneLevelAfterAnOffsetStartDoesNotWarn_state(origin: Double) {

        assert(makeCallFirst(origin), level(origin + 400.08, origin + 400.1)) {
            $0.audioObservation.microphoneCoveredThrough = origin + 400.1
            $0.audioObservation.microphoneActivity = [.init(qualifiedAt: origin + 400.1, through: origin + 400.1)]
        }
    }

    @Test(arguments: [0.0, 1_000.0])
    func microphoneLevelAfterAnOffsetStartDoesNotWarn_effect(origin: Double) {

        assert(makeCallFirst(origin), level(origin + 400.08, origin + 400.1), delivers: nil)
    }

    @Test(arguments: [0.0, 299.9])
    func delayedCallStatisticsDoNotCauseFalseWarning_state(earlierActivity: Double) {

        let warns = earlierActivity == 299.9
        assert(makeDelayedCall(earlierActivity), call(1, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.warningIssued = warns
            $0.audioWarning = warns ? .callSilent : nil
            if !warns { $0.audioObservation.microphoneActivity.removeFirst() }
        }
    }

    @Test(arguments: [0.0, 299.9])
    func delayedCallStatisticsDoNotCauseFalseWarning_effect(earlierActivity: Double) {

        assert(makeDelayedCall(earlierActivity), call(1, 300), delivers: nil)
    }

    @Test(arguments: [299.98, 300.0])
    func callSilenceThresholdIncludesExactly300Seconds_state(end: Double) {

        let warns = end == 300
        assert(makeAudioState(microphoneSince: 299.9, microphoneThrough: 300), call(0, end)) {
            $0.audioObservation.callCoveredThrough = end
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.warningIssued = warns
            $0.audioWarning = warns ? .callSilent : nil
        }
    }

    @Test(arguments: [299.98, 300.0])
    func callSilenceThresholdIncludesExactly300Seconds_effect(end: Double) {

        assert(makeAudioState(microphoneSince: 299.9, microphoneThrough: 300), call(0, end), delivers: nil)
    }

    @Test(arguments: [300.0, 300.02])
    func microphoneRecencyIncludesExactly120Seconds_state(end: Double) {

        let state = makeAudioState(microphoneThrough: end, activity: [.init(qualifiedAt: 180, through: 180)])
        let warns = end == 300
        assert(state, call(0, end)) {
            $0.audioObservation.callCoveredThrough = end
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.warningIssued = warns
            $0.audioWarning = warns ? .callSilent : nil
            if !warns { $0.audioObservation.microphoneActivity = [] }
        }
    }

    @Test(arguments: [300.0, 300.02])
    func microphoneRecencyIncludesExactly120Seconds_effect(end: Double) {

        let state = makeAudioState(microphoneThrough: end, activity: [.init(qualifiedAt: 180, through: 180)])
        assert(state, call(0, end), delivers: nil)
    }

    @Test(arguments: [0.099, 0.1])
    func microphoneActivityNeeds100Milliseconds_state(duration: Double) {

        let state = makeAudioState(callThrough: 300, silentSince: 0, microphoneSince: 300 - duration,
                                  microphoneThrough: 299.98, activity: [])
        assert(state, level(299.98, 300)) {
            $0.audioObservation.microphoneCoveredThrough = 300
            if duration == 0.1 {
                $0.audioObservation.microphoneActivity = [.init(qualifiedAt: 300, through: 300)]
                $0.audioObservation.warningIssued = true
                $0.audioWarning = .callSilent
            }
        }
    }

    @Test(arguments: [0.099, 0.1])
    func microphoneActivityNeeds100Milliseconds_effect(duration: Double) {

        let state = makeAudioState(callThrough: 300, silentSince: 0, microphoneSince: 300 - duration,
                                  microphoneThrough: 299.98, activity: [])
        assert(state, level(299.98, 300), delivers: nil)
    }

    @Test(arguments: [0.0099, 0.01, Double.nan, .infinity, -.infinity])
    func microphoneActivityIncludesRMSOfPoint01_state(rms: Double) {

        assert(makeMicrophoneEdge(), level(299.98, 300, rms: rms)) {
            $0.audioObservation.microphoneCoveredThrough = 300
            if rms == 0.01 {
                $0.audioObservation.microphoneActivity = [.init(qualifiedAt: 300, through: 300)]
                $0.audioObservation.warningIssued = true
                $0.audioWarning = .callSilent
            } else { $0.audioObservation.microphoneActiveSince = nil }
        }
    }

    @Test(arguments: [0.0099, 0.01, Double.nan, .infinity, -.infinity])
    func microphoneActivityIncludesRMSOfPoint01_effect(rms: Double) {

        assert(makeMicrophoneEdge(), level(299.98, 300, rms: rms), delivers: nil)
    }

    @Test func gapInMicrophoneWindowsBreaksSustainedActivity_state() {

        assert(makeMicrophoneRun(), level(299.98, 300.02)) {
            $0.audioObservation.microphoneCoveredThrough = 300.02
            $0.audioObservation.microphoneActiveSince = 299.98
        }
    }

    @Test func gapInMicrophoneWindowsBreaksSustainedActivity_effect() {

        assert(makeMicrophoneRun(), level(299.98, 300.02), delivers: nil)
    }

    @Test func quietMicrophoneWindowBreaksSustainedActivity_state() {

        assert(makeMicrophoneRun(), level(299.96, 299.98, rms: 0)) {
            $0.audioObservation.microphoneCoveredThrough = 299.98
            $0.audioObservation.microphoneActiveSince = nil
        }
    }

    @Test func quietMicrophoneWindowBreaksSustainedActivity_effect() {

        assert(makeMicrophoneRun(), level(299.96, 299.98, rms: 0), delivers: nil)
    }

    @Test func activityAfterAQuietWindowStartsAgain_state() {

        assert(makeQuietMicrophone(), level(299.98, 300.02)) {
            $0.audioObservation.microphoneCoveredThrough = 300.02
            $0.audioObservation.microphoneActiveSince = 299.98
        }
    }

    @Test func activityAfterAQuietWindowStartsAgain_effect() {

        assert(makeQuietMicrophone(), level(299.98, 300.02), delivers: nil)
    }

    @Test func callStatisticsAheadOfTheMicrophoneDoNotWarnEarly_state() {

        assert(makeMicrophoneBehind(), call(0, 600)) {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.callSilentSince = 0
        }
    }

    @Test func callStatisticsAheadOfTheMicrophoneDoNotWarnEarly_effect() {

        assert(makeMicrophoneBehind(), call(0, 600), delivers: nil)
    }

    @Test func delayedMicrophoneCoverageWarnsOnceItCatchesUp_state() {

        assert(makeCallAhead(), level(299.98, 300)) {
            $0.audioObservation.microphoneCoveredThrough = 300
            $0.audioObservation.microphoneActivity[0].through = 300
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
    }

    @Test func delayedMicrophoneCoverageWarnsOnceItCatchesUp_effect() {

        assert(makeCallAhead(), level(299.98, 300), delivers: nil)
    }

    @Test func gapsInCallStatisticsDoNotCountAsExactZeros_state() {

        let state = makeAudioState(callThrough: 299, silentSince: 0, microphoneSince: 599.9, microphoneThrough: 600)
        assert(state, call(400, 600)) {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.callSilentSince = 400
        }
    }

    @Test func gapsInCallStatisticsDoNotCountAsExactZeros_effect() {

        let state = makeAudioState(callThrough: 299, silentSince: 0, microphoneSince: 599.9, microphoneThrough: 600)
        assert(state, call(400, 600), delivers: nil)
    }

    @Test(arguments: [SessionState.Phase.idle, .bringingUp, .ending, .ended], audioEvents)
    func audioEventsOutsideRecordingAreIgnored_state(phase: SessionState.Phase, event: SessionEvent) {

        assert(makeWarned().with { $0.phase = phase }, event)
    }

    @Test(arguments: [SessionState.Phase.idle, .bringingUp, .ending, .ended], audioEvents)
    func audioEventsOutsideRecordingAreIgnored_effect(phase: SessionState.Phase, event: SessionEvent) {

        assert(makeWarned().with { $0.phase = phase }, event, delivers: nil)
    }

    @Test func beginStartsWithCleanAudioObservation_state() {

        assert(makeWarned().with { $0.phase = .idle }, .begin(liveText: false)) {
            $0.phase = .bringingUp
            $0.wantedLiveText = false
            $0.audioWarning = nil
            $0.audioObservation = .init()
        }
    }

    @Test func beginStartsWithCleanAudioObservation_effect() {

        assert(makeWarned().with { $0.phase = .idle }, .begin(liveText: false), delivers: .checkModels)
    }

    @Test func warningLeavesHealthFailuresAndRecordabilityAlone_state() {

        assert(makeFailing(), call(0, 300)) {
            $0.audioObservation.callCoveredThrough = 300
            $0.audioObservation.callSilentSince = 0
            $0.audioObservation.warningIssued = true
            $0.audioWarning = .callSilent
        }
    }

    @Test func warningLeavesHealthFailuresAndRecordabilityAlone_effect() {

        assert(makeFailing(), call(0, 300), delivers: nil)
    }

    @Test func nonzeroCallAudioClearsWarningEvenWhileMicrophoneLags_state() {

        assert(makeWarned(), call(300, 400, nonzero: true)) {
            $0.audioObservation.callCoveredThrough = 400
            $0.audioObservation.callSilentSince = 400
            $0.audioWarning = nil
        }
    }

    @Test func nonzeroCallAudioClearsWarningEvenWhileMicrophoneLags_effect() {

        assert(makeWarned(), call(300, 400, nonzero: true), delivers: nil)
    }

    @Test(arguments: invalidAndOverlapping)
    func invalidAndOverlappingIntervalsAreIgnored_state(event: SessionEvent) {

        assert(makeWarned(), event)
    }

    @Test(arguments: invalidAndOverlapping)
    func invalidAndOverlappingIntervalsAreIgnored_effect(event: SessionEvent) {

        assert(makeWarned(), event, delivers: nil)
    }

    @Test func microphoneActivityExtendsAnExistingWindow_state() {

        assert(makeAudioState(microphoneSince: 299.9, microphoneThrough: 300), level(300, 300.02)) {
            $0.audioObservation.microphoneCoveredThrough = 300.02
            $0.audioObservation.microphoneActivity[0].through = 300.02
        }
    }

    @Test func microphoneActivityExtendsAnExistingWindow_effect() {

        assert(makeAudioState(microphoneSince: 299.9, microphoneThrough: 300), level(300, 300.02), delivers: nil)
    }

    @Test(arguments: [0.02, 0.099, 0.1])
    func firstMicrophoneWindowStartsActivity_state(duration: Double) {

        assert(makeAudioState(callThrough: 300, silentSince: 0), level(299.9, 299.9 + duration)) {
            $0.audioObservation.microphoneCoveredThrough = 299.9 + duration
            $0.audioObservation.microphoneActiveSince = 299.9
            if duration == 0.1 {
                $0.audioObservation.microphoneActivity = [.init(qualifiedAt: 300, through: 300)]
                $0.audioObservation.warningIssued = true
                $0.audioWarning = .callSilent
            }
        }
    }

    @Test(arguments: [0.02, 0.099, 0.1])
    func firstMicrophoneWindowStartsActivity_effect(duration: Double) {

        assert(makeAudioState(callThrough: 300, silentSince: 0), level(299.9, 299.9 + duration), delivers: nil)
    }

    @Test func callSilenceWithoutQualifiedMicrophoneActivityDoesNotWarn_state() {

        let state = makeAudioState(microphoneSince: 299.98, microphoneThrough: 300.02, activity: [])
        assert(state, call(0, 300.02)) {
            $0.audioObservation.callCoveredThrough = 300.02
            $0.audioObservation.callSilentSince = 0
        }
    }

    @Test func callSilenceWithoutQualifiedMicrophoneActivityDoesNotWarn_effect() {

        let state = makeAudioState(microphoneSince: 299.98, microphoneThrough: 300.02, activity: [])
        assert(state, call(0, 300.02), delivers: nil)
    }

    private func makeReset() -> SessionState {

        makeAudioState(callThrough: 300, silentSince: 300, microphoneSince: 599.9, microphoneThrough: 600)
    }

    private func makeCleared() -> SessionState {

        makeAudioState(callThrough: 300.02, silentSince: 300.02, microphoneSince: 600, microphoneThrough: 600.1,
                       activity: [.init(qualifiedAt: 300, through: 300), .init(qualifiedAt: 600.1, through: 600.1)], issued: true)
    }

    private func makeCallFirst(_ origin: Double) -> SessionState {

        makeAudioState(callThrough: origin + 300, silentSince: origin,
                       microphoneSince: origin + 400, microphoneThrough: origin + 400.08, activity: [])
    }

    private func makeDelayedCall(_ earlierActivity: Double) -> SessionState {

        makeAudioState(callThrough: 1, silentSince: 0, microphoneSince: 599.9, microphoneThrough: 600,
                       activity: [.init(qualifiedAt: earlierActivity + 0.1, through: earlierActivity + 0.1),
                                  .init(qualifiedAt: 600, through: 600)])
    }

    private func makeMicrophoneEdge() -> SessionState {

        makeAudioState(callThrough: 300, silentSince: 0, microphoneSince: 299.9, microphoneThrough: 299.98, activity: [])
    }

    private func makeMicrophoneRun() -> SessionState {

        makeAudioState(callThrough: 300.02, silentSince: 0, microphoneSince: 299.88, microphoneThrough: 299.96, activity: [])
    }

    private func makeQuietMicrophone() -> SessionState {

        makeMicrophoneRun().with {
            $0.audioObservation.microphoneCoveredThrough = 299.98
            $0.audioObservation.microphoneActiveSince = nil
        }
    }

    private func makeMicrophoneBehind() -> SessionState {

        makeAudioState(microphoneSince: 299.88, microphoneThrough: 299.98)
    }

    private func makeCallAhead() -> SessionState {

        makeMicrophoneBehind().with {
            $0.audioObservation.callCoveredThrough = 600
            $0.audioObservation.callSilentSince = 0
        }
    }

    private func makeFailing() -> SessionState {

        makeAudioState(microphoneSince: 299.9, microphoneThrough: 300).with {
            $0.health[.capture(.call)] = .failed("lost")
            $0.failures = [.init(piece: "call", message: "lost")]
            $0.cannotRecord = "kept reason"
        }
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

private let audioEvents = [call(300, 301, nonzero: true), level(300, 300.02)]

private let invalidAndOverlapping = [
    call(300, 300), call(301, 300), call(.nan, 301), call(300, .infinity),
    call(299.98, 300.02, nonzero: true), call(0, 300, nonzero: true),
    level(300, 300), level(301, 300), level(-.infinity, 301), level(300, .nan),
    level(299.98, 300.02),
]

private func call(_ start: Double, _ end: Double, nonzero: Bool = false) -> SessionEvent {

    .callAudioStatistics(start: start, end: end, hasFiniteNonzeroSample: nonzero)
}

private func level(_ start: Double, _ end: Double, rms: Double = 0.01) -> SessionEvent {

    .microphoneLevel(start: start, end: end, rms: rms)
}
