import BlockingTestWork
import CallText
import Foundation
import Testing
import TranscriptFile
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct FinishedTextSwitchTests {

    @Test(arguments: [false, true])
    func finishedSideKeepsItsTextWhenTheOtherSideSwitches(onCallSide: Bool) async throws {

        let finished = PublishedSide(snapshot: .init(status: .listening, entries: []))
        let open = PublishedSide(snapshot: .init(status: .listening, entries: []))
        let call = CallText(microphone: onCallSide ? open : finished, call: onCallSide ? finished : open)
        await call.start()
        var updates = call.updates.makeAsyncIterator()
        while let snapshot = await updates.next(), snapshot.status != .listening {}
        await finished.send(.init(status: .listening, entries: [
            .init(text: .init(id: 0, start: 0, end: 2, pending: "first draft")),
        ]))
        let draft = try #require(await updates.next())
        #expect(draft.entries.map(\.text.pending) == ["first draft"])
        await finished.end(.init(status: .finished, entries: [
            .init(text: .init(id: 0, start: 0, end: 2, settled: "first last")),
        ]))
        await call.setEnabled(false)
        await call.setEnabled(true)
        #expect(await finished.switches.isEmpty)
        #expect(await open.switches == [false, true])
        await open.end(.init(status: .finished, entries: [
            .init(text: .init(id: 0, start: 0, end: 1, settled: "continuing")),
        ]))
        await call.stop()

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let transcript = try await TranscriptFile(url: url)
            do {
                let speaker: State.Speaker = onCallSide ? .theirs : .mine
                var statuses: [State.Status] = []
                var final: State?
                while let snapshot = await updates.next() {
                    statuses.append(snapshot.status)
                    let entries = snapshot.entries.filter { $0.speaker == speaker }
                    #expect(entries.map(\.text) == [.init(id: 0, start: 0, end: 2, settled: "first last")])
                    #expect(entries.map(\.writtenLater) == [false])
                    try await transcript.write(Transcript.segments(from: snapshot))
                    #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) }.contains("first last"))
                    final = snapshot
                }
                #expect(statuses.contains(.off))
                #expect(statuses.contains(.listening))
                #expect(final?.status == .finished)
                let mine = onCallSide ? "continuing" : "first last"
                let theirs = onCallSide ? "first last" : "continuing"
                #expect(try await offPool { try String(contentsOf: url, encoding: .utf8) }
                    == "# Transcript\n\n**Me** 00:00:00\n\(mine)\n\n**Them** 00:00:00\n\(theirs)\n")
                await transcript.close()
            } catch {
                await transcript.close()
                throw error
            }
        }
    }
}
