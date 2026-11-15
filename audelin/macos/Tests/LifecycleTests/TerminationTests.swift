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

    @Test func blockersAreKept_state() { assert(makeTermination(), .blockersChanged([.summaries])) { $0.blockers = [.summaries] } }
    @Test func blockersAreKept_effect() { assert(makeTermination(), .blockersChanged([.summaries]), delivers: nil) }

    // S-3
    @Test func anUnblockedRelaunchTakesTheClaim_state() { assert(makeTermination(), .relaunchRequested) { $0.relaunch = .taking(cancelled: false) } }
    @Test func anUnblockedRelaunchTakesTheClaim_effect() { assert(makeTermination(), .relaunchRequested, delivers: .claimFolder) }

    // S-4
    @Test(arguments: RelaunchBlocker.allCases)
    func aBlockedRelaunchTakesNoClaim_state(_ blocker: RelaunchBlocker) { assert(makeTermination { $0.blockers = [blocker] }, .relaunchRequested) }
    @Test(arguments: RelaunchBlocker.allCases)
    func aBlockedRelaunchTakesNoClaim_effect(_ blocker: RelaunchBlocker) { assert(makeTermination { $0.blockers = [blocker] }, .relaunchRequested, delivers: nil) }

    @Test(arguments: busyTerminations)
    func aRelaunchWhileBusyOrNotRunningChangesNothing_state(_ state: TerminationState) { assert(state, .relaunchRequested) }
    @Test(arguments: busyTerminations)
    func aRelaunchWhileBusyOrNotRunningChangesNothing_effect(_ state: TerminationState) { assert(state, .relaunchRequested, delivers: nil) }

    // S-5
    @Test func aGrantedClaimStartsTheRelaunch_state() { assert(makeTaking(), .folderClaimed(token: 7)) { $0.token = 7; $0.relaunch = .starting } }
    @Test func aGrantedClaimStartsTheRelaunch_effect() { assert(makeTaking(), .folderClaimed(token: 7), delivers: .relaunch) }

    // S-6
    @Test func aRefusedClaimKeepsRunning_state() { assert(makeTaking(), .folderClaimed(token: nil)) { $0.relaunch = nil } }
    @Test func aRefusedClaimKeepsRunning_effect() { assert(makeTaking(), .folderClaimed(token: nil), delivers: nil) }

    // S-7
    @Test(arguments: RelaunchBlocker.allCases)
    func aBlockerDuringTheTakeCancelsIt_state(_ blocker: RelaunchBlocker) { assert(makeTaking(), .blockersChanged([blocker])) { $0.blockers = [blocker]; $0.relaunch = .taking(cancelled: true) } }
    @Test(arguments: RelaunchBlocker.allCases)
    func aBlockerDuringTheTakeCancelsIt_effect(_ blocker: RelaunchBlocker) { assert(makeTaking(), .blockersChanged([blocker]), delivers: nil) }

    @Test func aCancelledGrantIsReleased_state() { assert(makeTaking(cancelled: true), .folderClaimed(token: 7)) { $0.token = 7; $0.relaunch = .releasing } }
    @Test func aCancelledGrantIsReleased_effect() { assert(makeTaking(cancelled: true), .folderClaimed(token: 7), delivers: .releaseFolder(token: 7)) }

    @Test func aCancelledRefusalKeepsRunning_state() { assert(makeTaking(cancelled: true), .folderClaimed(token: nil)) { $0.relaunch = nil } }
    @Test func aCancelledRefusalKeepsRunning_effect() { assert(makeTaking(cancelled: true), .folderClaimed(token: nil), delivers: nil) }

    @Test func theReleaseReturnsToRunning_state() { assert(makeReleasing(), .folderReleased) { $0.relaunch = nil; $0.token = nil } }
    @Test func theReleaseReturnsToRunning_effect() { assert(makeReleasing(), .folderReleased, delivers: nil) }

    // S-8
    @Test func aQuitDuringTheTakeCancelsIt_state() { assert(makeTaking(), .quit) { $0.phase = .quitting; $0.relaunch = .taking(cancelled: true) } }
    @Test func aQuitDuringTheTakeCancelsIt_effect() { assert(makeTaking(), .quit, delivers: nil) }

    @Test func aGrantAfterTheQuitIsReleasedWithoutStarting_state() { assert(makeTaking(cancelled: true) { $0.phase = .quitting }, .folderClaimed(token: 7)) { $0.token = 7; $0.relaunch = .releasing } }
    @Test func aGrantAfterTheQuitIsReleasedWithoutStarting_effect() { assert(makeTaking(cancelled: true) { $0.phase = .quitting }, .folderClaimed(token: 7), delivers: .releaseFolder(token: 7)) }

    @Test func theReleaseAfterTheQuitTerminates_state() { assert(makeReleasing { $0.phase = .quitting; $0.unsettled = [] }, .folderReleased) { $0.relaunch = nil; $0.token = nil; $0.phase = .terminating } }
    @Test func theReleaseAfterTheQuitTerminates_effect() { assert(makeReleasing { $0.phase = .quitting; $0.unsettled = [] }, .folderReleased, delivers: .terminate) }

    // S-9
    @Test func aFailedStartReleasesTheClaim_state() { assert(makeStarting(), .relaunched(false)) { $0.relaunch = .releasing } }
    @Test func aFailedStartReleasesTheClaim_effect() { assert(makeStarting(), .relaunched(false), delivers: .releaseFolder(token: 7)) }

    // S-10
    @Test func aScheduledRelaunchQuitsHoldingTheClaim_state() { assert(makeStarting(), .relaunched(true)) { $0.relaunch = nil; $0.phase = .quitting } }
    @Test func aScheduledRelaunchQuitsHoldingTheClaim_effect() { assert(makeStarting(), .relaunched(true), delivers: nil) }

    @Test func aScheduledRelaunchWithNothingToSettleTerminates_state() { assert(makeStarting { $0.unsettled = [] }, .relaunched(true)) { $0.relaunch = nil; $0.phase = .terminating } }
    @Test func aScheduledRelaunchWithNothingToSettleTerminates_effect() { assert(makeStarting { $0.unsettled = [] }, .relaunched(true), delivers: .terminate) }

    // S-11, S-13
    @Test(arguments: [TerminationState.Relaunch.taking(cancelled: true), .starting, .releasing])
    func terminationWaitsForLifecyclesOwnWork_state(_ relaunch: TerminationState.Relaunch) { assert(makeQuitting(unsettled: [.storage]) { $0.relaunch = relaunch; $0.token = 7 }, .settled(.storage)) { $0.unsettled = [] } }
    @Test(arguments: [TerminationState.Relaunch.taking(cancelled: true), .starting, .releasing])
    func terminationWaitsForLifecyclesOwnWork_effect(_ relaunch: TerminationState.Relaunch) { assert(makeQuitting(unsettled: [.storage]) { $0.relaunch = relaunch; $0.token = 7 }, .settled(.storage), delivers: nil) }

    @Test func aHeldTokenDoesNotHoldTermination_state() { assert(makeQuitting(unsettled: [.storage]) { $0.token = 7 }, .settled(.storage)) { $0.unsettled = []; $0.phase = .terminating } }
    @Test func aHeldTokenDoesNotHoldTermination_effect() { assert(makeQuitting(unsettled: [.storage]) { $0.token = 7 }, .settled(.storage), delivers: .terminate) }

    // S-12
    @Test func aQuitWhileSchedulingStaysAQuit_state() { assert(makeStarting(), .quit) { $0.phase = .quitting } }
    @Test func aQuitWhileSchedulingStaysAQuit_effect() { assert(makeStarting(), .quit, delivers: nil) }

    @Test func aFailedStartAfterTheQuitReleasesAndKeepsQuitting_state() { assert(makeStarting { $0.phase = .quitting }, .relaunched(false)) { $0.relaunch = .releasing } }
    @Test func aFailedStartAfterTheQuitReleasesAndKeepsQuitting_effect() { assert(makeStarting { $0.phase = .quitting }, .relaunched(false), delivers: .releaseFolder(token: 7)) }

    @Test func aScheduledStartAfterTheQuitKeepsTheClaimAndTerminates_state() { assert(makeStarting { $0.phase = .quitting; $0.unsettled = [] }, .relaunched(true)) { $0.relaunch = nil; $0.phase = .terminating } }
    @Test func aScheduledStartAfterTheQuitKeepsTheClaimAndTerminates_effect() { assert(makeStarting { $0.phase = .quitting; $0.unsettled = [] }, .relaunched(true), delivers: .terminate) }

    @Test(arguments: outOfStageAnswers)
    fileprivate func anAnswerOutsideItsStageChangesNothing_state(_ given: OutOfStage) { assert(given.state, given.event) }
    @Test(arguments: outOfStageAnswers)
    fileprivate func anAnswerOutsideItsStageChangesNothing_effect(_ given: OutOfStage) { assert(given.state, given.event, delivers: nil) }

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
        let sut = makeHandler(terminate: { await gate.enter() })
        async let event = sut.handle(.terminate)
        await gate.open()
        #expect(await event == .terminated)
        #expect(await gate.entries == 1)
    }

    @Test(arguments: [false, true])
    func relaunchDeliversWhetherTheNewInstanceWasScheduled(_ started: Bool) async {

        let gate = Gate()
        let sut = makeHandler(relaunch: { await gate.enter(); return started })
        async let event = sut.handle(.relaunch)
        await gate.open()
        #expect(await event == .relaunched(started))
        #expect(await gate.entries == 1)
    }

    @Test(arguments: [nil, 7] as [UInt64?])
    func claimDeliversTheAnswer(_ token: UInt64?) async {

        let gate = Gate()
        let sut = makeHandler(claimFolder: { await gate.enter(); return token })
        async let event = sut.handle(.claimFolder)
        await gate.open()
        #expect(await event == .folderClaimed(token: token))
        #expect(await gate.entries == 1)
    }

    @Test func releaseDeliversReleasedOnceTheClaimIsLetGo() async {

        let gate = Gate(), released = Released()
        let sut = makeHandler(releaseFolder: { await released.add($0); await gate.enter() })
        async let event = sut.handle(.releaseFolder(token: 7))
        await gate.open()
        #expect(await event == .folderReleased)
        #expect(await released.tokens == [7])
    }
}

private actor Released {
    private(set) var tokens: [UInt64] = []
    func add(_ token: UInt64) { tokens.append(token) }
}

private func makeHandler(claimFolder: @escaping @Sendable () async -> UInt64? = { Issue.record("claimed"); return nil },
                         releaseFolder: @escaping @Sendable (UInt64) async -> Void = { _ in Issue.record("released") },
                         relaunch: @escaping @Sendable () async -> Bool = { Issue.record("relaunched"); return false },
                         terminate: @escaping @Sendable () async -> Void = { Issue.record("terminated") }) -> TerminationEffectHandler {
    TerminationEffectHandler(claimFolder: claimFolder, releaseFolder: releaseFolder, relaunch: relaunch, terminate: terminate)
}

private let busyTerminations: [TerminationState] = [
    makeTaking(), makeStarting(), makeReleasing(), makeTermination { $0.token = 7 },
    makeQuitting(), makeTermination(phase: .terminating), makeTermination(phase: .terminated)
]

fileprivate struct OutOfStage: Sendable, CustomTestStringConvertible {
    let state: TerminationState
    let event: TerminationEvent
    var testDescription: String { "\(event) in \(state)" }
}

private let outOfStageAnswers: [OutOfStage] = [
    .init(state: makeTermination(), event: .folderClaimed(token: 7)),
    .init(state: makeStarting(), event: .folderClaimed(token: 7)),
    .init(state: makeTermination(), event: .relaunched(true)),
    .init(state: makeTaking(), event: .relaunched(false)),
    .init(state: makeTermination(), event: .folderReleased),
    .init(state: makeStarting(), event: .folderReleased)
]

private func makeTaking(cancelled: Bool = false, _ change: (inout TerminationState) -> Void = { _ in }) -> TerminationState {
    makeTermination { $0.relaunch = .taking(cancelled: cancelled); change(&$0) }
}

private func makeStarting(_ change: (inout TerminationState) -> Void = { _ in }) -> TerminationState {
    makeTermination { $0.relaunch = .starting; $0.token = 7; change(&$0) }
}

private func makeReleasing(_ change: (inout TerminationState) -> Void = { _ in }) -> TerminationState {
    makeTermination { $0.relaunch = .releasing; $0.token = 7; change(&$0) }
}

private func makeTermination(phase: TerminationState.Phase = .running,
                             unsettled: Set<TerminationParticipant> = Set(TerminationParticipant.allCases),
                             _ change: (inout TerminationState) -> Void = { _ in }) -> TerminationState {
    var state = TerminationState(phase: phase, unsettled: unsettled); change(&state); return state
}

private func makeQuitting(unsettled: Set<TerminationParticipant> = Set(TerminationParticipant.allCases),
                          _ change: (inout TerminationState) -> Void = { _ in }) -> TerminationState {
    makeTermination(phase: .quitting, unsettled: unsettled, change)
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
