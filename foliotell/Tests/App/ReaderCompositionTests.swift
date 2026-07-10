import Combine
@testable import FolioTellApp
import FolioTellCore
import Testing

@MainActor
struct ReaderCompositionTests {

    @Test func test_makeReaderSession_shouldStartPlaybackIdle() throws {

        let (session, _, _) = try makeSUT()

        #expect(session.playback.playbackState == .idle)
    }

    @Test func test_makeReaderSession_shouldSeedPositionAnchorFromStore() throws {

        let (session, _, store) = try makeSUT(storedAnchor: 16)

        #expect(session.playback.storedAnchor == 16)
        #expect(store.calls == [.anchor("/doc.md")])
    }

    @Test func test_primaryTapped_shouldActivateSessionAndSpeakRemainderFromStoredAnchor() throws {

        let (session, synthesis, _) = try makeSUT(storedAnchor: 16)

        session.primaryTapped(speed: .one, voiceIdentifier: nil)

        #expect(synthesis.calls == [
            .activateAudioSession,
            .speak(SpeakCommand(
                utteranceToken: 1,
                text: "Frost and sun.",
                speed: .one,
                voiceIdentifier: nil,
                languageCode: "en-US"
            )),
        ])
    }

    @Test func test_primaryTapped_shouldReachSynthesizerInSameMainActorTurn() throws {

        let (session, synthesis, _) = try makeSUT()

        session.primaryTapped(speed: .one, voiceIdentifier: nil)

        #expect(synthesis.calls == [
            .activateAudioSession,
            .speak(SpeakCommand(
                utteranceToken: 1,
                text: "Winter morning. Frost and sun.",
                speed: .one,
                voiceIdentifier: nil,
                languageCode: "en-US"
            )),
        ])
    }

    @Test func test_primaryTapped_shouldPauseAfterSynthesizerStarts_whenPauseWasRequestedDuringStartup() throws {

        let (session, synthesis, _) = try makeSUT(pauseResults: [false, true])

        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        synthesis.emit(.didStart(utteranceToken: 1))

        #expect(synthesis.calls == [
            .activateAudioSession,
            .speak(SpeakCommand(
                utteranceToken: 1,
                text: "Winter morning. Frost and sun.",
                speed: .one,
                voiceIdentifier: nil,
                languageCode: "en-US"
            )),
            .pause,
            .pause,
        ])
        #expect(session.playback.playbackState == .paused)
    }

    @Test func test_willSpeakRange_shouldPersistAnchorThroughSingleCoordinator() throws {

        let (session, synthesis, store) = try makeSUT()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)

        synthesis.emit(.willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 20))

        #expect(session.playback.progressFraction > 0)
        #expect(session.playback.storedAnchor == 16)
        #expect(store.calls.last == .set("/doc.md", 16))
    }

    @Test func test_willSpeakRange_shouldPublishOnePlaybackSnapshotPerWord() throws {

        let (session, synthesis, _) = try makeSUT()
        let snapshotSpy = PlaybackSnapshotSpy(session.$playback)

        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        synthesis.emit(.willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 7))
        synthesis.emit(.willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 20))

        #expect(snapshotSpy.values.count == 4)
    }

    @Test func test_utteranceDidFinish_shouldClearPositionAndReleaseAudioSession() throws {

        let (session, synthesis, store) = try makeSUT()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)

        synthesis.emit(.didFinish(utteranceToken: 1))

        #expect(session.playback.playbackState == .idle)
        #expect(session.playback.storedAnchor == nil)
        #expect(store.calls.last == .clear("/doc.md"))
        #expect(synthesis.calls.last == .deactivateAudioSession)
    }

    @Test func test_staleFinish_shouldNotStopNewPlayback_afterStopAndRestart() throws {

        let (session, synthesis, _) = try makeSUT()

        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        session.stopTapped()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        synthesis.emit(.didFinish(utteranceToken: 1))

        #expect(session.playback.playbackState == .speaking)
    }

    @Test func test_stopTapped_shouldClearSavedAnchorBeforeRestartingPlayback() throws {

        let (session, synthesis, store) = try makeSUT()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        synthesis.emit(.willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 20))
        session.stopTapped()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)

        #expect(store.calls.last == .clear("/doc.md"))
    }

    @Test func test_primaryTapped_shouldSpeakFromDocumentStart_afterStop() throws {

        let (session, synthesis, _) = try makeSUT()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)
        synthesis.emit(.willSpeakRange(utteranceToken: 1, utteranceUTF16Offset: 20))
        session.stopTapped()
        session.primaryTapped(speed: .one, voiceIdentifier: nil)

        #expect(synthesis.calls.last == .speak(SpeakCommand(
            utteranceToken: 2,
            text: "Winter morning. Frost and sun.",
            speed: .one,
            voiceIdentifier: nil,
            languageCode: "en-US"
        )))
    }

    @Test func test_idleJumpNext_shouldForwardToPositionAndPersistAnchor() throws {

        let (session, _, store) = try makeSUT()

        session.jump(.next)

        #expect(session.playback.storedAnchor == 16)
        #expect(store.calls.last == .set("/doc.md", 16))
    }

    @Test func test_makeReaderSession_shouldReleasePlaybackStack_onSessionRelease() throws {

        let references = try makeReleasedPlaybackStackReferences()

        #expect(references.session.object == nil && references.synthesis.object == nil)
    }

    @Test func test_banner_shouldReturnUpgradeHint_onStandardVoicesOnly() {

        let banner = VoiceQualityOnboarding.banner(
            detectedLanguageCode: "ru-RU",
            availableVoices: [
                makeVoice(id: "ru-compact", name: "Milena", language: "ru-RU", quality: .standard),
            ],
            dismissedLanguageCodes: []
        )

        #expect(banner?.kind == .upgradeHint)
    }

    @Test func test_banner_shouldReturnInstalledAcknowledgement_onEnhancedVoice() {

        let banner = VoiceQualityOnboarding.banner(
            detectedLanguageCode: "ru-RU",
            availableVoices: [
                makeVoice(id: "ru-enhanced", name: "Yuliya", language: "ru-RU", quality: .enhanced),
            ],
            dismissedLanguageCodes: []
        )

        #expect(banner?.kind == .installedAcknowledgement)
    }

    @Test func test_banner_shouldReturnNil_onDismissedLanguage() {

        let banner = VoiceQualityOnboarding.banner(
            detectedLanguageCode: "ru-RU",
            availableVoices: [
                makeVoice(id: "ru-compact", name: "Milena", language: "ru-RU", quality: .standard),
            ],
            dismissedLanguageCodes: ["ru-RU"]
        )

        #expect(banner == nil)
    }

    @Test func test_banner_shouldReturnNil_onAcknowledgedInstalledLanguage() {

        let banner = VoiceQualityOnboarding.banner(
            detectedLanguageCode: "ru-RU",
            availableVoices: [
                makeVoice(id: "ru-enhanced", name: "Yuliya", language: "ru-RU", quality: .enhanced),
            ],
            dismissedLanguageCodes: [],
            acknowledgedInstalledLanguageCodes: ["ru-RU"]
        )

        #expect(banner == nil)
    }

    @Test func test_banner_shouldReturnUpgradeHint_onAcknowledgedInstalledLanguageWithStandardVoices() {

        let banner = VoiceQualityOnboarding.banner(
            detectedLanguageCode: "ru-RU",
            availableVoices: [
                makeVoice(id: "ru-compact", name: "Milena", language: "ru-RU", quality: .standard),
            ],
            dismissedLanguageCodes: [],
            acknowledgedInstalledLanguageCodes: ["ru-RU"]
        )

        #expect(banner?.kind == .upgradeHint)
    }

    @Test func test_menuTitle_shouldUseVoiceNameWithoutRepeatingLanguageOrQuality() {

        let option = ReaderVoiceOption(
            makeVoice(id: "ru-enhanced", name: "Milena Enhanced", language: "ru-RU", quality: .enhanced)
        )

        #expect(option.menuTitle == "Milena Enhanced")
    }

    // MARK: - Helpers

    private func makeSUT(
        storedAnchor: Int? = nil,
        pauseResults: [Bool] = []
    ) throws -> (session: ReaderSession, synthesis: SynthesisSpy, store: PositionStoreSpy) {

        let store = PositionStoreSpy(stubbedAnchor: storedAnchor)
        var synthesis: SynthesisSpy!
        let session = ReaderComposition.makeReaderSession(
            document: try FolioDocument(fileName: "doc.md", text: "Winter morning. Frost and sun."),
            documentPath: "/doc.md",
            frontMatterMode: .read,
            positionStore: store,
            makeSynthesis: {
                let spy = SynthesisSpy(pauseResults: pauseResults)
                synthesis = spy
                return spy
            }
        )
        return (session, synthesis, store)
    }

    private func makeReleasedPlaybackStackReferences() throws -> (
        session: WeakReference<ReaderSession>,
        synthesis: WeakReference<SynthesisSpy>
    ) {

        let (session, synthesis, _) = try makeSUT()

        return (WeakReference(session), WeakReference(synthesis))
    }

    private func makeVoice(
        id: String,
        name: String,
        language: String,
        quality: SpeechVoiceQuality
    ) -> AvailableVoice {

        AvailableVoice(id: id, name: name, language: language, quality: quality)
    }
}

private final class WeakReference<Object: AnyObject> {
    weak var object: Object?

    init(_ object: Object) {

        self.object = object
    }
}

private final class PlaybackSnapshotSpy {
    private(set) var values = [ReaderPlaybackSnapshot]()
    private var cancellable: AnyCancellable?

    init<Publisher: Combine.Publisher>(_ publisher: Publisher) where Publisher.Output == ReaderPlaybackSnapshot, Publisher.Failure == Never {

        cancellable = publisher.sink { [weak self] in
            self?.values.append($0)
        }
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
    var eventHandler: ((SpeechSynthesisEvent) -> Void)?
    private var pauseResults: [Bool]

    init(pauseResults: [Bool]) {
        self.pauseResults = pauseResults
    }

    func speak(_ command: SpeakCommand) {
        calls.append(.speak(command))
    }

    func stopSpeaking() {
        calls.append(.stopSpeaking)
    }

    func pause() -> Bool {

        calls.append(.pause)
        return pauseResults.isEmpty ? true : pauseResults.removeFirst()
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

    func emit(_ event: SpeechSynthesisEvent) {

        eventHandler?(event)
    }
}
