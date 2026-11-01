import Testing
@testable import FillIn

struct FillInTests {

    @Test func wordsWrittenWhileGettingReadyComeBackFromTheStartInOrder() async {

        let loading = Gate()
        await withRig(loading: loading) { rig in
            await rig.fill.start()
            await loading.entered()
            await rig.write(0..<10)
            #expect(await rig.fill.state.status == .gettingReady)
            await loading.release()
            let final = await rig.result()
            #expect(final == expected(0..<10))
            #expect(await rig.written.reads == [0..<10])
        }
    }

    @Test func switchingOnReadsFromTheStartAndMarksTheMissedWordsWrittenLater() async {

        await withRig { rig in
            await rig.write(0..<5)
            await rig.fill.start(writtenLater: true)
            #expect(await rig.result() == expected(0..<5, later: 0..<5))
        }
    }

    @Test func audioEndingWhileGettingReadyIsReadToItsEnd() async {

        let loading = Gate()
        await withRig(loading: loading) { rig in
            await rig.fill.start()
            await loading.entered()
            await rig.write(0..<7, ended: true)
            await loading.release()
            #expect(await rig.result() == expected(0..<7))
        }
    }

    @Test func audioEndingDuringAHeldReadIsReadToItsEndWithoutRepeatingWords() async {

        let reading = Gate()
        await withRig(readHold: (1, reading)) { rig in
            await rig.write(0..<3)
            await rig.fill.start()
            await reading.entered()
            await rig.write(3..<8, ended: true)
            await reading.release()
            #expect(await rig.result() == expected(0..<8))
            #expect(await rig.written.reads == [0..<3, 3..<8])
            #expect(await rig.text.heardSamples == (0..<8).map(Float.init))
        }
    }

    @Test func abandoningWhileGettingReadyEndsBeforeTheLoadIsReleased() async {

        let loading = Gate()
        await withRig(loading: loading) { rig in
            await rig.fill.start()
            await loading.entered()
            await rig.write(0..<3)
            await rig.fill.abandon()
            #expect(await rig.result() == expected(0..<0))
            #expect(await loading.isHeld)
            await loading.release()
            await rig.fill.waitForWork()
            #expect(await rig.fill.state == expected(0..<0))
            #expect(await rig.written.reads.isEmpty)
        }
    }

    @Test func abandoningDuringAHeldReadKeepsTheTextBeforeTheReadIsReleased() async {

        let hearing = Gate()
        let reading = Gate()
        await withRig(readHold: (2, reading), hearHold: (1, hearing)) { rig in
            await rig.write(0..<2)
            await rig.fill.start()
            await hearing.entered()
            await rig.write(2..<5, ended: true)
            await hearing.release()
            await reading.entered()
            await rig.fill.abandon()
            #expect(await rig.result() == expected(0..<2))
            #expect(await reading.isHeld)
            await reading.release()
            await rig.fill.waitForWork()
            #expect(await rig.fill.state == expected(0..<2))
            #expect(await rig.text.heardSamples == [0, 1])
        }
    }

    @Test func failureGettingReadyIsReported() async {

        await withRig(failPreparation: true) { rig in
            await rig.write(0..<3)
            await rig.fill.start()
            #expect(await rig.result() == expected(0..<0, status: .failed(.gettingReady("preparation failed"))))
            #expect(await rig.written.reads.isEmpty)
        }
    }

    @Test func failureReadingKeepsTheWordsAlreadyHeard() async {

        let hearing = Gate()
        await withRig(hearHold: (1, hearing), failRead: 2) { rig in
            await rig.write(0..<2)
            await rig.fill.start()
            await hearing.entered()
            await rig.write(2..<5, ended: true)
            await hearing.release()
            #expect(await rig.result() == expected(0..<2, status: .failed(.reading("read failed"))))
            #expect(await rig.written.reads == [0..<2, 2..<5])
        }
    }

    @Test func failureHearingTheSecondWordKeepsTheFirstWord() async {

        await withRig(failWord: 1) { rig in
            await rig.write(0..<3)
            await rig.fill.start()
            #expect(await rig.result() == expected(0..<1, status: .failed(.hearing("hearing failed at word1"))))
            #expect(await rig.text.heardSamples == [0])
        }
    }

    @Test(arguments: [false, true])
    func aHearingCompletingAfterAbandonmentCannotChangeTheFinalText(failing: Bool) async {

        let hearing = Gate()
        await withRig(hearHold: (2, hearing), failWord: failing ? 1 : nil) { rig in
            await rig.write(0..<3)
            await rig.fill.start()
            await hearing.entered()
            await rig.fill.abandon()
            #expect(await rig.result() == expected(0..<1))
            #expect(await hearing.isHeld)
            await hearing.release()
            await rig.fill.waitForWork()
            #expect(await rig.fill.state == expected(0..<1))
        }
    }

    @Test func repeatedStartsAndAbandonmentDoNotRestartFinishedWork() async {

        await withRig { rig in
            await rig.write(0..<2)
            await rig.fill.start()
            #expect(await rig.result() == expected(0..<2))
            await rig.fill.start(from: 0, writtenLater: true)
            await rig.fill.abandon()
            #expect(await rig.fill.state == expected(0..<2))
            #expect(await rig.text.preparations == 1)
            #expect(await rig.written.reads == [0..<2])
        }
    }

    @Test(arguments: [1.0, 3.0, 44_100.0, 48_000.0])
    func resumesFromTheLastHeardSampleAndTrimsBothReadBounds(sampleRate: Double) async {

        await withRig { rig in
            await rig.written.append(Audio(start: 0, samples: (0..<8).map(Float.init), sampleRate: sampleRate))
            rig.audio.set(through: 6 / sampleRate)
            await rig.fill.start(from: 2 / sampleRate)
            #expect(await rig.result() == expected(2..<6, sampleRate: sampleRate, chunkStart: 2))
            #expect(await rig.written.reads == [(2 / sampleRate)..<(6 / sampleRate)])
            #expect(await rig.text.heardSamples == [2, 3, 4, 5])
        }
    }

    @Test func wordsCapturedAfterSwitchOnAreNotMarkedWrittenLater() async {

        let loading = Gate()
        await withRig(loading: loading) { rig in
            await rig.write(0..<2)
            await rig.fill.start(writtenLater: true)
            await loading.entered()
            await rig.write(2..<5)
            await loading.release()
            #expect(await rig.result() == expected(0..<5, later: 0..<2))
        }
    }

    @Test func captureStillRunningDoesNotExtendTheReadBoundary() async {

        let reading = Gate()
        await withRig(readHold: (1, reading)) { rig in
            await rig.write(0..<2)
            await rig.fill.start()
            await reading.entered()
            await rig.write(2..<5)
            await reading.release()
            #expect(await rig.result() == expected(0..<2))
            #expect(await rig.written.reads == [0..<2])
        }
    }

    @Test func noMissedAudioReadiesLiveTextWithoutReading() async {

        await withRig { rig in
            await rig.fill.start()
            #expect(await rig.result() == expected(0..<0))
            #expect(await rig.text.preparations == 1)
            #expect(await rig.written.reads.isEmpty)
        }
    }

    @Test(arguments: [1.0, 48_000.0])
    func missingWrittenAudioFailsInsteadOfFinishing(sampleRate: Double) async {

        await withRig { rig in
            rig.audio.set(through: 1 / sampleRate)
            await rig.fill.start()
            #expect(await rig.result() == expected(0..<0, status: .failed(.reading(
                "The written track does not cover the missed audio"
            ))))
        }
    }
}

private func expected(
    _ words: Range<Int>, sampleRate: Double = 1, chunkStart: Int = 0, later: Range<Int> = 0..<0,
    status: State.Status = .finished
) -> State {

    State(
        status: status,
        entries: words.map { word in
            let start = Double(chunkStart) / sampleRate + Double(word - chunkStart) / sampleRate
            return State.Entry(
                text: Text(
                    id: word, start: start, end: start + 1 / sampleRate, pending: "word\(word)"
                ),
                writtenLater: later.contains(word)
            )
        },
        heardThrough: Double(chunkStart) / sampleRate + Double(words.upperBound - chunkStart) / sampleRate
    )
}
