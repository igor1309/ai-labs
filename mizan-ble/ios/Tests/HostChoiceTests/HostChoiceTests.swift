import HostChoice
import Testing

private typealias Choice = HostChoice<String>

struct HostChoiceTests {
    @Test func rivalOrFadeEndsChoiceImmediatelyAndReevaluatesSignal() {
        let cases: [(Choice.Signal, Choice.Answer, String?)] = [
            (.noLeader, .holdCloser, nil),
            (.noHost, .none, nil),
            (.leader("B", .aboveFloor), .host("B"), "B"),
            (.leader("B", .betweenLines), .holdCloser, nil),
            (.leader("B", .belowDrop(since: 10)), .holdCloser, nil),
        ]
        for (signal, answer, chosen) in cases {
            var choice = Choice(hold: 1)
            #expect(choice.receive(.leader("A", .aboveFloor), at: 0) == .host("A"))
            #expect(choice.receive(.leader("A", .belowDrop(since: 10)), at: 10.1) == .host("A"))
            #expect(choice.receive(signal, at: 10.5) == answer)
            #expect(choice.chosen == chosen)
            #expect(choice.receive(.leader("A", .betweenLines), at: 10.6) == .holdCloser)
            #expect(choice.chosen == nil)
            #expect(choice.receive(.leader("A", .aboveFloor), at: 10.7) == .host("A"))
            #expect(choice.chosen == "A")
        }
    }

    @Test func holdsShortDipsThroughRecoveryButEndsAtHoldBoundary() {
        for (hold, justUnder, boundary): (Double, Double, Double) in [
            (1, 10.99, 11),
            (2.5, 12.49, 12.5),
        ] {
            var choice = Choice(hold: hold)
            #expect(choice.receive(.leader("A", .aboveFloor), at: 0) == .host("A"))
            #expect(choice.receive(.leader("A", .belowDrop(since: 1)), at: 1.1) == .host("A"))
            #expect(choice.receive(.leader("A", .belowDrop(since: 1)), at: 1.9) == .host("A"))
            #expect(choice.receive(.leader("A", .betweenLines), at: 2) == .host("A"))
            #expect(choice.receive(.leader("A", .aboveFloor), at: 3) == .host("A"))
            #expect(choice.receive(.leader("A", .belowDrop(since: 10)), at: justUnder) == .host("A"))
            #expect(choice.chosen == "A")
            #expect(choice.receive(.leader("A", .belowDrop(since: 10)), at: boundary) == .holdCloser)
            #expect(choice.chosen == nil)
            #expect(choice.receive(.leader("A", .betweenLines), at: boundary) == .holdCloser)
            #expect(choice.receive(.leader("A", .aboveFloor), at: boundary) == .host("A"))
            #expect(choice.chosen == "A")
        }

        var noHold = Choice(hold: 0)
        #expect(noHold.receive(.leader("A", .aboveFloor), at: 10) == .host("A"))
        #expect(noHold.receive(.leader("A", .belowDrop(since: 10)), at: 10) == .holdCloser)
        #expect(noHold.chosen == nil)
        #expect(noHold.receive(.leader("A", .betweenLines), at: 11) == .holdCloser)
    }

    @Test func keepsChosenLeaderBetweenLines() {
        for host in ["A", "B"] {
            var choice = Choice(hold: 1)
            #expect(choice.receive(.leader(host, .aboveFloor), at: 10) == .host(host))
            #expect(choice.receive(.leader(host, .betweenLines), at: 11) == .host(host))
            #expect(choice.receive(.leader(host, .betweenLines), at: 100) == .host(host))
            #expect(choice.chosen == host)
        }
    }

    @Test func unchosenLeaderBelowDropInsideTheHoldIsNotChosen() {
        var choice = Choice(hold: 1)
        #expect(choice.receive(.leader("A", .belowDrop(since: 10)), at: 10.2) == .holdCloser)
        #expect(choice.chosen == nil)
    }

    @Test func noHostWithoutChoiceAnswersNone() {
        var choice = Choice(hold: 1)
        #expect(choice.receive(.noHost, at: 10) == .none)
        #expect(choice.chosen == nil)
    }

    @Test func heardHostsWithoutAboveFloorLeaderNeedCloser() {
        let signals: [Choice.Signal] = [
            .noLeader,
            .leader("A", .betweenLines),
            .leader("A", .belowDrop(since: 9)),
        ]
        for signal in signals {
            var choice = Choice(hold: 1)
            #expect(choice.receive(signal, at: 10) == .holdCloser)
            #expect(choice.chosen == nil)
        }
    }

    @Test func choosesLeaderAboveFloorAndKeepsItAboveFloor() {
        for host in ["A", "B"] {
            var choice = Choice(hold: 1)
            #expect(choice.chosen == nil)
            #expect(choice.receive(.leader(host, .aboveFloor), at: 10) == .host(host))
            #expect(choice.chosen == host)
            #expect(choice.receive(.leader(host, .aboveFloor), at: 11) == .host(host))
            #expect(choice.chosen == host)
        }
    }
}
