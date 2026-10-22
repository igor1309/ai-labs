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

        guard case let .lines(lines) = call.state.log else {
            Issue.record("expected lines, got \(call.state.log)")
            return
        }
        #expect(lines.late?.entries.map(\.settled) == ["по запуску — кто у нас accountable за слог поддержки?"])
        #expect(lines.entries.isEmpty)
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

    private func entries(_ call: FakeCall) -> [PanelState.Entry] {

        guard case let .lines(lines) = call.state.log else { return [] }
        return lines.entries
    }
}
