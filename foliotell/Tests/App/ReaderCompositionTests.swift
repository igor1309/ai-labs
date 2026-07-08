@testable import FolioTellApp
import FolioTellCore
import Testing

@MainActor
struct ReaderCompositionTests {

    @Test func test_makeReaderSession_shouldStartTransportIdle() throws {

        let (session, _, _) = try makeSUT()

        #expect(session.transport.state == .idle(lastUtteranceToken: 0))
    }

    @Test func test_makeReaderSession_shouldSeedPositionAnchorFromStore() throws {

        let (session, _, store) = try makeSUT(storedAnchor: 16)

        #expect(session.position.state.storedAnchor == 16)
        #expect(store.calls == [.anchor("/doc.md")])
    }

    @Test func test_primaryTapped_shouldActivateSessionAndSpeakRemainderFromStoredAnchor() throws {

        let (session, synthesis, _) = try makeSUT(storedAnchor: 16)

        session.transport.event(.primaryTapped(makePlaybackRequest(from: session)))

        #expect(synthesis.calls == [
            .activateAudioSession,
            .speak(SpeakCommand(
                utteranceToken: 1,
                text: "Frost and sun.",
                speed: .one,
                voiceIdentifier: nil,
                languageCode: nil
            )),
        ])
    }

    @Test func test_willSpeakRange_shouldFeedPositionThroughBinderAndPersistAnchor() throws {

        let (session, synthesis, store) = try makeSUT()
        session.transport.event(.primaryTapped(makePlaybackRequest(from: session)))

        synthesis.dispatch(.willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 20))

        #expect(session.position.state.liveDocumentUTF16Offset == 20)
        #expect(session.position.state.storedAnchor == 16)
        #expect(store.calls.last == .set("/doc.md", 16))
    }

    @Test func test_utteranceDidFinish_shouldClearPositionAndReleaseAudioSession() throws {

        let (session, synthesis, store) = try makeSUT()
        session.transport.event(.primaryTapped(makePlaybackRequest(from: session)))

        synthesis.dispatch(.utteranceDidFinish(utteranceToken: 1))

        #expect(session.transport.state == .idle(lastUtteranceToken: 1))
        #expect(session.position.state.storedAnchor == nil)
        #expect(session.position.state.liveDocumentUTF16Offset == nil)
        #expect(store.calls.last == .clear("/doc.md"))
        #expect(synthesis.calls.last == .deactivateAudioSession)
    }

    @Test func test_idleJumpNext_shouldForwardToPositionAndPersistAnchor() throws {

        let (session, _, store) = try makeSUT()

        session.transport.event(.jumpToNextSentenceTapped)

        #expect(session.position.state.storedAnchor == 16)
        #expect(store.calls.last == .set("/doc.md", 16))
    }

    // MARK: - Helpers

    private func makeSUT(
        storedAnchor: Int? = nil
    ) throws -> (session: ReaderSession, synthesis: SynthesisSpy, store: PositionStoreSpy) {

        let store = PositionStoreSpy(stubbedAnchor: storedAnchor)
        var synthesis: SynthesisSpy!
        let session = ReaderComposition.makeReaderSession(
            document: try FolioDocument(fileName: "doc.md", text: "Winter morning. Frost and sun."),
            documentPath: "/doc.md",
            frontMatterMode: .read,
            positionStore: store,
            makeSynthesis: { dispatch in
                let spy = SynthesisSpy(dispatch: dispatch)
                synthesis = spy
                return spy
            },
            scheduler: .immediate
        )
        return (session, synthesis, store)
    }

    private func makePlaybackRequest(from session: ReaderSession) -> PlaybackRequest {

        return PlaybackRequest(
            text: session.position.state.speechText,
            speed: .one,
            voiceIdentifier: nil,
            startUTF16Offset: session.position.state.resumeSpokenUTF16Offset
        )
    }
}

@MainActor
private final class PositionStoreSpy: PlaybackPositionStore {

    enum Call: Equatable {
        case anchor(String)
        case set(String, Int)
        case clear(String)
    }

    var calls = [Call]()
    private let stubbedAnchor: Int?

    init(stubbedAnchor: Int?) {
        self.stubbedAnchor = stubbedAnchor
    }

    func anchor(forDocumentPath path: String) -> Int? {

        calls.append(.anchor(path))
        return stubbedAnchor
    }

    func setAnchor(_ anchor: Int, forDocumentPath path: String) {
        calls.append(.set(path, anchor))
    }

    func clearAnchor(forDocumentPath path: String) {
        calls.append(.clear(path))
    }
}

@MainActor
private final class SynthesisSpy: SpeechSynthesisControlling {

    enum Call: Equatable {
        case speak(SpeakCommand)
        case stopSpeaking
        case pause
        case resume
        case activateAudioSession
        case deactivateAudioSession
    }

    var calls = [Call]()
    let dispatch: (PlaybackTransportEvent) -> Void

    init(dispatch: @escaping (PlaybackTransportEvent) -> Void) {
        self.dispatch = dispatch
    }

    func speak(_ command: SpeakCommand) {
        calls.append(.speak(command))
    }

    func stopSpeaking() {
        calls.append(.stopSpeaking)
    }

    func pause() -> Bool {

        calls.append(.pause)
        return true
    }

    func resume() -> Bool {

        calls.append(.resume)
        return true
    }

    func activateAudioSession() {
        calls.append(.activateAudioSession)
    }

    func deactivateAudioSession() {
        calls.append(.deactivateAudioSession)
    }
}
