import BlockingTestWork
import Foundation
import Testing
import TranscriptFile
@testable import CallText
@testable import Compose
@testable import LiveText

@Suite(.timeLimit(.minutes(1)))
struct FinishedTextSwitchTests {

    @Test(arguments: [false, true])
    func finishedSideKeepsItsTextWhenTheOtherSideSwitches(onCallSide: Bool) async throws {

        let finishedAudio = TextAudio(), openAudio = TextAudio()
        defer { finishedAudio.end(); openAudio.end() }
        let finishedRecognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("first", start: 0, end: 1), .init("draft", start: 1, end: 2)])),
        ], endings: [.success(.init(words: [.init("last", start: 1, end: 2)], from: 1))])
        let openRecognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("continuing", start: 0, end: 1)])),
        ], endings: [.success(.init(words: []))])
        let finished = SwitchObservedSide(side: CallSide(
            audio: finishedAudio, text: Compose.TrackText(recognizerSource: { finishedRecognizer }),
            written: TextTrack(chunks: []), sampleRate: 1
        ))
        let open = SwitchObservedSide(side: CallSide(
            audio: openAudio, text: Compose.TrackText(recognizerSource: { openRecognizer }),
            written: TextTrack(chunks: []), sampleRate: 1
        ))
        let call = CallText(microphone: onCallSide ? open : finished, call: onCallSide ? finished : open)
        await call.start()
        var updates = call.updates.makeAsyncIterator()
        var snapshots: [State] = []
        while let state = await updates.next() {
            snapshots.append(state)
            if state.status == .listening { break }
        }
        await finishedAudio.send(.init(start: 0, samples: [0.25, 0.5], sampleRate: 1))
        finishedAudio.end()
        await finished.ended.next()
        let speaker: State.Speaker = onCallSide ? .theirs : .mine
        let retained: [State.Entry] = [
            .init(speaker: speaker, text: .init(id: 0, start: 0, end: 2, settled: "first last"), writtenLater: false),
        ]
        #expect(await call.state == State(status: .listening, entries: .init(tail: retained)))

        await call.setEnabled(false)
        #expect(await call.state == State(status: .off, entries: .init(tail: retained)))
        while let state = await updates.next() {
            snapshots.append(state)
            if state.status == .off { break }
        }
        await call.setEnabled(true)
        while let state = await updates.next() {
            snapshots.append(state)
            if state.status == .listening { break }
        }
        #expect(await call.state == State(status: .listening, entries: .init(tail: retained)))
        #expect(finished.switches.all.isEmpty)
        #expect(open.switches.all == [false, true])
        await openAudio.send(.init(start: 0, samples: [0.75], sampleRate: 1))
        openAudio.end()
        await call.stop()
        while let state = await updates.next() { snapshots.append(state) }
        let final = await call.state
        #expect(final.status == .finished)
        #expect(final.entries.filter { $0.speaker == speaker } == retained)
        #expect(final.entries.filter { $0.speaker != speaker }.map(\.text.settled) == ["continuing"])
        #expect(await finishedRecognizer.finishes == 1)
        #expect(await openRecognizer.finishes == 1)

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let transcript = try await TranscriptFile(url: url)
            var finishedTextSeen = false
            for state in snapshots {
                let entries = Array(state.entries).filter { $0.speaker == speaker }
                if entries == retained { finishedTextSeen = true }
                if finishedTextSeen { #expect(entries == retained) }
                try await transcript.write(Transcript.segments(from: state))
                if finishedTextSeen {
                    #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) }.contains("first last"))
                }
            }
            #expect(finishedTextSeen)
            #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) }.contains("continuing"))
            await transcript.close()
        }
    }
}

private struct SwitchObservedSide: Side {

    let side: CallSide
    let switches = Values<Bool>()
    let ended = Signal()

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {

        await side.listen(receive)
        ended.send()
    }

    func start(enabled: Bool) async { await side.start(enabled: enabled) }
    func setEnabled(_ enabled: Bool) async {

        switches.append(enabled)
        await side.setEnabled(enabled)
    }
    func stop() async { await side.stop() }
}
