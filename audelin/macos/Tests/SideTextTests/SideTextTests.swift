import Testing
@testable import SideText

struct SideTextTests {

    @Test(arguments: [1.0, 3.0, 44_100.0, 48_000.0])
    func audioIsReadOneWordAtATime(sampleRate: Double) async {

        await withRig { rig in
            await rig.side.start()
            await rig.listening()
            for word in 1...5 {
                await rig.audio.send(tones(word...word, sampleRate: sampleRate))
                #expect(await rig.side.state == expected(1...word, sampleRate: sampleRate))
            }
            #expect(await rig.text.samples == (1...5).map(Float.init))
        }
    }

    @Test func liveAudioResumesAtTheSampleWhereFillInLeftOff() async {

        let loading = Gate()
        await withRig(plans: [FillPlan(through: 2.5, before: loading)]) { rig in
            await rig.side.start()
            await loading.entered()
            // Two samples per word put the fill boundary inside the third tone.
            rig.audio.capture(Audio(start: 0, samples: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5], sampleRate: 2))
            let delivery = Task {
                await rig.audio.deliver(Audio(start: 1, samples: [2, 2, 3, 3, 4, 4, 5, 5], sampleRate: 2))
            }
            await rig.inputQueued()
            #expect(await rig.side.state == State(status: .fillingIn, entries: []))
            await loading.release()
            await delivery.value
            #expect(await rig.side.state == expected(1...5))
            #expect(await rig.text.samples == [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
            #expect(await rig.fills[0].starts == [0])
        }
    }

    @Test(arguments: [false, true])
    func switchingOffFreezesTextBeforeAndAfterHeldFillInReturns(failing: Bool) async {

        let filling = Gate()
        let plan = FillPlan(
            through: 3, prefixThrough: 1, afterPrefix: filling,
            failure: failing ? "late fill failure" : nil
        )
        await withRig(plans: [plan, FillPlan()]) { rig in
            rig.audio.capture(tones(1...3))
            await rig.side.start()
            await filling.entered()
            #expect(await rig.side.state == expected(1...1, status: .fillingIn))
            await rig.side.setEnabled(false)
            await rig.audio.deliver(tones(2...3))
            let frozen = expected(1...1, status: .off)
            #expect(await rig.side.state == frozen)
            #expect(await rig.text.stopCalls == 0)
            await filling.release()
            await rig.side.waitForWork()
            #expect(await rig.side.state == frozen)
            #expect(await rig.text.stopCalls == 0)
            if !failing {
                await rig.side.setEnabled(true)
                #expect(await rig.listening() == expected(1...3, later: 2..<4))
                #expect(await rig.fills[1].starts == [3])
                #expect(await rig.text.samples == [1, 2, 3])
            }
        }
    }

    @Test func switchingOnFillsInAgainAndMarksOnlyMissedWordsWrittenLater() async {

        await withRig(plans: [FillPlan(), FillPlan()]) { rig in
            await rig.side.start()
            await rig.listening()
            for word in 1...2 { await rig.audio.send(tones(word...word)) }
            #expect(await rig.side.state == expected(1...2))
            await rig.side.setEnabled(false)
            for word in 3...5 { await rig.audio.send(tones(word...word)) }
            #expect(await rig.side.state == expected(1...2, status: .off))
            await rig.side.setEnabled(true)
            #expect(await rig.listening() == expected(1...5, later: 3..<6))
            #expect(await rig.fills[1].starts == [2])
            #expect(await rig.text.samples == [1, 2, 3, 4, 5])
            await rig.audio.send(tones(6...6))
            #expect(await rig.side.state == expected(1...6, later: 3..<6))
        }
    }

    @Test func aHearingFinishingAfterSwitchOffIsNotHeardTwiceOnSwitchOn() async {

        let hearing = Gate()
        await withRig(plans: [FillPlan(), FillPlan()]) { rig in
            await rig.side.start()
            await rig.listening()
            await rig.audio.send(tones(1...1))
            await rig.text.holdNextHearing(hearing)
            let held = Task { await rig.audio.send(tones(2...2)) }
            await hearing.entered()
            await rig.side.setEnabled(false)
            #expect(await rig.side.state == expected(1...1, status: .off))
            await rig.side.setEnabled(true)
            await hearing.release()
            await held.value
            #expect(await rig.listening() == expected(1...2, later: 2..<3))
            #expect(await rig.fills[1].starts == [2])
            #expect(await rig.text.samples == [1, 2])
        }
    }

    @Test func audioEndingFinishesEveryWordAndWaitsForLiveTextToStop() async {

        let stopping = Gate()
        await withRig(finishOnlyWord: 3, stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            for word in 1...3 { await rig.audio.send(tones(word...word)) }
            #expect(await rig.side.state == expected(1...2))
            rig.audio.end()
            await rig.heldStop(stopping, keeps: expected(1...3, settled: true))
            await stopping.release()
            #expect(await rig.result() == expected(1...3, status: .finished, settled: true))
            #expect(await rig.text.finishCalls == 1)
        }
    }

    @Test func audioEndingWaitsForHeldFillInThenFinishesAndStopsLiveText() async {

        let filling = Gate()
        let stopping = Gate()
        let plan = FillPlan(through: 3, prefixThrough: 1, afterPrefix: filling)
        await withRig(plans: [plan], finishOnlyWord: 3, stopping: stopping) { rig in
            rig.audio.capture(tones(1...3))
            await rig.side.start()
            await filling.entered()
            rig.audio.end()
            await rig.audioEndReceived()
            #expect(await rig.side.state == expected(1...1, status: .fillingIn))
            #expect(await rig.text.stopCalls == 0)
            #expect(await rig.text.finishCalls == 0)
            #expect(await rig.fills[0].abandoned == false)
            await filling.release()
            await rig.heldStop(stopping, keeps: expected(1...3, settled: true))
            await stopping.release()
            #expect(await rig.result() == expected(1...3, status: .finished, settled: true))
            #expect(await rig.text.finishCalls == 1)
        }
    }

    @Test func audioEndingWhileOffKeepsOnlyVisibleWordsAndStopsLiveText() async {

        let stopping = Gate()
        await withRig(stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            for word in 1...2 { await rig.audio.send(tones(word...word)) }
            await rig.side.setEnabled(false)
            for word in 3...4 { await rig.audio.send(tones(word...word)) }
            rig.audio.end()
            await rig.heldStop(stopping, keeps: expected(1...2, status: .off))
            await stopping.release()
            #expect(await rig.result() == expected(1...2, status: .finished))
            #expect(await rig.text.samples == [1, 2])
            #expect(await rig.text.finishCalls == 0)
        }
    }

    @Test func stoppingDrainsHeldAudioAndWaitsForLiveTextToStop() async {

        await checkStoppingHeldAudio(stopCount: 1)
    }

    @Test func stoppingWhileFillingInAbandonsItAndWaitsForLiveTextToStop() async {

        await checkEndingHeldFill(abandon: false)
    }

    @Test func abandoningWithOpenAudioKeepsVisibleWordsAndWaitsForLiveTextToStop() async {

        let stopping = Gate()
        await withRig(finishOnlyWord: 3, stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            for word in 1...3 { await rig.audio.send(tones(word...word)) }
            let abandoning = Task {
                await rig.side.abandon()
                return await rig.side.state
            }
            await rig.heldStop(stopping, keeps: expected(1...2))
            #expect(rig.audio.isEnded == false)
            await stopping.release()
            let final = expected(1...2, status: .finished)
            #expect(await rig.result() == final)
            #expect(await abandoning.value == final)
            #expect(rig.audio.isEnded == false)
            #expect(await rig.text.finishCalls == 0)
        }
    }

    @Test func abandoningWhileFillingInKeepsVisibleWordsAndWaitsForLiveTextToStop() async {

        await checkEndingHeldFill(abandon: true)
    }

    @Test func stoppingTwiceDrainsHeldAudioAndStopsLiveTextOnce() async {

        await checkStoppingHeldAudio(stopCount: 2)
    }

    @Test(arguments: [false, true])
    func audioEndingAndSwitchingOffAbandonHeldFillInWithoutChangingVisibleWords(audioEndsFirst: Bool) async {

        let filling = Gate()
        let stopping = Gate()
        let plan = FillPlan(through: 3, prefixThrough: 1, afterPrefix: filling)
        await withRig(plans: [plan], stopping: stopping) { rig in
            rig.audio.capture(tones(1...3))
            await rig.side.start()
            await filling.entered()
            let switching: Task<Void, Never>?
            if audioEndsFirst {
                rig.audio.end()
                await rig.audioEndReceived()
                switching = Task { await rig.side.setEnabled(false) }
            } else {
                await rig.side.setEnabled(false)
                switching = nil
                rig.audio.end()
            }
            await rig.heldStop(stopping, keeps: expected(1...1, status: .off))
            #expect(await rig.fills[0].abandoned)
            #expect(await filling.isHeld)
            await stopping.release()
            let final = expected(1...1, status: .finished)
            #expect(await rig.result() == final)
            await switching?.value
            await filling.release()
            await rig.side.waitForWork()
            #expect(await rig.side.state == final)
            #expect(await rig.text.finishCalls == 0)
        }
    }

    @Test func abandoningIgnoresAHearingThatReturnsAfterLiveTextStopped() async {

        let hearing = Gate()
        let stopping = Gate()
        await withRig(stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            await rig.audio.send(tones(1...1))
            await rig.text.holdNextHearing(hearing)
            let delivery = Task { await rig.audio.send(tones(2...2)) }
            await hearing.entered()
            let abandoning = Task { await rig.side.abandon() }
            await rig.heldStop(stopping, keeps: expected(1...1))
            await stopping.release()
            let final = expected(1...1, status: .finished)
            #expect(await rig.result() == final)
            await abandoning.value
            #expect(rig.audio.isEnded == false)
            #expect(await hearing.isHeld)
            await hearing.release()
            await delivery.value
            #expect(await rig.side.state == final)
            #expect(await rig.text.stopCalls == 1)
            #expect(await rig.text.finishCalls == 0)
        }
    }

    private func checkStoppingHeldAudio(stopCount: Int) async {

        let delivery = Gate()
        let stopping = Gate()
        await withRig(finishOnlyWord: 4, stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            rig.audio.holdNextDelivery(delivery)
            let sending = Task { await rig.audio.send(tones(1...4)) }
            await delivery.entered()
            var stops: [Task<State, Never>] = []
            for _ in 0..<stopCount {
                stops.append(Task {
                    await rig.side.stop()
                    return await rig.side.state
                })
                await rig.stopRequested()
            }
            rig.audio.end()
            #expect(await rig.side.state == State(status: .listening, entries: []))
            #expect(await rig.text.stopCalls == 0)
            await delivery.release()
            await sending.value
            await rig.heldStop(stopping, keeps: expected(1...4, settled: true))
            await stopping.release()
            let final = expected(1...4, status: .finished, settled: true)
            #expect(await rig.result() == final)
            for stop in stops { #expect(await stop.value == final) }
            #expect(await rig.text.samples == [1, 2, 3, 4])
            #expect(await rig.text.finishCalls == 1)
            await rig.side.stop()
            await rig.side.abandon()
            #expect(await rig.side.state == final)
            #expect(await rig.text.stopCalls == 1)
        }
    }

    private func checkEndingHeldFill(abandon: Bool) async {

        let filling = Gate()
        let stopping = Gate()
        let plan = FillPlan(through: 3, prefixThrough: 1, afterPrefix: filling)
        await withRig(plans: [plan], stopping: stopping) { rig in
            rig.audio.capture(tones(1...3))
            await rig.side.start()
            await filling.entered()
            let ending = Task {
                if abandon { await rig.side.abandon() } else { await rig.side.stop() }
                return await rig.side.state
            }
            await rig.heldStop(stopping, keeps: expected(1...1, status: .fillingIn))
            #expect(await rig.fills[0].abandoned)
            #expect(await filling.isHeld)
            #expect(rig.audio.isEnded == false)
            await stopping.release()
            let final = expected(1...1, status: .finished)
            #expect(await rig.result() == final)
            #expect(await ending.value == final)
            #expect(await filling.isHeld)
            #expect(rig.audio.isEnded == false)
            await filling.release()
            await rig.side.waitForWork()
            #expect(await rig.side.state == final)
            #expect(await rig.text.finishCalls == 0)
        }
    }

    @Test func hearingFailureKeepsTheFirstWordAndWaitsForLiveTextToStop() async {

        let stopping = Gate()
        await withRig(failWord: 2, stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            await rig.audio.send(tones(1...1))
            let failing = Task { await rig.audio.send(tones(2...2)) }
            await stopping.entered()
            #expect(await rig.side.state == expected(1...1))
            #expect(await rig.text.stopped == false)
            await stopping.release()
            await failing.value
            #expect(await rig.result() == expected(1...1, status: .failed(.hearing("hearing failed"))))
        }
    }

    @Test func finishingFailureKeepsTheWordsAndWaitsForLiveTextToStop() async {

        let stopping = Gate()
        await withRig(failFinish: true, stopping: stopping) { rig in
            await rig.side.start()
            await rig.listening()
            for word in 1...3 { await rig.audio.send(tones(word...word)) }
            rig.audio.end()
            await stopping.entered()
            #expect(await rig.side.state == expected(1...3))
            #expect(await rig.text.stopped == false)
            await stopping.release()
            #expect(await rig.result() == expected(1...3, status: .failed(.finishing("finishing failed"))))
        }
    }

    @Test func fillInFailureKeepsItsFirstWordAndWaitsForLiveTextToStop() async {

        let stopping = Gate()
        let plan = FillPlan(through: 3, prefixThrough: 1, failure: "fill in failed")
        await withRig(plans: [plan], stopping: stopping) { rig in
            rig.audio.capture(tones(1...3))
            await rig.side.start()
            await stopping.entered()
            #expect(await rig.side.state == expected(1...1, status: .fillingIn))
            #expect(await rig.text.stopped == false)
            await stopping.release()
            #expect(await rig.result() == expected(1...1, status: .failed(.fillingIn("fill in failed"))))
        }
    }
}
