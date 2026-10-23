import PanelUI
import Testing
@testable import PanelPreview

struct FakeCallTests {

    @Test func showsNothingUntilStarted() {

        var call = FakeCall()
        call.step()

        #expect(call.state == .init(recording: .off, log: .empty))
    }

    @Test func settlesAPhraseInPlace() {

        var call = started()
        call.step()
        call.step()

        #expect(entries(call).map(\.settled) == ["по запуску — кто у нас"])
        #expect(entries(call).map(\.pending) == ["accountable за слог"])
        #expect(call.state.recording == .on(elapsed: "00:00:08"))
    }

    @Test func keepsWhatSettledWhenLiveTextGoesOffMidPhrase() {

        var call = started()
        call.step()
        call.step()
        call.setLiveText(false)
        call.step()

        guard case let .liveTextOff(kept?) = call.state.log else {
            Issue.record("expected the kept lines, got \(call.state.log)")
            return
        }
        #expect(kept.entries.map(\.settled) == ["по запуску — кто у нас"])
        #expect(kept.entries.map(\.pending) == [""])
    }

    @Test func fillsInWhatWasOnlyRecorded() {

        var call = started()
        call.setLiveText(false)
        (1...3).forEach { _ in call.step() }
        call.handle(.switchLiveTextOn)

        #expect(rows(call) == [.late(.init(span: "12:41–12:41", entries: [
            .init(id: 0, time: "12:41", speaker: .them, settled: "по запуску — кто у нас accountable за слог поддержки?"),
        ]))])
    }

    @Test func fillsInEachGapWhereItWas() {

        var call = started()
        for liveText in [true, false, true, false, true] {
            call.setLiveText(liveText)
            (1...3).forEach { _ in call.step() }
        }

        #expect(rows(call).map(\.ids) == [[0], [1], [2], [3], [4]])
        #expect(rows(call).map(\.isLate) == [false, true, false, true, false])
    }

    @Test func addsEachSelectionToWhatIsHeld() {

        var call = started()
        call.handle(.hold(.init(entryID: 0, text: "accountable")))
        call.handle(.hold(.init(entryID: 1, text: "команда Ильи")))

        #expect(call.holds.map(\.text) == ["accountable", "команда Ильи"])
    }

    @Test func letsGoOnlyTheSelectionAskedFor() {

        var call = started()
        call.handle(.hold(.init(entryID: 0, text: "accountable")))
        call.handle(.hold(.init(entryID: 1, text: "команда Ильи")))
        call.handle(.letGo(.init(entryID: 0, text: "accountable")))
        call.handle(.jumpToLive)

        #expect(call.holds.map(\.text) == ["команда Ильи"])
    }

    @Test func endsWithTheScript() {

        var call = started()
        (1...100).forEach { _ in call.step() }

        #expect(call.isFinished)
        #expect(entries(call).allSatisfy { $0.pending.isEmpty })
    }

    // MARK: - Helpers

    private func started() -> FakeCall {

        var call = FakeCall()
        call.handle(.start)
        return call
    }

    private func rows(_ call: FakeCall) -> [PanelState.Row] {

        guard case let .lines(lines) = call.state.log else { return [] }
        return lines.rows
    }

    private func entries(_ call: FakeCall) -> [PanelState.Entry] {

        guard case let .lines(lines) = call.state.log else { return [] }
        return lines.entries
    }
}

private extension PanelState.Row {

    var ids: [PanelState.Entry.ID] {

        switch self {
        case let .entry(entry): [entry.id]
        case let .late(late): late.entries.map(\.id)
        }
    }

    var isLate: Bool {

        if case .late = self { true } else { false }
    }
}
