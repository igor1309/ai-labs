import HostPicker
import Testing

private typealias Picker = HostPicker<String>

struct HostPickerTests {
    @Test func viewReportsSmoothedLeaderAndCandidateCount() {
        var scan = makeScan(alpha: 0.5)
        scan.hear("A", -70)
        scan.hear("A", -60)
        scan.hear("B", -50)
        scan.hear("B", -58)
        scan.hear("unavailable", 127)
        let view = scan.picker.view(at: scan.clock.now)
        #expect(view.leaderAverage == -54)
        #expect(view.candidateCount == 2)
    }

    @Test func viewExcludesExpiredCandidatesAtTheFadeBoundary() {
        var scan = makeScan()
        let empty = scan.picker.view(at: scan.clock.now)
        #expect(empty.leaderAverage == nil && empty.candidateCount == 0)
        scan.hear("A", -50)
        scan.clock.advance(by: 1)
        scan.hear("B", -70)
        let beforeFade = scan.picker.view(at: scan.clock.now + 0.999)
        #expect(beforeFade.leaderAverage == -50 && beforeFade.candidateCount == 2)
        let atFade = scan.picker.view(at: scan.clock.now + 1)
        #expect(atFade.leaderAverage == -70 && atFade.candidateCount == 1)
        let allExpired = scan.picker.view(at: scan.clock.now + 2)
        #expect(allExpired.leaderAverage == nil && allExpired.candidateCount == 0)
    }

    @Test func viewDoesNotMutateThePicker() {
        var scan = makeScan()
        scan.window(["A": -50])
        let picker = scan.picker
        let expired = picker.view(at: scan.clock.now + 2)
        #expect(expired.leaderAverage == nil && expired.candidateCount == 0)
        let current = picker.view(at: scan.clock.now)
        #expect(current.leaderAverage == -50 && current.candidateCount == 1)
        #expect(scan.picker.answer(at: scan.clock.now) == .host("A"))
    }

    @Test func oneNearHost() {
        var scan = makeScan()
        scan.window(["A": -50])
        #expect(scan.answer == .host("A"))
    }

    @Test func oneFarHost() {
        var scan = makeScan()
        scan.window(["A": -70])
        #expect(scan.answer == .holdCloser)
    }

    @Test func oneHostBeforeTheWindow() {
        var scan = makeScan()
        scan.window(["A": -50], duration: 0.6)
        #expect(scan.answer == .holdCloser)
    }

    @Test func clearlyNearerOfTwoHosts() {
        for (near, far) in [("A", "B"), ("B", "A")] {
            var scan = makeScan()
            scan.window([near: -50, far: -60])
            #expect(scan.answer == .host(near))
        }
    }

    @Test func twoHostsTooCloseToCall() {
        var scan = makeScan()
        scan.window(["A": -50, "B": -53])
        #expect(scan.answer == .holdCloser)
    }

    @Test func chosenHostFadesOut() {
        var scan = makeScan()
        scan.window(["A": -50])
        #expect(scan.answer == .host("A"))
        scan.clock.advance(by: 2.1)
        #expect(scan.answer == .none)
    }

    @Test func fadingHostLetsTheOtherWin() {
        var scan = makeScan()
        scan.window(["A": -50, "B": -53])
        #expect(scan.answer == .holdCloser)
        for _ in 0..<7 {
            scan.clock.advance(by: 0.3)
            scan.hear("B", -53)
        }
        #expect(scan.answer == .host("B"))
    }

    @Test func unavailableReadingsAreIgnored() {
        var scan = makeScan()
        var withoutUnavailable = makeScan()
        for index in 0..<5 {
            scan.hear("A", -50)
            withoutUnavailable.hear("A", -50)
            if index < 3 { scan.hear("A", 127) }
            if index < 4 {
                scan.clock.advance(by: 0.25)
                withoutUnavailable.clock.advance(by: 0.25)
            }
        }
        #expect(scan.answer == .host("A"))
        #expect(scan.answer == withoutUnavailable.answer)
    }

    @Test func spikeIsSmoothed() {
        var scan = makeScan()
        scan.window(["A": -50, "B": -70])
        #expect(scan.answer == .host("A"))
        #expect(scan.hear("B", -45) == .host("A"))
    }

    @Test func newcomerNearTheLeaderBlocksChoice() {
        var scan = makeScan()
        scan.window(["A": -50])
        #expect(scan.answer == .host("A"))
        #expect(scan.hear("B", -52) == .holdCloser)
    }

    @Test func noHosts() {
        var scan = makeScan()
        #expect(scan.answer == .none)
        scan.clock.advance(by: 10)
        #expect(scan.answer == .none)
    }

    @Test func equalHostsWithZeroMargin() {
        var scan = makeScan(margin: 0)
        scan.window(["A": -50, "B": -50])
        #expect(scan.answer == .holdCloser)
    }

    @Test func floorIsStrict() {
        for (floor, expected): (Double, Picker.Answer) in [
            (-65, .holdCloser), (-65.5, .host("A")), (-64.5, .holdCloser),
        ] {
            var scan = makeScan(floor: floor)
            scan.window(["A": -65])
            #expect(scan.answer == expected)
        }
    }

    @Test func marginIsStrict() {
        for (margin, expected): (Double, Picker.Answer) in [
            (6, .holdCloser), (5.5, .host("A")), (6.5, .holdCloser), (0, .host("A")),
        ] {
            var scan = makeScan(margin: margin)
            scan.window(["A": -50, "B": -56])
            #expect(scan.answer == expected)
        }
    }

    @Test func enoughReadingsAndTimeAreBothRequired() {
        var scan = makeScan(windowSeconds: 1.5, windowReadings: 3)
        scan.hear("A", -50)
        scan.clock.advance(by: 1)
        scan.hear("A", -50)
        #expect(scan.answer == .holdCloser)
        #expect(scan.hear("A", -50) == .holdCloser)
        scan.clock.advance(by: 0.5)
        #expect(scan.answer == .host("A"))

        var sparse = makeScan(windowSeconds: 1.5, windowReadings: 3)
        sparse.hear("A", -50)
        sparse.clock.advance(by: 1.5)
        sparse.hear("A", -50)
        #expect(sparse.answer == .holdCloser)
        #expect(sparse.hear("A", -50) == .host("A"))

        var fast = makeScan()
        fast.window(["A": -50], duration: 0.5)
        #expect(fast.answer == .holdCloser)
        fast.clock.advance(by: 0.5)
        #expect(fast.answer == .host("A"))
    }

    @Test func fadeUsesTheLastReadingAndIncludesTheBoundary() {
        var scan = makeScan(fade: 0.5)
        scan.window(["A": -50])
        #expect(scan.answer == .host("A"))
        scan.clock.advance(by: 0.25)
        #expect(scan.answer == .host("A"))
        scan.clock.advance(by: 0.25)
        #expect(scan.answer == .none)
    }

    @Test func unavailableReadingsSupplyNoCandidateOrEvidence() {
        var scan = makeScan()
        scan.hear("A", 127)
        scan.clock.advance(by: 1)
        #expect(scan.answer == .none)
        scan.hear("A", -50)
        scan.clock.advance(by: 0.5)
        for _ in 0..<4 { scan.hear("A", -50) }
        #expect(scan.answer == .holdCloser)

        var count = makeScan()
        count.hear("A", -50)
        count.clock.advance(by: 1)
        for _ in 0..<3 { count.hear("A", -50) }
        for _ in 0..<3 { count.hear("A", 127) }
        #expect(count.answer == .holdCloser)
        #expect(count.hear("A", -50) == .host("A"))
    }

    @Test func unavailableReadingsDoNotPreventFade() {
        var scan = makeScan()
        scan.window(["A": -50])
        #expect(scan.answer == .host("A"))
        scan.clock.advance(by: 1)
        scan.hear("A", 127)
        scan.clock.advance(by: 1)
        #expect(scan.hear("A", 127) == .none)
    }

    @Test func returningHostStartsFreshEvenWithoutAnInterveningTick() {
        for tickDuringGap in [false, true] {
            for waitBeforeReadings in [false, true] {
                for (previous, floor) in [(-50, -65.0), (-90, -52.0)] {
                    var scan = makeScan(floor: floor)
                    scan.window(["A": previous])
                    #expect(scan.answer == (Double(previous) > floor ? .host("A") : .holdCloser))
                    scan.clock.advance(by: 2)
                    if tickDuringGap { #expect(scan.answer == .none) }
                    #expect(scan.hear("A", -50) == .holdCloser)
                    if waitBeforeReadings {
                        scan.clock.advance(by: 1)
                        #expect(scan.answer == .holdCloser)
                    }
                    for _ in 0..<4 { scan.hear("A", -50) }
                    if !waitBeforeReadings {
                        #expect(scan.answer == .holdCloser)
                        scan.clock.advance(by: 1)
                    }
                    #expect(scan.answer == .host("A"))
                }
            }
        }
    }

    @Test func suppliedAlphaControlsTheAverageFromTheFirstReading() {
        for (alpha, expected): (Double, Picker.Answer) in [
            (0.3, .host("A")), (1, .host("B")), (0.05, .host("A")),
        ] {
            var scan = makeScan(alpha: alpha)
            scan.window(["A": -50, "B": -70])
            #expect(scan.answer == .host("A"))
            #expect(scan.hear("B", -40) == expected)
        }
    }

    @Test func immatureStrongestHostCannotFallBackToMatureHost() {
        var scan = makeScan()
        scan.window(["A": -50])
        #expect(scan.answer == .host("A"))
        #expect(scan.hear("B", -40) == .holdCloser)
        scan.clock.advance(by: 1)
        #expect(scan.answer == .holdCloser)
        for _ in 0..<4 { scan.hear("B", -40) }
        #expect(scan.answer == .host("B"))
    }

    @Test func answerChangesWhenTheLeaderWeakens() {
        var scan = makeScan(alpha: 1)
        scan.window(["A": -50, "B": -60])
        #expect(scan.answer == .host("A"))
        #expect(scan.hear("A", -80) == .host("B"))
        #expect(scan.hear("B", -90) == .holdCloser)
    }
}

private struct FakeClock {
    var now: Double

    mutating func advance(by seconds: Double) { now += seconds }
}

private struct Scan {
    var picker: Picker
    var clock: FakeClock

    var answer: Picker.Answer {
        mutating get { picker.answer(at: clock.now) }
    }

    @discardableResult
    mutating func hear(_ host: String, _ rssi: Int) -> Picker.Answer {
        picker.receive(host: host, rssi: rssi, at: clock.now)
    }

    mutating func window(_ hosts: [String: Int], duration: Double = 1) {
        for index in 0..<5 {
            if index > 0 { clock.advance(by: duration / 4) }
            for (host, rssi) in hosts { hear(host, rssi) }
        }
    }
}

private func makeScan(
    alpha: Double = 0.3, windowSeconds: Double = 1, windowReadings: Int = 5,
    floor: Double = -65, margin: Double = 6, fade: Double = 2
) -> Scan {
    Scan(
        picker: Picker(
            alpha: alpha, windowSeconds: windowSeconds, windowReadings: windowReadings,
            floor: floor, margin: margin, fade: fade
        ),
        clock: FakeClock(now: 100)
    )
}
