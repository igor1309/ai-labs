import Testing
@testable import MicrophoneCapture

@Suite(.timeLimit(.minutes(1)))
struct DeviceFollowingTests {

    struct Step: Sendable {
        let event: DeviceFollowing.Event
        let input: UInt32
        let pending: DeviceFollowing.Settle?
        let failed: Bool
        let action: DeviceFollowing.Action

        init(
            _ event: DeviceFollowing.Event, input: UInt32 = 1,
            pending: DeviceFollowing.Settle? = nil, failed: Bool = false,
            action: DeviceFollowing.Action = .none
        ) {
            self.event = event
            self.input = input
            self.pending = pending
            self.failed = failed
            self.action = action
        }
    }

    struct Rule: Sendable, CustomStringConvertible {
        let description: String
        let steps: [Step]
    }

    static let two = DeviceFollowing.Settle(input: 2, deadline: 1.5)
    static let missing = DeviceFollowing.Settle(input: nil, deadline: 1.5)
    static let three = DeviceFollowing.Settle(input: 3, deadline: 2.5)
    static let returningTwo = DeviceFollowing.Settle(input: 2, deadline: 2.75)

    static let rules: [Rule] = [
        Rule(description: "a delivering input stays until the default holds for 1.5 seconds", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.currentInputDelivering, pending: two),
            Step(.settleReached(two, at: 1.49), pending: two),
            Step(.settleReached(two, at: 1.5), input: 2, action: .rebuild(2)),
        ]),
        Rule(description: "repeated notifications do not restart a held candidate", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.defaultChanged(2, at: 1), pending: two),
            Step(.settleReached(two, at: 1.5), input: 2, action: .rebuild(2)),
        ]),
        Rule(description: "reverting to the delivering input cancels the candidate", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.defaultChanged(1, at: 1)),
            Step(.settleReached(two, at: 1.5)),
        ]),
        Rule(description: "a different candidate gets a full new wait", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.defaultChanged(3, at: 1), pending: three),
            Step(.settleReached(two, at: 1.5), pending: three),
            Step(.settleReached(three, at: 2.5), input: 3, action: .rebuild(3)),
        ]),
        Rule(description: "a returning candidate cannot use its old settle time", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.defaultChanged(1, at: 1)),
            Step(.defaultChanged(2, at: 1.25), pending: returningTwo),
            Step(.settleReached(two, at: 1.5), pending: returningTwo),
            Step(.settleReached(returningTwo, at: 2.74), pending: returningTwo),
            Step(.settleReached(returningTwo, at: 2.75), input: 2, action: .rebuild(2)),
        ]),
        Rule(description: "a missing default for 110 milliseconds during a settle does nothing", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.defaultChanged(nil, at: 1.4), pending: .init(input: nil, deadline: 2.9)),
            Step(.settleReached(two, at: 1.5), pending: .init(input: nil, deadline: 2.9)),
            Step(.defaultChanged(2, at: 1.51), pending: .init(input: 2, deadline: 3.01)),
        ]),
        Rule(description: "a held missing default fails only at its deadline", steps: [
            Step(.defaultChanged(nil, at: 0), pending: missing),
            Step(.currentInputDelivering, pending: missing),
            Step(.settleReached(missing, at: 1.49), pending: missing),
            Step(.settleReached(missing, at: 1.5), failed: true, action: .fail),
            Step(.defaultChanged(2, at: 2), failed: true),
        ]),
        Rule(description: "configuration keeps an available input while its replacement settles", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.configurationChanged(currentAvailable: true, defaultInput: 2), pending: two, action: .rebuild(1)),
            Step(.settleReached(two, at: 1.5), input: 2, action: .rebuild(2)),
        ]),
        Rule(description: "configuration recovers a gone input onto the settling default immediately", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.configurationChanged(currentAvailable: false, defaultInput: 2), input: 2, action: .rebuild(2)),
            Step(.settleReached(two, at: 1.5), input: 2),
        ]),
        Rule(description: "configuration uses the current default even without a notification", steps: [
            Step(.configurationChanged(currentAvailable: false, defaultInput: 3), input: 3, action: .rebuild(3)),
        ]),
        Rule(description: "configuration with a gone input and no default fails immediately", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.configurationChanged(currentAvailable: false, defaultInput: nil), failed: true, action: .fail),
        ]),
        Rule(description: "configuration preserves an available input during a missing default", steps: [
            Step(.defaultChanged(nil, at: 0), pending: missing),
            Step(.configurationChanged(currentAvailable: true, defaultInput: nil), pending: missing, action: .rebuild(1)),
        ]),
        Rule(description: "a refused rebuild fails and cancels its pending candidate", steps: [
            Step(.defaultChanged(2, at: 0), pending: two),
            Step(.rebuildRefused, failed: true, action: .fail),
            Step(.settleReached(two, at: 1.5), failed: true),
            Step(.configurationChanged(currentAvailable: false, defaultInput: 2), failed: true),
        ]),
    ]

    @Test(arguments: rules)
    func deviceFollowingObeysEachRule(rule: Rule) {

        var state = DeviceFollowing(input: 1)
        for step in rule.steps {
            let result = state.transition(step.event)
            #expect(result.action == step.action)
            #expect(result.state.input == step.input)
            #expect(result.state.pending == step.pending)
            #expect(result.state.failed == step.failed)
            state = result.state
        }
    }
}
