import Synchronization
import Testing
import TranscriptLayout

struct TranscriptLayoutRenderingTests {
    @Test func entriesAndSpanUseExactFormatterArgumentsAndResults() {
        let spy = FormatSpy()
        let sut = TranscriptLayout(lineTime: spy.line, span: spy.span)
        #expect(spy.calls.isEmpty)
        var state = MemoryStorage()
        sut.prepare(&state)
        #expect(spy.calls.isEmpty)
        sut.update(&state, entries: [Text(Key(0), 61.9, end: 80, late: true), Text(Key(1), 65, end: 70, late: true)],
                   replacing: true, newlyFinal: 0)
        #expect(spy.calls == [.line(61.9), .line(65), .line(61.9), .line(80), .span("line(61.9)", "line(80.0)")])
        #expect(Array(state.rows) == [.late(span: "span[line(61.9)|line(80.0)]", entries: [
            .init(id: 0, time: "line(61.9)", speaker: 0, words: "words"),
            .init(id: 1, time: "line(65.0)", speaker: 0, words: "words"),
        ])])
    }

    @Test func unchangedTextAndFinalizationDoNotFormat() {
        let text = Text(Key(0), 2)
        var state = makeStorage([text])
        let spy = FormatSpy()
        let sut = TranscriptLayout(lineTime: spy.line, span: spy.span)
        sut.update(&state, entries: [text], replacing: true, newlyFinal: 0)
        sut.update(&state, entries: [text], replacing: true, newlyFinal: 1)
        #expect(spy.calls.isEmpty)
        #expect(state.rows.tail.isEmpty)
        #expect(state.rows.sealed == [.entry(.init(id: 0, time: "00:02", speaker: 0, words: "words"))])
    }

    @Test func revisionFormatsTheOriginalAnchorWithoutReformattingTheSpan() {
        var state = makeStorage([Text(Key(0), 2, end: 8, late: true)])
        let spy = FormatSpy()
        let sut = TranscriptLayout(lineTime: spy.line, span: spy.span)
        sut.update(&state, entries: [Text(Key(0), 99, end: 8, late: true, words: "revised")], replacing: true, newlyFinal: 0)
        #expect(spy.calls == [.line(2)])
        #expect(Array(state.rows) == [.late(span: "00:02–00:08", entries: [
            .init(id: 0, time: "line(2.0)", speaker: 0, words: "revised"),
        ])])
    }
}

private final class FormatSpy: Sendable {
    enum Call: Equatable { case line(Double), span(String, String) }
    private let storage = Mutex<[Call]>([])
    var calls: [Call] { storage.withLock { $0 } }
    func line(_ value: Double) -> String {
        storage.withLock { $0.append(.line(value)) }
        return "line(\(value))"
    }
    func span(_ start: String, _ end: String) -> String {
        storage.withLock { $0.append(.span(start, end)) }
        return "span[\(start)|\(end)]"
    }
}
