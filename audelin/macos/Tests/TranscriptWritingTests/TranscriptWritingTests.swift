import Testing
import TranscriptWriting

@Suite(.timeLimit(.minutes(1)))
struct TranscriptWritingTests {

    @Test func unreadUpdatesRetainEverySnapshot() async {

        let changes = Changes()
        let call = FakeCallText<String>(
            startGate: nil, stopGate: nil, startText: nil, lastText: nil,
            switchText: { $0 ? "live text on" : "live text off" }, changed: changes.notify
        )
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let saving = FakeTextSaving<String>(holds: [:], failures: [:], report: report, finishGate: nil, changed: changes.notify)
        let subject = TranscriptWriting(callText: call, saving: saving)
        let texts = ["first draft", "first revised\nsecond draft", "first final\nsecond final\nthird"]
        let task = Task {
            await subject.start()
            for text in texts { call.send(text) }
            await subject.stop()
            var received: [String] = []
            for await text in subject.updates { received.append(text) }
            return received
        }
        #expect(await task.value == texts)
        #expect(saving.kept == texts.last)
    }

    @Test func eachUpdateIsWrittenWholeInOrderAndPassedOnAtOnce() async {

        let changes = Changes()
        let texts = ["first draft", "first revised\nsecond draft", "first final\nsecond final\nthird"]
        let gates = texts.map { _ in Gate(changed: changes.notify) }
        let run = Run(changes: changes, enabled: true, holds: Dictionary(uniqueKeysWithValues: zip(texts, gates)))
        defer {
            for gate in gates { gate.open() }
            run.requestStop()
        }
        await changes.until({ run.observed.started })
        #expect(run.call.recorded == [.subscribe, .start(true)])
        for (index, text) in texts.enumerated() {
            run.call.send(text)
            await changes.until({ gates[index].entered && run.observed.texts.count == index + 1 })
            #expect(run.observed.texts == Array(texts.prefix(index + 1)))
            #expect(run.saving.writes == Array(texts.prefix(index + 1)))
            #expect(run.saving.kept == (index == 0 ? nil : texts[index - 1]))
            gates[index].open()
            await changes.until({ run.saving.kept == text })
        }
        run.requestStop()
        await run.task.value
        #expect(run.saving.kept == texts.last)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        #expect(run.report.recorded.isEmpty)
    }

    @Test func textSentWhileStartingIsKept() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: [:], startGate: held, startText: "while starting")
        defer { held.open(); run.requestStop() }
        await changes.until({
            held.entered && run.observed.texts == ["while starting"] && run.saving.kept == "while starting"
        })
        #expect(!run.observed.started)
        #expect(run.call.recorded == [.subscribe, .start(true)])
        #expect(run.saving.writes == ["while starting"])
        held.open()
        run.requestStop()
        await run.task.value
        #expect(run.observed.started)
        #expect(run.saving.kept == "while starting")
    }

    @Test func switchingOffReachesCallTextAndTextIsStillKept() async {

        await switching(from: true, to: false, text: "live text off")
    }

    @Test func switchingOnReachesCallTextAndTextIsStillKept() async {

        await switching(from: false, to: true, text: "live text on")
    }

    private func switching(from initial: Bool, to enabled: Bool, text: String) async {

        let changes = Changes()
        let run = Run(changes: changes, enabled: initial, holds: [:])
        defer { run.requestStop() }
        await changes.until({ run.observed.started })
        run.setEnabled(enabled)
        await changes.until({ run.observed.texts == [text] && run.saving.kept == text })
        #expect(run.call.recorded == [.subscribe, .start(initial), .switchTo(enabled)])
        #expect(run.saving.writes == [text])
        run.requestStop()
        await run.task.value
        #expect(run.saving.kept == text)
    }

    @Test(arguments: [(true, false, false), (false, true, false), (true, true, false), (true, true, true)])
    func stoppingWaitsForCallTextAndTheLastWrite(holds: (Bool, Bool, Bool)) async {

        let (holdStop, holdFinish, finishFirst) = holds
        let changes = Changes()
        let stopped = Gate(changed: changes.notify)
        let finished = Gate(changed: changes.notify)
        let run = Run(
            changes: changes, enabled: true, holds: holdFinish ? ["last text": finished] : [:],
            stopGate: holdStop ? stopped : nil, lastText: "last text",
            finishGate: holdFinish ? finished : nil
        )
        defer { stopped.open(); finished.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.requestStop()
        await changes.until({
            (!holdStop || stopped.entered) && (!holdFinish || finished.entered)
                && run.observed.texts == ["last text"] && run.saving.finishCalls == 1
                && (holdFinish || run.saving.kept == "last text")
        })
        #expect(!run.observed.stopped)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        #expect(run.saving.writes == ["last text"])
        #expect(run.saving.kept == (holdFinish ? nil : "last text"))
        if holdStop && holdFinish {
            if finishFirst { finished.open() } else { stopped.open() }
            #expect(!run.observed.stopped)
        }
        stopped.open()
        finished.open()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.saving.kept == "last text")
        #expect(run.saving.finishCalls == 1)
    }
}
