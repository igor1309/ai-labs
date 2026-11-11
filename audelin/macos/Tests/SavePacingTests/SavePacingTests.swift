import Testing
import SavePacing

@Suite(.timeLimit(.minutes(1)))
struct SavePacingTests {

    @Test func onlyTheLatestValueIsSavedAfterAHeldSave() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let store = FakeStore<Int>(holds: [1: held], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: {})
        defer { held.open() }
        subject.submit(1)
        await changes.until({ held.entered })
        subject.submit(2)
        subject.submit(3)
        #expect(store.kept == nil)
        held.open()
        await subject.finish()
        #expect(store.saves == [1, 3])
        #expect(store.kept == 3)
        #expect(report.recorded.isEmpty)
    }

    @Test func aFailedSaveIsTold() async {

        let changes = Changes()
        let failure = SaveFailure(message: "denied")
        let store = FakeStore<Int>(holds: [:], failures: [1: failure], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: {})
        subject.submit(1)
        await subject.finish()
        #expect(store.kept == nil)
        #expect(report.recorded == [failure])
    }

    @Test func repeatedFailuresAreToldOnceUntilASaveSucceeds() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let failures = [1: SaveFailure(message: "denied"), 2: SaveFailure(message: "full"), 3: SaveFailure(message: "still full")]
        let store = FakeStore<Int>(holds: [:], failures: failures, changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: pauses.pause)
        defer { pauses.end() }
        for value in 1...3 {
            subject.submit(value)
            if value > 1 { pauses.end() }
            await changes.until({ pauses.started == value && pauses.waiting })
            #expect(store.kept == nil)
            #expect(report.recorded == [failures[1]])
        }
        await subject.finish()
        #expect(store.saves == [1, 2, 3])
        #expect(report.recorded == [failures[1]])
    }

    @Test func aFailureAfterASuccessIsToldAgain() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let denied = SaveFailure(message: "denied")
        let full = SaveFailure(message: "full")
        let store = FakeStore<Int>(holds: [:], failures: [1: denied, 3: full], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: pauses.pause)
        defer { pauses.end() }
        for value in 1...3 {
            subject.submit(value)
            if value > 1 { pauses.end() }
            await changes.until({ pauses.started == value && pauses.waiting })
        }
        await subject.finish()
        #expect(store.saves == [1, 2, 3])
        #expect(store.kept == 2)
        #expect(report.recorded == [denied, full])
    }

    @Test func aSaveAfterAFailedOneKeepsTheNewerValue() async {

        let changes = Changes()
        let failure = SaveFailure(message: "denied")
        let store = FakeStore<Int>(holds: [:], failures: [1: failure], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: {})
        subject.submit(1)
        await changes.until({ report.recorded == [failure] })
        #expect(store.kept == nil)
        subject.submit(2)
        await subject.finish()
        #expect(store.saves == [1, 2])
        #expect(store.kept == 2)
        #expect(report.recorded == [failure])
    }

    @Test func eachPauseKeepsOnlyTheLatestWaitingValue() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let store = FakeStore<Int>(holds: [:], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: pauses.pause)
        defer { pauses.end() }
        subject.submit(1)
        await changes.until({ pauses.started == 1 && pauses.waiting })
        for (cycle, kept) in [1, 3].enumerated() {
            subject.submit(kept + 1)
            subject.submit(kept + 2)
            #expect(store.kept == kept)
            #expect(store.saves == (cycle == 0 ? [1] : [1, 3]))
            pauses.end()
            await changes.until({ pauses.started == cycle + 2 && pauses.waiting })
            #expect(store.kept == kept + 2)
        }
        await subject.finish()
        #expect(store.saves == [1, 3, 5])
        #expect(store.kept == 5)
    }

    @Test func finishingEndsThePauseAndWaitsForTheLastSave() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let held = Gate(changed: changes.notify)
        let store = FakeStore<Int>(holds: [2: held], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: pauses.pause)
        let observed = Completion()
        defer { held.open(); pauses.end() }
        subject.submit(1)
        await changes.until({ pauses.waiting })
        subject.submit(2)
        let finish = Task {
            await subject.finish()
            observed.didStop()
            changes.notify()
        }
        await changes.until({ held.entered })
        #expect(store.kept == 1)
        #expect(!observed.stopped)
        #expect(pauses.cancelled == 1)
        held.open()
        await finish.value
        #expect(store.kept == 2)
        #expect(store.saves == [1, 2])
        #expect(observed.stopped)
        #expect(pauses.started == 1)
    }

    @Test func finishingWaitsUntilTheLastFailureHasBeenTold() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let reporting = Gate(changed: changes.notify)
        let failure = SaveFailure(message: "last save failed")
        let store = FakeStore<Int>(holds: [1: held], failures: [1: failure], changed: changes.notify)
        let events = Events()
        let report = FakeFailureReport(events: events, gate: reporting, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: {})
        let observed = Completion()
        defer { held.open(); reporting.open() }
        subject.submit(1)
        await changes.until({ held.entered })
        let finish = Task {
            observed.didStart()
            changes.notify()
            await subject.finish()
            events.record(.finishReturned(1))
            observed.didStop()
            changes.notify()
        }
        await changes.until({ observed.started })
        #expect(!observed.stopped)
        held.open()
        await changes.until({ reporting.entered })
        #expect(!observed.stopped)
        #expect(events.recorded == [.saveFailed(failure)])
        reporting.open()
        await finish.value
        #expect(store.kept == nil)
        #expect(report.recorded == [failure])
        #expect(events.recorded == [.saveFailed(failure), .finishReturned(1)])
    }

    @Test func aFailedSaveAlsoHasAPause() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let failure = SaveFailure(message: "denied")
        let store = FakeStore<Int>(holds: [:], failures: [2: failure], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = SavePacing(saving: store, failureReport: report, pause: pauses.pause)
        defer { pauses.end() }
        subject.submit(1)
        await changes.until({ pauses.started == 1 && pauses.waiting })
        subject.submit(2)
        pauses.end()
        await changes.until({ pauses.started == 2 && pauses.waiting })
        #expect(report.recorded == [failure])
        subject.submit(3)
        subject.submit(4)
        #expect(store.kept == 1)
        #expect(store.saves == [1, 2])
        pauses.end()
        await changes.until({ pauses.started == 3 && pauses.waiting })
        #expect(store.kept == 4)
        await subject.finish()
        #expect(store.saves == [1, 2, 4])
        #expect(store.kept == 4)
    }
}
