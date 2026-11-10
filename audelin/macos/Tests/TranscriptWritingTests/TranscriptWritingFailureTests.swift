import Testing
import TranscriptWriting

extension TranscriptWritingTests {

    @Test func theLastWriteFailingIsToldBeforeStoppingReturns() async {

        let changes = Changes()
        let reporting = Gate(changed: changes.notify)
        let failure = WriteFailure(message: "last write failed")
        let run = Run(
            changes: changes, enabled: true, holds: [:], lastText: "last text",
            failures: ["last text": failure], reportGate: reporting
        )
        defer { reporting.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.requestStop()
        await changes.until({ reporting.entered })
        #expect(!run.observed.stopped)
        #expect(run.events.recorded == [.transcriptFailed(failure)])
        reporting.open()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.events.recorded == [.transcriptFailed(failure), .stopReturned(1)])
        #expect(run.report.recorded == [failure])
        #expect(run.saving.writes == ["last text"])
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
    }

    @Test func callTextFailingIsPassedOnWhileTheTranscriptFailsApart() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let stopping = Gate(changed: changes.notify)
        let first = CallUpdate(text: "first draft", status: .on)
        let failed = CallUpdate(text: "first final\nlast word", status: .failed("hearing failed"))
        let failure = WriteFailure(message: "held write failed")
        let call = FakeCallText<CallUpdate>(
            startGate: nil, stopGate: nil, startText: nil, lastText: nil,
            switchText: { _ in failed }, changed: changes.notify
        )
        let events = Events()
        let report = FakeFailureReport(events: events, gate: nil, changed: changes.notify)
        let observed = Observation<CallUpdate>()
        let saving = FakeTextSaving(holds: [first: held], failures: [first: failure], report: report, finishGate: nil, changed: changes.notify)
        let subject = TranscriptWriting(callText: call, saving: saving)
        let task = Task {
            let reader = Task {
                for await update in subject.updates {
                    observed.receive(update)
                    changes.notify()
                }
            }
            await subject.start()
            observed.didStart()
            changes.notify()
            await stopping.wait()
            await subject.stop()
            observed.didStop()
            await reader.value
        }
        defer { held.open(); stopping.open() }
        await changes.until({ observed.started })
        call.send(first)
        await changes.until({ held.entered && observed.texts == [first] })
        call.send(failed)
        call.finishUpdates()
        await changes.until({ observed.texts == [first, failed] })
        #expect(saving.writes == [first])
        #expect(saving.kept == nil)
        #expect(report.recorded.isEmpty)
        held.open()
        await changes.until({ saving.kept == failed && report.recorded == [failure] && saving.finishCalls == 1 })
        stopping.open()
        await task.value
        #expect(observed.stopped)
        #expect(observed.texts == [first, failed])
        #expect(saving.writes == [first, failed])
        #expect(saving.kept == failed)
        #expect(report.recorded == [failure])
        #expect(call.recorded == [.subscribe, .start(true), .stop])
    }

    @Test func withoutATranscriptCallTextRunsAndNothingIsTold() async {

        let changes = Changes()
        let run = Run(
            changes: changes, enabled: true, holds: [:],
            startText: "while starting", lastText: "last text", hasTranscript: false
        )
        defer { run.requestStop() }
        await changes.until({ run.observed.started && run.observed.texts == ["while starting"] })
        run.setEnabled(false)
        await changes.until({ run.observed.texts == ["while starting", "live text off"] })
        run.requestStop()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.call.recorded == [.subscribe, .start(true), .switchTo(false), .stop])
        #expect(run.observed.texts == ["while starting", "live text off", "last text"])
        #expect(run.saving.writes.isEmpty)
        #expect(run.saving.finishCalls == 0)
        #expect(run.report.recorded.isEmpty)
        #expect(run.events.recorded == [.stopReturned(1)])
        await run.saving.finish()
    }

    @Test func aSecondStopWaitsForTheFirst() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: ["last text": held], lastText: "last text", finishGate: held)
        defer { held.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.requestStop()
        await changes.until({ held.entered })
        let second = Observation<String>()
        let secondStop = Task {
            second.didStart()
            changes.notify()
            await run.subject.stop()
            run.events.record(.stopReturned(2))
            second.didStop()
            changes.notify()
        }
        await changes.until({ second.started })
        #expect(!run.observed.stopped)
        #expect(!second.stopped)
        #expect(run.events.recorded.isEmpty)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        held.open()
        await run.task.value
        await secondStop.value
        #expect(run.observed.stopped)
        #expect(second.stopped)
        #expect(run.events.recorded.count == 2)
        #expect(run.events.recorded.contains(.stopReturned(1)))
        #expect(run.events.recorded.contains(.stopReturned(2)))
        #expect(run.saving.writes == ["last text"])
        #expect(run.saving.kept == "last text")
        #expect(run.saving.finishCalls == 1)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
    }
    @Test func aFailedWriteLeavesCallTextGoing() async {

        let changes = Changes()
        let failure = WriteFailure(message: "write denied")
        let run = Run(changes: changes, enabled: true, holds: [:], failures: ["first": failure])
        defer { run.requestStop() }
        await changes.until({ run.observed.started })
        run.call.send("first")
        await changes.until({ run.report.recorded == [failure] })
        run.setEnabled(false)
        await changes.until({ run.observed.texts == ["first", "live text off"] && run.saving.kept == "live text off" })
        run.call.send("new text")
        await changes.until({ run.observed.texts == ["first", "live text off", "new text"] && run.saving.kept == "new text" })
        run.requestStop()
        await run.task.value
        #expect(run.call.recorded == [.subscribe, .start(true), .switchTo(false), .stop])
        #expect(run.saving.kept == "new text")
        #expect(run.report.recorded == [failure])
    }

    @Test func updatesReachReadersWhileASaveIsHeld() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: ["first": held])
        defer { held.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.call.send("first")
        await changes.until({ held.entered })
        run.call.send("second")
        run.call.send("third")
        await changes.until({ run.observed.texts == ["first", "second", "third"] })
        #expect(run.saving.kept == nil)
        #expect(run.saving.writes == ["first"])
        held.open()
        run.requestStop()
        await run.task.value
        #expect(run.saving.writes == ["first", "second", "third"])
        #expect(run.saving.kept == "third")
    }
}

private struct CallUpdate: Hashable, Sendable {

    enum Status: Hashable, Sendable {
        case on
        case failed(String)
    }

    let text: String
    let status: Status
}
