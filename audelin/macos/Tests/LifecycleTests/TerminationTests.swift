import Lifecycle
import Testing

struct TerminationReducerTests {

    @Test func quitPublishesTheIntention_state() { assert(makeTermination(), .quit) { $0.phase = .quitting } }
    @Test func quitPublishesTheIntention_effect() { assert(makeTermination(), .quit, delivers: nil) }

    @Test func quitWithNothingToSettleTerminates_state() { assert(makeTermination(unsettled: []), .quit) { $0.phase = .terminating } }
    @Test func quitWithNothingToSettleTerminates_effect() { assert(makeTermination(unsettled: []), .quit, delivers: .terminate) }

    @Test func aSettledParticipantIsCrossedOff_state() { assert(makeQuitting(), .settled(.recording)) { $0.unsettled.remove(.recording) } }
    @Test func aSettledParticipantIsCrossedOff_effect() { assert(makeQuitting(), .settled(.recording), delivers: nil) }

    @Test(arguments: TerminationParticipant.allCases)
    func theLastSettledTerminates_state(_ last: TerminationParticipant) { assert(makeQuitting(unsettled: [last]), .settled(last)) { $0.unsettled = []; $0.phase = .terminating } }
    @Test(arguments: TerminationParticipant.allCases)
    func theLastSettledTerminates_effect(_ last: TerminationParticipant) { assert(makeQuitting(unsettled: [last]), .settled(last), delivers: .terminate) }

    @Test func settledBeforeQuitIsKeptAndDoesNotTerminate_state() { assert(makeTermination(unsettled: [.storage]), .settled(.storage)) { $0.unsettled = [] } }
    @Test func settledBeforeQuitIsKeptAndDoesNotTerminate_effect() { assert(makeTermination(unsettled: [.storage]), .settled(.storage), delivers: nil) }

    @Test func aRepeatedSettledChangesNothing_state() { assert(makeQuitting(unsettled: [.storage]), .settled(.recording)) }
    @Test func aRepeatedSettledChangesNothing_effect() { assert(makeQuitting(unsettled: [.storage]), .settled(.recording), delivers: nil) }

    @Test func quitWhileRelaunchingPublishesTheIntention_state() { assert(makeTermination(phase: .relaunching), .quit) { $0.phase = .quitting } }
    @Test func quitWhileRelaunchingPublishesTheIntention_effect() { assert(makeTermination(phase: .relaunching), .quit, delivers: nil) }

    @Test func anUnblockedRelaunchStarts_state() { assert(makeTermination(), .relaunchRequested(blockers: [])) { $0.phase = .relaunching } }
    @Test func anUnblockedRelaunchStarts_effect() { assert(makeTermination(), .relaunchRequested(blockers: []), delivers: .relaunch) }

    @Test(arguments: RelaunchBlocker.allCases)
    func aBlockedRelaunchWaits_state(_ blocker: RelaunchBlocker) { assert(makeTermination(), .relaunchRequested(blockers: [blocker])) }
    @Test(arguments: RelaunchBlocker.allCases)
    func aBlockedRelaunchWaits_effect(_ blocker: RelaunchBlocker) { assert(makeTermination(), .relaunchRequested(blockers: [blocker]), delivers: nil) }

    @Test(arguments: [TerminationState.Phase.relaunching, .quitting, .terminating, .terminated])
    func aRelaunchOutsideRunningChangesNothing_state(_ phase: TerminationState.Phase) { assert(makeTermination(phase: phase), .relaunchRequested(blockers: [])) }
    @Test(arguments: [TerminationState.Phase.relaunching, .quitting, .terminating, .terminated])
    func aRelaunchOutsideRunningChangesNothing_effect(_ phase: TerminationState.Phase) { assert(makeTermination(phase: phase), .relaunchRequested(blockers: []), delivers: nil) }

    @Test func aStartedRelaunchQuits_state() { assert(makeTermination(phase: .relaunching), .relaunched(true)) { $0.phase = .quitting } }
    @Test func aStartedRelaunchQuits_effect() { assert(makeTermination(phase: .relaunching), .relaunched(true), delivers: nil) }

    @Test func aStartedRelaunchWithNothingToSettleTerminates_state() { assert(makeTermination(phase: .relaunching, unsettled: []), .relaunched(true)) { $0.phase = .terminating } }
    @Test func aStartedRelaunchWithNothingToSettleTerminates_effect() { assert(makeTermination(phase: .relaunching, unsettled: []), .relaunched(true), delivers: .terminate) }

    @Test func aFailedRelaunchKeepsRunning_state() { assert(makeTermination(phase: .relaunching), .relaunched(false)) { $0.phase = .running } }
    @Test func aFailedRelaunchKeepsRunning_effect() { assert(makeTermination(phase: .relaunching), .relaunched(false), delivers: nil) }

    @Test(arguments: [TerminationState.Phase.running, .quitting, .terminating, .terminated], [false, true])
    func aRelaunchResultOutsideRelaunchingChangesNothing_state(_ phase: TerminationState.Phase, _ started: Bool) { assert(makeTermination(phase: phase), .relaunched(started)) }
    @Test(arguments: [TerminationState.Phase.running, .quitting, .terminating, .terminated], [false, true])
    func aRelaunchResultOutsideRelaunchingChangesNothing_effect(_ phase: TerminationState.Phase, _ started: Bool) { assert(makeTermination(phase: phase), .relaunched(started), delivers: nil) }

    @Test(arguments: [TerminationState.Phase.quitting, .terminating, .terminated])
    func aRepeatedQuitChangesNothing_state(_ phase: TerminationState.Phase) { assert(makeTermination(phase: phase), .quit) }
    @Test(arguments: [TerminationState.Phase.quitting, .terminating, .terminated])
    func aRepeatedQuitChangesNothing_effect(_ phase: TerminationState.Phase) { assert(makeTermination(phase: phase), .quit, delivers: nil) }

    @Test func terminationCompletes_state() { assert(makeTermination(phase: .terminating, unsettled: []), .terminated) { $0.phase = .terminated } }
    @Test func terminationCompletes_effect() { assert(makeTermination(phase: .terminating, unsettled: []), .terminated, delivers: nil) }

    @Test(arguments: [TerminationState.Phase.running, .quitting, .terminated])
    func terminatedOutOfOrderChangesNothing_state(_ phase: TerminationState.Phase) { assert(makeTermination(phase: phase), .terminated) }
    @Test(arguments: [TerminationState.Phase.running, .quitting, .terminated])
    func terminatedOutOfOrderChangesNothing_effect(_ phase: TerminationState.Phase) { assert(makeTermination(phase: phase), .terminated, delivers: nil) }
}

@Suite(.timeLimit(.minutes(1)))
struct TerminationEffectHandlerTests {

    @Test func terminateDeliversTerminatedOnceTerminateReturns() async {

        let gate = Gate()
        let sut = TerminationEffectHandler(relaunch: { Issue.record("relaunched"); return false }, terminate: { await gate.enter() })
        async let event = sut.handle(.terminate)
        await gate.open()
        #expect(await event == .terminated)
        #expect(await gate.entries == 1)
    }

    @Test(arguments: [false, true])
    func relaunchDeliversWhetherTheNewInstanceStarted(_ started: Bool) async {

        let gate = Gate()
        let sut = TerminationEffectHandler(relaunch: { await gate.enter(); return started }, terminate: { Issue.record("terminated") })
        async let event = sut.handle(.relaunch)
        await gate.open()
        #expect(await event == .relaunched(started))
        #expect(await gate.entries == 1)
    }
}

private func makeTermination(phase: TerminationState.Phase = .running,
                             unsettled: Set<TerminationParticipant> = Set(TerminationParticipant.allCases)) -> TerminationState {
    TerminationState(phase: phase, unsettled: unsettled)
}

private func makeQuitting(unsettled: Set<TerminationParticipant> = Set(TerminationParticipant.allCases)) -> TerminationState {
    makeTermination(phase: .quitting, unsettled: unsettled)
}

private func assert(_ state: TerminationState, _ event: TerminationEvent, _ update: (inout TerminationState) -> Void = { _ in },
                    sourceLocation: SourceLocation = #_sourceLocation) {
    var expected = state
    update(&expected)
    #expect(TerminationReducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

private func assert(_ state: TerminationState, _ event: TerminationEvent, delivers expected: TerminationEffect?,
                    sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(TerminationReducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

/// Holds the collaborator's call until the test opens it; opening waits for the call.
private actor Gate {

    private(set) var entries = 0
    private var held: CheckedContinuation<Void, Never>?
    private var waiting: CheckedContinuation<Void, Never>?

    func enter() async {
        entries += 1
        await withCheckedContinuation { held = $0; waiting?.resume(); waiting = nil }
    }

    func open() async {
        while held == nil { await withCheckedContinuation { waiting = $0 } }
        held?.resume()
        held = nil
    }
}
