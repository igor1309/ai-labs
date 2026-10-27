import Reading
import Testing

struct ReadingTests {

    @Test func callOrderAndSpeakerIDsSurviveSettling() throws {

        let mine = text(.mine, 0, start: 8, pending: "draft")
        let theirs = text(.theirs, 0, start: 2, settled: "first")
        var state = update(.init(), [mine, theirs])
        let before = try lines(state).entries
        #expect(before.map(\.speaker) == [.theirs, .mine])
        #expect(Set(before.map(\.id)).count == 2)
        #expect(before.map(\.time) == ["00:02", "00:08"])

        // Recognition can revise a segment's timing as well as its words.
        state = update(state, [text(.mine, 0, start: 1, settled: "firm", pending: " next"), theirs])
        let after = try lines(state).entries
        #expect(after.map(\.id) == before.map(\.id))
        #expect(after.map(\.speaker) == [.theirs, .mine])
        #expect(after[1].time == "00:08")
        #expect(after[1].settled == "firm")
        #expect(after[1].pending == " next")
    }

    @Test func timesAndConsecutiveLateGroupsStayInCallOrder() throws {

        var state = send(.init(), .recordingChanged(.on(elapsed: 3_661.9)))
        #expect(state.recording == .on(elapsed: "01:01:01"))
        state = update(state, [
            text(.mine, 4, start: 3_607, end: 3_610, late: true),
            text(.mine, 3, start: 3_606),
            text(.theirs, 2, start: 3_602, end: 3_604, late: true),
            text(.mine, 1, start: 3_600.9, end: 3_608, late: true),
            text(.theirs, 0, start: 59.9),
        ])
        let rows = try lines(state).rows
        #expect(rows.count == 4)
        guard case let .entry(first) = rows[0], case let .late(group) = rows[1],
              case let .entry(middle) = rows[2], case let .late(last) = rows[3] else {
            Issue.record("Expected an entry, a late group, an entry and a late group")
            return
        }
        #expect(first.time == "00:59")
        #expect(group.span == "60:00–60:08")
        #expect(group.entries.map(\.time) == ["60:00", "60:02"])
        #expect(middle.time == "60:06")
        #expect(last.span == "60:07–60:10")
        #expect(last.entries.map(\.speaker) == [.mine])
        state = send(state, .recordingChanged(.on(elapsed: 0)))
        #expect(state.recording == .on(elapsed: "00:00:00"))
    }

    @Test func holdsAccumulateExactlyAndOnlyLetGoRemovesOne() throws {

        var state = update(.init(), [text(.mine, 1, start: 1, pending: "uncertain words")])
        let id = try #require(lines(state).entries.first?.id)
        let first = ReadingState.Held(entryID: id, text: "uncertain")
        let second = ReadingState.Held(entryID: id, text: "words")
        for held in [first, second, first] { state = send(state, .hold(held)) }
        #expect(try lines(state).holds == [first, second])
        state = update(state, [text(.mine, 1, start: 1, settled: "different text")])
        #expect(try lines(state).holds == [first, second])
        state = update(state, [])
        #expect(try lines(state).entries.isEmpty)
        #expect(try lines(state).holds == [first, second])
        state = send(state, .scrolled(atBottom: false))
        state = send(state, .jumpToLive)
        state = send(state, .recordingChanged(.off))
        state = update(state, [], status: .off)
        let heldOnly = try lines(state)
        #expect(heldOnly.holds == [first, second])
        state = send(state, .recordingChanged(.on(elapsed: 12)))
        #expect(state.log == .liveTextOff(kept: heldOnly))
        state = send(state, .recordingChanged(.off))
        #expect(state.log == .lines(heldOnly))
        state = update(state, [], status: .gettingReady)
        state = update(state, [], status: .failed("unavailable"))
        state = update(state, [], status: .finished)
        #expect(try lines(state).holds == [first, second])
        state = send(state, .letGo(first))
        #expect(try lines(state).holds == [second])
        state = send(state, .letGo(first))
        #expect(try lines(state).holds == [second])
        state = send(state, .letGo(second))
        #expect(try lines(state).holds.isEmpty)
    }

    @Test func followingCountsOnlyNewIdentitiesAndResumesBothWays() throws {

        let first = text(.mine, 1, start: 10, pending: "draft")
        var state = update(.init(), [first])
        #expect(try lines(state).followsLive)
        #expect(try lines(state).newBelow == 0)
        state = send(state, .scrolled(atBottom: false))
        let settled = text(.mine, 1, start: 10, settled: "settled")
        state = update(state, [settled])
        #expect(try lines(state).newBelow == 0)
        let late = text(.theirs, 1, start: 2, late: true)
        let next = text(.mine, 2, start: 12)
        state = update(state, [next, late, settled])
        let arrivals = try lines(state).entries
        #expect(Set(arrivals.map(\.id)).count == arrivals.count)
        #expect(try lines(state).newBelow == 2)
        #expect(try !lines(state).followsLive)
        state = update(state, [settled, late, next])
        #expect(try lines(state).newBelow == 2)
        state = update(state, [], status: .off)
        #expect(try lines(state).newBelow == 2)
        #expect(try !lines(state).followsLive)
        state = send(state, .scrolled(atBottom: true))
        #expect(try lines(state).followsLive)
        #expect(try lines(state).newBelow == 0)
        state = send(state, .scrolled(atBottom: false))
        state = update(state, [settled, late, next, text(.theirs, 2, start: 15)])
        let moreArrivals = try lines(state).entries
        #expect(Set(moreArrivals.map(\.id)).count == moreArrivals.count)
        #expect(try lines(state).newBelow == 1)
        state = send(state, .jumpToLive)
        #expect(try lines(state).followsLive)
        #expect(try lines(state).newBelow == 0)
    }

    @Test func preparingOffFailureAndFinishedKeepTheAppropriateLog() throws {

        var state = ReadingState()
        #expect(state.recording == .off)
        #expect(state.log == .empty)
        state = send(state, .recordingChanged(.on(elapsed: 12)))
        #expect(state.log == .liveTextOff(kept: nil))
        state = update(state, [], status: .gettingReady)
        #expect(state.log == .preparing)
        #expect(state.recording == .on(elapsed: "00:00:12"))
        state = update(state, [])
        #expect(try lines(state).entries.isEmpty)
        let entry = text(.mine, 0, start: 1, settled: "read so far")
        state = update(state, [entry])
        let shown = try lines(state)
        state = update(state, [], status: .off)
        #expect(state.log == .liveTextOff(kept: shown))
        state = update(state, [], status: .gettingReady)
        #expect(state.log == .preparing)
        state = update(state, [], status: .failed("could not restart"))
        #expect(state.log == .lines(shown))
        state = update(state, [entry])
        #expect(try lines(state) == shown)
        state = update(state, [], status: .failed("recognition failed"))
        #expect(state.log == .lines(shown))
        #expect(state.recording == .on(elapsed: "00:00:12"))
        state = update(state, [], status: .finished)
        state = send(state, .recordingChanged(.off))
        #expect(state.log == .lines(shown))
        #expect(state.recording == .off)
        state = update(state, [], status: .off)
        #expect(state.log == .lines(shown))

        let statuses: [ReadingTextUpdate.Status] = [.off, .gettingReady, .failed("interrupted"), .finished]
        for status in statuses {
            let pending = text(.mine, 0, start: 1, pending: "draft")
            let prior = text(.theirs, 0, start: 2, settled: "keep this")
            var state = update(.init(), [pending, prior])
            let before = try lines(state).entries
            let revised = text(.mine, 0, start: 1, settled: "final words")
            let added = text(.mine, 1, start: 3, settled: "new words")
            state = update(state, [revised, added], status: status)
            if status == .gettingReady {
                #expect(state.log == .preparing)
                state = update(state, [], status: .finished)
            }
            let after = try lines(state).entries
            try #require(after.count == 3)
            #expect(after[0].id == before[0].id)
            #expect(after.map(\.settled) == ["final words", "keep this", "new words"])
            #expect(after.map(\.pending) == ["", "", ""])
            #expect(after[1] == before[1])
            #expect(after[2].speaker == .mine)
            #expect(after[2].time == "00:03")
            #expect(after[2].id > before.map(\.id).max()!)
        }
    }

    @Test func anOmittedEntryGetsAFreshIdentityWhenItReturns() throws {

        let entry = text(.mine, 1, start: 4)
        var state = update(.init(), [entry])
        let original = try lines(state).entries
        state = send(state, .scrolled(atBottom: false))
        state = update(state, [])
        #expect(try lines(state).entries.isEmpty)
        state = update(state, [entry])
        let returned = try #require(lines(state).entries.first)
        #expect(returned.id > original[0].id)
        #expect(returned.time == original[0].time)
        #expect(try lines(state).newBelow == 1)
    }

    @Test func reusedPendingSlotsGetFreshTimesAndIDsWithoutChangingHolds() throws {

        let pending = text(.mine, 0, start: 2, pending: "held draft")
        let other = text(.theirs, 0, start: 5, settled: "still here")
        var state = update(.init(), [pending, other])
        let original = try lines(state).entries
        let held = ReadingState.Held(entryID: original[0].id, text: "held draft")
        state = send(state, .hold(held))
        state = send(state, .scrolled(atBottom: false))
        state = update(state, [other])
        #expect(try lines(state).entries == [original[1]])
        #expect(try lines(state).newBelow == 0)
        #expect(try lines(state).holds == [held])

        let reused = text(.mine, 0, start: 12, pending: "new speech")
        state = update(state, [reused, other])
        let returned = try lines(state).entries
        #expect(returned.map(\.speaker) == [.theirs, .mine])
        #expect(returned.map(\.time) == ["00:05", "00:12"])
        #expect(returned[0] == original[1])
        #expect(returned[1].id > original.map(\.id).max()!)
        #expect(returned[1].pending == "new speech")
        #expect(Set(returned.map(\.id)).count == returned.count)
        #expect(try lines(state).newBelow == 1)
        #expect(try lines(state).holds == [held])

        state = update(state, [other, text(.mine, 0, start: 11, settled: "new speech")])
        let settled = try lines(state).entries
        #expect(settled.map(\.id) == returned.map(\.id))
        #expect(settled.map(\.time) == returned.map(\.time))
        #expect(settled[1].settled == "new speech")
        #expect(try lines(state).newBelow == 1)
        #expect(try lines(state).holds == [held])
        state = send(state, .letGo(held))
        #expect(try lines(state).holds.isEmpty)
    }
}

private func text(
    _ speaker: ReadingState.Speaker, _ id: Int, start: Double, end: Double? = nil,
    settled: String = "", pending: String = "", late: Bool = false
) -> ReadingTextUpdate.Entry {

    .init(id: .init(speaker: speaker, localID: id), start: start, end: end ?? start + 1,
          settled: settled, pending: pending, writtenLater: late)
}

private func send(_ state: ReadingState, _ event: ReadingEvent) -> ReadingState {

    let (next, effect): (ReadingState, Never?) = ReadingReducer.reduce(state, event)
    #expect(effect == nil)
    return next
}

private func update(
    _ state: ReadingState, _ entries: [ReadingTextUpdate.Entry], status: ReadingTextUpdate.Status = .listening
) -> ReadingState {

    send(state, .textUpdated(.init(status: status, entries: entries)))
}

private func lines(_ state: ReadingState) throws -> ReadingState.Lines {

    switch state.log {
    case let .lines(lines): return lines
    default:
        Issue.record("Expected the lines log mode, got \(state.log)")
        throw MissingLines()
    }
}

private struct MissingLines: Error {}
