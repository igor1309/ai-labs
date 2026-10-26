import Testing

@Suite(.timeLimit(.minutes(1)))
struct TranscriptWritingTests {

    @Test func eachUpdateIsWrittenWholeInOrderAndPassedOnAtOnce() async {

        let executor = TestExecutor()
        let texts = ["first draft", "first revised\nsecond draft", "first final\nsecond final\nthird"]
        let gates = texts.map { _ in Gate(changed: executor.notify) }
        let run = Run(executor: executor, enabled: true, holds: Dictionary(uniqueKeysWithValues: zip(texts, gates)))
        defer {
            for gate in gates { gate.open() }
            run.requestStop()
            executor.run()
        }
        await executor.run(until: { run.observed.started })
        #expect(run.call.recorded == [.subscribe, .start(true)])
        for (index, text) in texts.enumerated() {
            run.call.send(text)
            await executor.run(until: { gates[index].entered && run.observed.texts.count == index + 1 })
            #expect(run.observed.texts == Array(texts.prefix(index + 1)))
            #expect(run.transcript.writes == Array(texts.prefix(index + 1)))
            #expect(run.transcript.kept == (index == 0 ? nil : texts[index - 1]))
            gates[index].open()
            await executor.run(until: { run.transcript.kept == text })
        }
        run.requestStop()
        await executor.finish()
        await run.task.value
        #expect(run.transcript.kept == texts.last)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        #expect(run.report.recorded.isEmpty)
    }

    @Test func updatesDuringAHeldWriteWriteOnlyTheLatest() async {

        let executor = TestExecutor()
        let held = Gate(changed: executor.notify)
        let run = Run(executor: executor, enabled: true, holds: ["first": held])
        defer { held.open(); run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        run.call.send("first")
        await executor.run(until: { held.entered && run.observed.texts == ["first"] })
        run.call.send("middle")
        await executor.run(until: { run.observed.texts == ["first", "middle"] })
        run.call.send("latest")
        await executor.run(until: { run.observed.texts == ["first", "middle", "latest"] })
        #expect(run.transcript.writes == ["first"])
        #expect(run.transcript.kept == nil)
        held.open()
        run.requestStop()
        await executor.finish()
        await run.task.value
        #expect(run.transcript.writes == ["first", "latest"])
        #expect(run.transcript.kept == "latest")
    }

    @Test func textSentWhileStartingIsKept() async {

        let executor = TestExecutor()
        let held = Gate(changed: executor.notify)
        let run = Run(executor: executor, enabled: true, holds: [:], startGate: held, startText: "while starting")
        defer { held.open(); run.requestStop(); executor.run() }
        await executor.run(until: {
            held.entered && run.observed.texts == ["while starting"] && run.transcript.kept == "while starting"
        })
        #expect(!run.observed.started)
        #expect(run.call.recorded == [.subscribe, .start(true)])
        #expect(run.transcript.writes == ["while starting"])
        held.open()
        run.requestStop()
        await executor.finish()
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

        let executor = TestExecutor()
        let run = Run(executor: executor, enabled: initial, holds: [:])
        defer { run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        run.setEnabled(enabled)
        await executor.run(until: { run.observed.texts == [text] && run.transcript.kept == text })
        #expect(run.call.recorded == [.subscribe, .start(initial), .switchTo(enabled)])
        #expect(run.transcript.writes == [text])
        run.requestStop()
        await executor.finish()
        await run.task.value
        #expect(run.transcript.kept == text)
    }

    @Test(arguments: [false, true])
    func stoppingWaitsForCallTextAndTheLastWrite(holdWrite: Bool) async {

        let executor = TestExecutor()
        let held = Gate(changed: executor.notify)
        let run = Run(
            executor: executor, enabled: true, holds: holdWrite ? ["last text": held] : [:],
            stopGate: holdWrite ? nil : held, lastText: "last text"
        )
        defer { held.open(); run.requestStop(); executor.run() }
        await executor.run(until: { run.observed.started })
        run.requestStop()
        await executor.run(until: {
            held.entered && run.observed.texts == ["last text"]
                && (holdWrite || run.transcript.kept == "last text")
        })
        #expect(!run.observed.stopped)
        #expect(run.call.recorded == [.subscribe, .start(true), .stop])
        #expect(run.transcript.writes == ["last text"])
        #expect(run.transcript.kept == (holdWrite ? nil : "last text"))
        held.open()
        await executor.finish()
        await run.task.value
        #expect(run.observed.stopped)
        #expect(run.transcript.kept == "last text")
        #expect(run.transcript.writes == ["last text"])
    }
}
