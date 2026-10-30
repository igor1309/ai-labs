import HostPicker
import Testing

private typealias Picker = HostPicker<String>

struct HostPickerTests {
    @Test func viewReportsSmoothedStrongestAndCandidateCount() {
        var picker = makePicker(alpha: 0.5)
        picker.receive(host: "A", rssi: -70, at: 100)
        picker.receive(host: "A", rssi: -60, at: 100)
        picker.receive(host: "B", rssi: -50, at: 100)
        picker.receive(host: "B", rssi: -58, at: 100)
        let answer = picker.receive(host: "unavailable", rssi: 127, at: 100)
        #expect(answer == heard(at: 100))
        let view = picker.view(at: 100)
        #expect(view.strongestAverage == -54)
        #expect(view.candidateCount == 2)
    }

    @Test func viewExcludesExpiredCandidatesAtTheFadeBoundary() {
        var picker = makePicker()
        let empty = picker.view(at: 100)
        #expect(empty.strongestAverage == nil && empty.candidateCount == 0)
        #expect(picker.receive(host: "A", rssi: -50, at: 100) == heard(at: 100))
        picker.receive(host: "B", rssi: -70, at: 101)
        let beforeFade = picker.view(at: 101.999)
        #expect(beforeFade.strongestAverage == -50 && beforeFade.candidateCount == 2)
        let atFade = picker.view(at: 102)
        #expect(atFade.strongestAverage == -70 && atFade.candidateCount == 1)
        let allExpired = picker.view(at: 103)
        #expect(allExpired.strongestAverage == nil && allExpired.candidateCount == 0)
    }

    @Test func viewDoesNotMutateThePicker() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        let snapshot = picker
        let expired = snapshot.view(at: 103)
        #expect(expired.strongestAverage == nil && expired.candidateCount == 0)
        let current = snapshot.view(at: 101)
        #expect(current.strongestAverage == -50 && current.candidateCount == 1)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
    }

    @Test func oneNearHost() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
    }

    @Test func oneFarHost() {
        var picker = makePicker()
        window(&picker, ["A": -70], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .betweenLines, at: 101))
    }

    @Test func oneHostBeforeTheWindow() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100, duration: 0.6)
        #expect(picker.answer(at: 100.6) == heard(at: 100.6))
    }

    @Test func clearlyNearerOfTwoHosts() {
        for (near, far) in [("A", "B"), ("B", "A")] {
            var picker = makePicker()
            window(&picker, [near: -50, far: -60], from: 100)
            #expect(picker.answer(at: 101) == leading(near, .aboveFloor, at: 101))
        }
    }

    @Test func twoHostsTooCloseToCall() {
        var picker = makePicker()
        window(&picker, ["A": -50, "B": -53], from: 100)
        #expect(picker.answer(at: 101) == heard(at: 101))
    }

    @Test func chosenHostFadesOut() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.answer(at: 103.1) == silent(at: 103.1))
    }

    @Test func fadingHostLetsTheOtherWin() {
        var picker = makePicker()
        window(&picker, ["A": -50, "B": -53], from: 100)
        #expect(picker.answer(at: 101) == heard(at: 101))
        for index in 1...7 {
            picker.receive(host: "B", rssi: -53, at: 101 + Double(index) * 0.3)
        }
        #expect(picker.answer(at: 103.1) == leading("B", .aboveFloor, at: 103.1))
    }

    @Test func unavailableReadingsAreIgnored() {
        var picker = makePicker()
        var withoutUnavailable = makePicker()
        for index in 0..<5 {
            let time = 100 + Double(index) * 0.25
            picker.receive(host: "A", rssi: -50, at: time)
            withoutUnavailable.receive(host: "A", rssi: -50, at: time)
            if index < 3 { picker.receive(host: "A", rssi: 127, at: time) }
        }
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.answer(at: 101) == withoutUnavailable.answer(at: 101))
        #expect(picker.view(at: 101) == withoutUnavailable.view(at: 101))
    }

    @Test func spikeIsSmoothed() {
        var picker = makePicker()
        window(&picker, ["A": -50, "B": -70], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.receive(host: "B", rssi: -45, at: 101) == leading("A", .aboveFloor, at: 101))
    }

    @Test func newcomerNearTheLeaderBlocksChoice() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.receive(host: "B", rssi: -52, at: 101.2) == heard(at: 101.2))
    }

    @Test func noHosts() {
        var picker = makePicker()
        #expect(picker.answer(at: 100) == silent(at: 100))
        #expect(picker.answer(at: 110) == silent(at: 110))
    }

    @Test func equalHostsWithZeroMargin() {
        var picker = makePicker(margin: 0)
        window(&picker, ["A": -50, "B": -50], from: 100)
        #expect(picker.answer(at: 101) == heard(at: 101))
    }

    @Test func floorIsStrict() {
        for (floor, band): (Double, Picker.Band) in [
            (-65, .betweenLines), (-65.5, .aboveFloor), (-64.5, .betweenLines),
        ] {
            var picker = makePicker(floor: floor)
            window(&picker, ["A": -65], from: 100)
            #expect(picker.answer(at: 101) == leading("A", band, at: 101))
        }
    }

    @Test func marginIsStrict() {
        for (margin, leader): (Double, Picker.Leader?) in [
            (6, nil), (5.5, .init(host: "A", band: .aboveFloor)),
            (6.5, nil), (0, .init(host: "A", band: .aboveFloor)),
        ] {
            var picker = makePicker(margin: margin)
            window(&picker, ["A": -50, "B": -56], from: 100)
            #expect(picker.answer(at: 101) == Picker.Answer(time: 101, hostHeard: true, leader: leader))
        }
    }

    @Test func enoughReadingsAndTimeAreBothRequired() {
        var picker = makePicker(windowSeconds: 1.5, windowReadings: 3)
        picker.receive(host: "A", rssi: -50, at: 100)
        picker.receive(host: "A", rssi: -50, at: 101)
        #expect(picker.answer(at: 101) == heard(at: 101))
        #expect(picker.receive(host: "A", rssi: -50, at: 101) == heard(at: 101))
        #expect(picker.answer(at: 101.5) == leading("A", .aboveFloor, at: 101.5))

        var sparse = makePicker(windowSeconds: 1.5, windowReadings: 3)
        sparse.receive(host: "A", rssi: -50, at: 100)
        sparse.receive(host: "A", rssi: -50, at: 101.5)
        #expect(sparse.answer(at: 101.5) == heard(at: 101.5))
        #expect(sparse.receive(host: "A", rssi: -50, at: 101.5) == leading("A", .aboveFloor, at: 101.5))

        var fast = makePicker()
        window(&fast, ["A": -50], from: 100, duration: 0.5)
        #expect(fast.answer(at: 100.5) == heard(at: 100.5))
        #expect(fast.answer(at: 101) == leading("A", .aboveFloor, at: 101))
    }

    @Test func fadeUsesTheLastReadingAndIncludesTheBoundary() {
        var picker = makePicker(fade: 0.5)
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.answer(at: 101.25) == leading("A", .aboveFloor, at: 101.25))
        #expect(picker.answer(at: 101.5) == silent(at: 101.5))
    }

    @Test func unavailableReadingsSupplyNoCandidateOrEvidence() {
        var picker = makePicker()
        picker.receive(host: "A", rssi: 127, at: 100)
        #expect(picker.answer(at: 101) == silent(at: 101))
        picker.receive(host: "A", rssi: -50, at: 101)
        for _ in 0..<4 { picker.receive(host: "A", rssi: -50, at: 101.5) }
        #expect(picker.answer(at: 101.5) == heard(at: 101.5))

        var count = makePicker()
        count.receive(host: "A", rssi: -50, at: 100)
        for _ in 0..<3 { count.receive(host: "A", rssi: -50, at: 101) }
        for _ in 0..<3 { count.receive(host: "A", rssi: 127, at: 101) }
        #expect(count.answer(at: 101) == heard(at: 101))
        #expect(count.receive(host: "A", rssi: -50, at: 101) == leading("A", .aboveFloor, at: 101))
    }

    @Test func unavailableReadingsDoNotPreventFade() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        picker.receive(host: "A", rssi: 127, at: 102)
        #expect(picker.receive(host: "A", rssi: 127, at: 103) == silent(at: 103))
    }

    @Test func returningHostStartsFreshEvenWithoutAnInterveningTick() {
        for tickDuringGap in [false, true] {
            for waitBeforeReadings in [false, true] {
                for (previous, floor, band): (Int, Double, Picker.Band) in [
                    (-50, -65, .aboveFloor), (-90, -52, .belowDrop(since: 100)),
                ] {
                    var picker = makePicker(floor: floor)
                    window(&picker, ["A": previous], from: 100)
                    #expect(picker.answer(at: 101) == leading("A", band, at: 101))
                    if tickDuringGap { #expect(picker.answer(at: 103) == silent(at: 103)) }
                    #expect(picker.receive(host: "A", rssi: -50, at: 103) == heard(at: 103))
                    let readingsAt = waitBeforeReadings ? 104.0 : 103.0
                    if waitBeforeReadings { #expect(picker.answer(at: 104) == heard(at: 104)) }
                    for _ in 0..<4 { picker.receive(host: "A", rssi: -50, at: readingsAt) }
                    if !waitBeforeReadings { #expect(picker.answer(at: 103) == heard(at: 103)) }
                    #expect(picker.answer(at: 104) == leading("A", .aboveFloor, at: 104))
                }
            }
        }
    }

    @Test func suppliedAlphaControlsTheAverageFromTheFirstReading() {
        for (alpha, host) in [(0.3, "A"), (1.0, "B"), (0.05, "A")] {
            var picker = makePicker(alpha: alpha)
            window(&picker, ["A": -50, "B": -70], from: 100)
            #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
            #expect(picker.receive(host: "B", rssi: -40, at: 101) == leading(host, .aboveFloor, at: 101))
        }
    }

    @Test func immatureStrongestHostCannotFallBackToMatureHost() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.receive(host: "B", rssi: -40, at: 101) == heard(at: 101))
        #expect(picker.answer(at: 102) == heard(at: 102))
        for _ in 0..<4 { picker.receive(host: "B", rssi: -40, at: 102) }
        #expect(picker.answer(at: 102) == leading("B", .aboveFloor, at: 102))
    }

    @Test func answerChangesWhenTheLeaderWeakens() {
        var picker = makePicker(alpha: 1)
        window(&picker, ["A": -50, "B": -60], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.receive(host: "A", rssi: -80, at: 101.2) == leading("B", .aboveFloor, at: 101.2))
        #expect(picker.receive(host: "B", rssi: -90, at: 101.3) == leading("A", .belowDrop(since: 101.2), at: 101.3))
    }

    @Test func leaderBetweenTheLinesAndAtTheFloor() throws {
        for rssi in [-68, -65] {
            var picker = makePicker()
            window(&picker, ["A": rssi], from: 100)
            #expect(picker.answer(at: 101) == leading("A", .betweenLines, at: 101))
        }
        var picker = makePicker()
        window(&picker, ["A": -64], from: 100)
        #expect(picker.receive(host: "A", rssi: -67, at: 101.2) == leading("A", .aboveFloor, at: 101.2))
        #expect(abs(try #require(picker.view(at: 101.2).strongestAverage) - -64.9) < 0.000001)
    }

    @Test func belowDropSinceTheCrossingReadingThroughTicks() throws {
        var picker = makePicker()
        window(&picker, ["A": -60], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.receive(host: "A", rssi: -100, at: 101.2) == leading("A", .belowDrop(since: 101.2), at: 101.2))
        #expect(picker.view(at: 101.2).strongestAverage == -72)
        for time in [101.3, 101.7] {
            #expect(picker.answer(at: time) == leading("A", .belowDrop(since: 101.2), at: time))
        }

        var atLine = makePicker()
        window(&atLine, ["A": -68], from: 100)
        #expect(atLine.answer(at: 101) == leading("A", .betweenLines, at: 101))
        #expect(atLine.receive(host: "A", rssi: -78, at: 101.2) == leading("A", .belowDrop(since: 101.2), at: 101.2))
        #expect(atLine.view(at: 101.2).strongestAverage == -71)
        for time in [101.3, 101.7] {
            #expect(atLine.answer(at: time) == leading("A", .belowDrop(since: 101.2), at: time))
        }

        var aboveLine = makePicker()
        window(&aboveLine, ["A": -70], from: 100)
        #expect(aboveLine.receive(host: "A", rssi: -73, at: 101.2) == leading("A", .betweenLines, at: 101.2))
        #expect(abs(try #require(aboveLine.view(at: 101.2).strongestAverage) - -70.9) < 0.000001)
    }

    @Test func crossingBackOverTheDropLineStartsANewRun() throws {
        var picker = makePicker()
        window(&picker, ["A": -60], from: 100)
        #expect(picker.receive(host: "A", rssi: -100, at: 102) == leading("A", .belowDrop(since: 102), at: 102))
        #expect(picker.view(at: 102).strongestAverage == -72)
        #expect(picker.receive(host: "A", rssi: -70, at: 102.2) == leading("A", .belowDrop(since: 102), at: 102.2))
        #expect(abs(try #require(picker.view(at: 102.2).strongestAverage) - -71.4) < 0.000001)
        #expect(picker.receive(host: "A", rssi: -50, at: 102.3) == leading("A", .aboveFloor, at: 102.3))
        #expect(abs(try #require(picker.view(at: 102.3).strongestAverage) - -64.98) < 0.000001)
        #expect(picker.receive(host: "A", rssi: -90, at: 102.5) == leading("A", .belowDrop(since: 102.5), at: 102.5))
        #expect(abs(try #require(picker.view(at: 102.5).strongestAverage) - -72.49) < 0.005)
    }

    @Test func heardAgainAfterTheFadeHasNoLeader() {
        var picker = makePicker()
        window(&picker, ["A": -50], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .aboveFloor, at: 101))
        #expect(picker.receive(host: "A", rssi: -50, at: 103.1) == heard(at: 103.1))
    }

    @Test func belowDropBeforeTheWindowKeepsItsStartTime() {
        var picker = makePicker()
        picker.receive(host: "A", rssi: -75, at: 100)
        #expect(picker.answer(at: 100) == heard(at: 100))
        for time in [100.25, 100.5, 100.75, 101] {
            picker.receive(host: "A", rssi: -75, at: time)
        }
        #expect(picker.answer(at: 101) == leading("A", .belowDrop(since: 100), at: 101))
    }

    @Test func rivalDoesNotResetTheRunBelowDrop() {
        var picker = makePicker()
        window(&picker, ["A": -60], from: 100)
        #expect(picker.receive(host: "A", rssi: -110, at: 101) == leading("A", .belowDrop(since: 101), at: 101))
        #expect(picker.view(at: 101).strongestAverage == -75)
        #expect(picker.receive(host: "B", rssi: -74, at: 101.2) == heard(at: 101.2))
        for time in [101.5, 102, 102.5, 103, 103.3] {
            picker.receive(host: "A", rssi: -75, at: time)
        }
        #expect(picker.answer(at: 103.3) == leading("A", .belowDrop(since: 101), at: 103.3))
    }

    @Test func expiredBelowDropRunStartsAgainWithTheNewWindow() {
        for tickDuringGap in [false, true] {
            var picker = makePicker()
            window(&picker, ["A": -75], from: 100)
            #expect(picker.answer(at: 101) == leading("A", .belowDrop(since: 100), at: 101))
            if tickDuringGap { #expect(picker.answer(at: 103) == silent(at: 103)) }
            #expect(picker.receive(host: "A", rssi: -80, at: 103) == heard(at: 103))
            for time in [103.25, 103.5, 103.75, 104] {
                picker.receive(host: "A", rssi: -80, at: time)
            }
            #expect(picker.answer(at: 104) == leading("A", .belowDrop(since: 103), at: 104))
        }
    }

    @Test func eachCandidateKeepsItsRunBeforeItLeads() {
        var picker = makePicker()
        window(&picker, ["A": -75], from: 100)
        #expect(picker.answer(at: 101) == leading("A", .belowDrop(since: 100), at: 101))
        window(&picker, ["B": -85], from: 101)
        #expect(picker.answer(at: 102) == leading("A", .belowDrop(since: 100), at: 102))
        #expect(picker.receive(host: "B", rssi: 127, at: 102.5) == leading("A", .belowDrop(since: 100), at: 102.5))
        #expect(picker.receive(host: "B", rssi: -85, at: 103) == leading("B", .belowDrop(since: 101), at: 103))
    }

    @Test func laterCrossingBeforeLeadingKeepsItsStartTime() {
        for (immature, rivalRSSI): (Bool, Int?) in [
            (true, nil), (false, -50), (true, -50), (false, -67),
        ] {
            var picker = makePicker()
            for index in 0..<5 {
                let time = 100 + Double(index) * 0.25
                if let rivalRSSI { picker.receive(host: "B", rssi: rivalRSSI, at: time) }
                if !immature || index == 4 { picker.receive(host: "A", rssi: -68, at: time) }
            }
            let priorLeader: Picker.Leader? = rivalRSSI == -50 ? .init(host: "B", band: .aboveFloor) : nil
            #expect(picker.answer(at: 101) == Picker.Answer(time: 101, hostHeard: true, leader: priorLeader))
            #expect(picker.receive(host: "A", rssi: -78, at: 101.2) == Picker.Answer(time: 101.2, hostHeard: true, leader: priorLeader))
            #expect(picker.answer(at: 101.3) == Picker.Answer(time: 101.3, hostHeard: true, leader: priorLeader))

            for time in [101.5, 101.75, 102, 102.5] {
                picker.receive(host: "A", rssi: -71, at: time)
            }
            let beforeFade: Picker.Leader? = rivalRSSI == nil ? .init(host: "A", band: .belowDrop(since: 101.2)) : priorLeader
            #expect(picker.answer(at: 102.5) == Picker.Answer(time: 102.5, hostHeard: true, leader: beforeFade))
            #expect(picker.answer(at: 103) == leading("A", .belowDrop(since: 101.2), at: 103))
        }
    }

    @Test func suppliedDropGapControlsTheLineAndRecovery() {
        for (gap, band): (Double, Picker.Band) in [
            (0, .belowDrop(since: 100)), (3, .belowDrop(since: 100)),
            (6, .betweenLines), (10, .betweenLines),
        ] {
            var picker = makePicker(alpha: 1, dropGap: gap)
            window(&picker, ["A": -68], from: 100)
            #expect(picker.answer(at: 101) == leading("A", band, at: 101))
            #expect(picker.receive(host: "A", rssi: -60, at: 101.2) == leading("A", .aboveFloor, at: 101.2))
            #expect(picker.receive(host: "A", rssi: -80, at: 101.3) == leading("A", .belowDrop(since: 101.3), at: 101.3))
        }
    }

}

private func leading(_ host: String, _ band: Picker.Band, at time: Double) -> Picker.Answer {
    Picker.Answer(time: time, hostHeard: true, leader: .init(host: host, band: band))
}

private func heard(at time: Double) -> Picker.Answer {
    Picker.Answer(time: time, hostHeard: true, leader: nil)
}

private func silent(at time: Double) -> Picker.Answer {
    Picker.Answer(time: time, hostHeard: false, leader: nil)
}

private func window(_ picker: inout Picker, _ hosts: [String: Int], from start: Double, duration: Double = 1) {
    for index in 0..<5 {
        let time = start + Double(index) * duration / 4
        for (host, rssi) in hosts { picker.receive(host: host, rssi: rssi, at: time) }
    }
}

private func makePicker(
    alpha: Double = 0.3, windowSeconds: Double = 1, windowReadings: Int = 5,
    floor: Double = -65, margin: Double = 6, fade: Double = 2, dropGap: Double = 6
) -> Picker {
    Picker(
        alpha: alpha, windowSeconds: windowSeconds, windowReadings: windowReadings,
        floor: floor, margin: margin, fade: fade, dropGap: dropGap
    )
}
