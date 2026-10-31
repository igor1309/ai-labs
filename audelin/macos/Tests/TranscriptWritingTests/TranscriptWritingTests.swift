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
        let transcript = FakeTranscript<String>(holds: [:], changed: changes.notify)
        let report = FakeFailureReport(events: Events(), gate: nil, changed: changes.notify)
        let subject = TranscriptWriting(callText: call, transcript: transcript, failureReport: report)
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
        #expect(transcript.kept == texts.last)
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
            #expect(run.transcript.writes == Array(texts.prefix(index + 1)))
            #expect(run.transcript.kept == (index == 0 ? nil : texts[index - 1]))
            gates[index].open()
            await changes.until({ run.transcript.kept == text })
        }
        run.requestStop()
        await run.task.value
        #expect(run.transcript.kept == texts.last)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        #expect(run.report.recorded.isEmpty)
    }

    @Test func updatesDuringAHeldWriteWriteOnlyTheLatest() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: ["first": held])
        defer { held.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.call.send("first")
        await changes.until({ held.entered && run.observed.texts == ["first"] })
        run.call.send("middle")
        await changes.until({ run.observed.texts == ["first", "middle"] })
        run.call.send("latest")
        await changes.until({ run.observed.texts == ["first", "middle", "latest"] })
        #expect(run.transcript.writes == ["first"])
        #expect(run.transcript.kept == nil)
        held.open()
        run.requestStop()
        await run.task.value
        #expect(run.transcript.writes == ["first", "latest"])
        #expect(run.transcript.kept == "latest")
    }

    @Test func textSentWhileStartingIsKept() async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: [:], startGate: held, startText: "while starting")
        defer { held.open(); run.requestStop() }
        await changes.until({
            held.entered && run.observed.texts == ["while starting"] && run.transcript.kept == "while starting"
        })
        #expect(!run.observed.started)
        #expect(run.call.recorded == [.subscribe, .start(true)])
        #expect(run.transcript.writes == ["while starting"])
        held.open()
        run.requestStop()
        await run.task.value
        #expect(run.observed.started)
        #expect(run.transcript.kept == "while starting")
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
        await changes.until({ run.observed.texts == [text] && run.transcript.kept == text })
        #expect(run.call.recorded == [.subscribe, .start(initial), .switchTo(enabled)])
        #expect(run.transcript.writes == [text])
        run.requestStop()
        await run.task.value
        #expect(run.transcript.kept == text)
    }

    @Test(arguments: [false, true])
    func stoppingWaitsForCallTextAndTheLastWrite(holdWrite: Bool) async {

        let changes = Changes()
        let held = Gate(changed: changes.notify)
        let run = Run(
            changes: changes, enabled: true, holds: holdWrite ? ["last text": held] : [:],
            stopGate: holdWrite ? nil : held, lastText: "last text"
        )
        defer { held.open(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.requestStop()
        await changes.until({
            held.entered && run.observed.texts == ["last text"]
                && (holdWrite || run.transcript.kept == "last text")
        })
        #expect(!run.observed.stopped)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        #expect(run.transcript.writes == ["last text"])
        #expect(run.transcript.kept == (holdWrite ? nil : "last text"))
        held.open()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.transcript.kept == "last text")
        #expect(run.transcript.writes == ["last text"])
    }

    @Test func aPauseFollowsEachWriteAndOnlyTheLatestTextIsWrittenAfterIt() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: [:], pauses: pauses)
        defer { pauses.end(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.call.send("first")
        await changes.until({ pauses.waiting })
        #expect(run.transcript.writes == ["first"])
        run.call.send("second")
        run.call.send("third")
        await changes.until({ run.observed.texts == ["first", "second", "third"] })
        #expect(run.transcript.writes == ["first"])
        pauses.end()
        await changes.until({ run.transcript.writes.count == 2 && pauses.waiting })
        #expect(run.transcript.writes == ["first", "third"])
        #expect(pauses.started == 2)
        pauses.end()
        run.requestStop()
        await run.task.value
        #expect(run.transcript.kept == "third")
    }

    @Test func stoppingEndsThePauseSoTheLastTextIsWrittenBeforeStopReturns() async {

        let changes = Changes()
        let pauses = Pauses(changed: changes.notify)
        let run = Run(changes: changes, enabled: true, holds: [:], lastText: "last", pauses: pauses)
        defer { pauses.end(); run.requestStop() }
        await changes.until({ run.observed.started })
        run.call.send("first")
        await changes.until({ pauses.waiting })
        run.call.send("second")
        await changes.until({ run.observed.texts == ["first", "second"] })
        run.requestStop()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.transcript.writes == ["first", "last"])
        #expect(run.transcript.kept == "last")
        #expect(pauses.cancelled == 1)
    }
}
