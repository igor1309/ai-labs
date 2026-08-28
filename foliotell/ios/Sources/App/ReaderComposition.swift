import Combine
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI

/// Synthesizer facts emitted by the AVFoundation adapter to its reader owner.
enum SpeechSynthesisEvent: Equatable {
    case didStart(utteranceToken: Int)
    case willSpeakRange(utteranceToken: Int, utteranceUTF16Offset: Int)
    case didFinish(utteranceToken: Int)
    case didCancel(utteranceToken: Int)
}

/// Synthesizer control surface owned by the reader coordinator.
@MainActor
protocol SpeechSynthesisControlling: AnyObject {
    var eventHandler: ((SpeechSynthesisEvent) -> Void)? { get set }
    func speak(_ command: SpeakCommand)
    func stopSpeaking()
    func pause() -> Bool
    func resume() -> Bool
    func activateAudioSession()
    func deactivateAudioSession()
}

struct ReaderPlaybackSnapshot: Equatable {
    let speechText: String
    let playbackState: PlaybackState
    let progressFraction: Double
    let storedAnchor: Int?
    let resumeSpokenUTF16Offset: Int
}

/// Single main-actor owner for live reader playback and position. AVFoundation
/// crosses into it once, then each fact updates one published snapshot.
@MainActor
final class ReaderSession: ObservableObject {

    private let synthesis: SpeechSynthesisControlling
    private let documentText: String
    private let documentTitle: String
    private let documentPath: String?
    private let positionStore: PlaybackPositionStore
    private var derivation: SpeechDerivation
    private var storedAnchor: Int?
    private var liveDocumentUTF16Offset: Int?
    private var activePlayback: ActivePlayback?
    private var lastUtteranceToken = 0

    @Published private(set) var documentPresentation: ReaderDocumentPresentation
    @Published private(set) var playback: ReaderPlaybackSnapshot

    init(
        synthesis: SpeechSynthesisControlling,
        documentText: String,
        documentTitle: String,
        documentPath: String?,
        frontMatterMode: FrontMatterPlaybackMode,
        positionStore: PlaybackPositionStore
    ) {

        self.synthesis = synthesis
        self.documentText = documentText
        self.documentTitle = documentTitle
        self.documentPath = documentPath
        self.positionStore = positionStore
        let derivation = SpeechDerivation(documentText: documentText, frontMatterMode: frontMatterMode)
        let storedAnchor = documentPath.flatMap { positionStore.anchor(forDocumentPath: $0) }
        self.derivation = derivation
        self.storedAnchor = storedAnchor
        documentPresentation = ReaderDocumentPresentation(
            documentText: documentText,
            speechText: derivation.speechText,
            fileName: documentTitle
        )
        let resumeSpokenUTF16Offset = storedAnchor.map {
            derivation.resumeSpokenUTF16Offset(forDocumentAnchor: $0)
        } ?? 0
        let progressFraction = storedAnchor.map {
            documentText.isEmpty ? 0 : min(1, Double($0) / Double(documentText.utf16.count))
        } ?? 0
        playback = ReaderPlaybackSnapshot(
            speechText: derivation.speechText,
            playbackState: .idle,
            progressFraction: progressFraction,
            storedAnchor: storedAnchor,
            resumeSpokenUTF16Offset: resumeSpokenUTF16Offset
        )

        synthesis.eventHandler = { [weak self] event in
            self?.receive(event)
        }
    }

    func primaryTapped(speed: SpeechSpeed, voiceIdentifier: String?) {

        switch playback.playbackState {
        case .idle:
            let playback = ActivePlayback(
                text: derivation.speechText,
                speed: speed,
                voiceIdentifier: voiceIdentifier,
                utteranceToken: nextUtteranceToken(),
                utteranceStartUTF16Offset: resumeSpokenUTF16Offset,
                spokenUTF16Offset: resumeSpokenUTF16Offset,
                hasActiveUtterance: true,
                isPauseRequested: false
            )
            activePlayback = playback
            publish()
            beginSpeaking(playback, replacingCurrentUtterance: false)

        case .speaking:
            requestPause()

        case .paused:
            resumeOrSpeakFresh()
        }
    }

    func stopTapped() {

        guard activePlayback != nil else {
            return
        }

        synthesis.stopSpeaking()
        synthesis.deactivateAudioSession()
        activePlayback = nil
        clearPosition()
    }

    func startOverTapped() {

        clearPosition()
        guard var playback = activePlayback else {
            return
        }

        playback.utteranceToken += 1
        lastUtteranceToken = playback.utteranceToken
        playback.utteranceStartUTF16Offset = 0
        playback.spokenUTF16Offset = 0
        playback.hasActiveUtterance = true
        playback.isPauseRequested = false
        activePlayback = playback
        publish()
        beginSpeaking(playback, replacingCurrentUtterance: true)
    }

    func jump(_ direction: SentenceJumpDirection) {

        guard var playback = activePlayback else {
            jumpWhileIdle(direction)
            return
        }

        guard let target = jumpTarget(in: playback.text, from: playback.spokenUTF16Offset, direction: direction) else {
            return
        }

        playback.utteranceToken += 1
        lastUtteranceToken = playback.utteranceToken
        playback.utteranceStartUTF16Offset = target
        playback.spokenUTF16Offset = target
        playback.hasActiveUtterance = playbackState == .speaking
        playback.isPauseRequested = false
        activePlayback = playback
        liveDocumentUTF16Offset = derivation.documentUTF16Offset(forSpokenUTF16Offset: target)
        recordAnchor(forSpokenUTF16Offset: target)
        publish()

        switch playbackState {
        case .speaking:
            beginSpeaking(playback, replacingCurrentUtterance: true)
        case .paused:
            synthesis.stopSpeaking()
        case .idle:
            return
        }
    }

    func updateSpeed(_ speed: SpeechSpeed) {

        guard var playback = activePlayback, playback.speed != speed else {
            return
        }

        playback.speed = speed
        activePlayback = playback
        replaceActiveUtterance()
    }

    func updateVoice(_ voiceIdentifier: String?) {

        guard var playback = activePlayback, playback.voiceIdentifier != voiceIdentifier else {
            return
        }

        playback.voiceIdentifier = voiceIdentifier
        activePlayback = playback
        replaceActiveUtterance()
    }

    func updateFrontMatterMode(_ mode: FrontMatterPlaybackMode) {

        guard activePlayback == nil else {
            return
        }

        derivation = SpeechDerivation(documentText: documentText, frontMatterMode: mode)
        liveDocumentUTF16Offset = nil
        documentPresentation = ReaderDocumentPresentation(
            documentText: documentText,
            speechText: derivation.speechText,
            fileName: documentTitle
        )
        publish()
    }

    private var playbackState: PlaybackState {

        guard let activePlayback else {
            return .idle
        }

        return activePlayback.isPaused ? .paused : .speaking
    }

    private var resumeSpokenUTF16Offset: Int {

        guard let storedAnchor else {
            return 0
        }

        return derivation.resumeSpokenUTF16Offset(forDocumentAnchor: storedAnchor)
    }

    private var progressFraction: Double {

        let documentLength = documentText.utf16.count
        guard let position = liveDocumentUTF16Offset ?? storedAnchor, documentLength > 0 else {
            return 0
        }

        return min(1, Double(position) / Double(documentLength))
    }

    private func receive(_ event: SpeechSynthesisEvent) {

        guard var playback = activePlayback else {
            return
        }

        switch event {
        case let .didStart(utteranceToken) where utteranceToken == playback.utteranceToken:
            if playback.isPauseRequested {
                let didPause = synthesis.pause()
                playback.isPauseRequested = didPause == false
                playback.isPaused = didPause
                activePlayback = playback
                publish()
            }

        case let .willSpeakRange(utteranceToken, utteranceUTF16Offset) where utteranceToken == playback.utteranceToken:
            playback.spokenUTF16Offset = min(
                max(playback.utteranceStartUTF16Offset + utteranceUTF16Offset, 0),
                playback.text.utf16.count
            )
            activePlayback = playback
            liveDocumentUTF16Offset = derivation.documentUTF16Offset(forSpokenUTF16Offset: playback.spokenUTF16Offset)
            recordAnchor(forSpokenUTF16Offset: playback.spokenUTF16Offset)
            publish()

        case let .didFinish(utteranceToken) where utteranceToken == playback.utteranceToken:
            activePlayback = nil
            clearPosition()
            synthesis.deactivateAudioSession()

        case let .didCancel(utteranceToken) where utteranceToken == playback.utteranceToken:
            activePlayback = nil
            liveDocumentUTF16Offset = nil
            synthesis.deactivateAudioSession()
            publish()

        case .didStart, .willSpeakRange, .didFinish, .didCancel:
            return
        }
    }

    private func requestPause() {

        guard var playback = activePlayback, playback.isPauseRequested == false else {
            return
        }

        let didPause = synthesis.pause()
        playback.isPauseRequested = didPause == false
        playback.isPaused = didPause
        activePlayback = playback
        publish()
    }

    private func resumeOrSpeakFresh() {

        guard var playback = activePlayback else {
            return
        }

        if playback.hasActiveUtterance, synthesis.resume() {
            playback.isPaused = false
            activePlayback = playback
            publish()
            return
        }

        playback.isPaused = false
        playback.hasActiveUtterance = true
        playback.utteranceToken += 1
        lastUtteranceToken = playback.utteranceToken
        playback.utteranceStartUTF16Offset = playback.spokenUTF16Offset
        activePlayback = playback
        publish()
        beginSpeaking(playback, replacingCurrentUtterance: false)
    }

    private func replaceActiveUtterance() {

        guard var playback = activePlayback else {
            return
        }

        playback.utteranceToken += 1
        lastUtteranceToken = playback.utteranceToken
        playback.utteranceStartUTF16Offset = playback.spokenUTF16Offset
        playback.hasActiveUtterance = true
        playback.isPaused = false
        playback.isPauseRequested = false
        activePlayback = playback
        publish()
        beginSpeaking(playback, replacingCurrentUtterance: true)
    }

    private func beginSpeaking(_ playback: ActivePlayback, replacingCurrentUtterance: Bool) {

        if replacingCurrentUtterance {
            synthesis.stopSpeaking()
        }
        synthesis.activateAudioSession()
        synthesis.speak(command(for: playback))
    }

    private func nextUtteranceToken() -> Int {

        lastUtteranceToken += 1
        return lastUtteranceToken
    }

    private func command(for playback: ActivePlayback) -> SpeakCommand {

        let offset = min(max(playback.spokenUTF16Offset, 0), playback.text.utf16.count)
        let utf16Index = playback.text.utf16.index(playback.text.utf16.startIndex, offsetBy: offset)
        let text: String
        if let stringIndex = String.Index(utf16Index, within: playback.text) {
            text = String(playback.text[stringIndex...])
        } else {
            text = playback.text
        }
        return SpeakCommand(
            utteranceToken: playback.utteranceToken,
            text: text,
            speed: playback.speed,
            voiceIdentifier: playback.voiceIdentifier,
            languageCode: SpeechVoiceLanguage.languageCode(for: text)
        )
    }

    private func jumpWhileIdle(_ direction: SentenceJumpDirection) {

        guard let target = jumpTarget(in: derivation.speechText, from: resumeSpokenUTF16Offset, direction: direction) else {
            return
        }

        liveDocumentUTF16Offset = nil
        recordAnchor(forSpokenUTF16Offset: target)
        publish()
    }

    private func jumpTarget(in text: String, from offset: Int, direction: SentenceJumpDirection) -> Int? {

        switch direction {
        case .previous:
            return PlaybackPositionMapping.previousSentenceStartUTF16Offset(in: text, from: offset)
        case .next:
            return PlaybackPositionMapping.nextSentenceStartUTF16Offset(in: text, from: offset)
        }
    }

    private func recordAnchor(forSpokenUTF16Offset offset: Int) {

        let anchor = derivation.documentAnchor(forSpokenUTF16Offset: offset)
        guard anchor != storedAnchor else {
            return
        }

        storedAnchor = anchor
        if let documentPath {
            positionStore.setAnchor(anchor, forDocumentPath: documentPath)
        }
    }

    private func clearPosition() {

        storedAnchor = nil
        liveDocumentUTF16Offset = nil
        if let documentPath {
            positionStore.clearAnchor(forDocumentPath: documentPath)
        }
        publish()
    }

    private func publish() {

        let snapshot = ReaderPlaybackSnapshot(
            speechText: derivation.speechText,
            playbackState: playbackState,
            progressFraction: progressFraction,
            storedAnchor: storedAnchor,
            resumeSpokenUTF16Offset: resumeSpokenUTF16Offset
        )
        guard playback != snapshot else {
            return
        }

        playback = snapshot
    }

    private struct ActivePlayback {
        let text: String
        var speed: SpeechSpeed
        var voiceIdentifier: String?
        var utteranceToken: Int
        var utteranceStartUTF16Offset: Int
        var spokenUTF16Offset: Int
        var hasActiveUtterance: Bool
        var isPauseRequested: Bool
        var isPaused = false
    }
}

/// Composition root for the reader playback coordinator and its AVFoundation
/// collaborator.
@MainActor
enum ReaderComposition {

    static func makeReaderSession(
        document: FolioDocument,
        documentPath: String?,
        frontMatterMode: FrontMatterPlaybackMode,
        positionStore: PlaybackPositionStore,
        makeSynthesis: () -> SpeechSynthesisControlling
    ) -> ReaderSession {

        return ReaderSession(
            synthesis: makeSynthesis(),
            documentText: document.text,
            documentTitle: document.fileName,
            documentPath: documentPath,
            frontMatterMode: frontMatterMode,
            positionStore: positionStore
        )
    }
}

/// Entry view built by the app scene: routes load failures to the error view
/// and composes the live reader for loaded documents.
struct ReaderRootView: View {
    let loadedDocument: LoadedFolioDocument
    let documentPath: String?

    #if os(iOS)
    @State private var isSettingsPresented = false
    #endif

    var body: some View {
        readerContent
    }

    @ViewBuilder
    private var documentContent: some View {
        switch loadedDocument {
        case let .failure(fileName, error):
            ReaderFailureView(fileName: fileName, error: error)
        case let .success(document):
            ReaderScreen(document: document, makeSession: {
                // Evaluated once per document by the screen's StateObject;
                // the persisted mode is read at that moment.
                ReaderComposition.makeReaderSession(
                    document: document,
                    documentPath: documentPath,
                    frontMatterMode: FrontMatterPlaybackMode.mode(
                        for: UserDefaults.standard.string(forKey: "selectedFrontMatterPlaybackMode") ?? ""
                    ),
                    positionStore: DefaultsPlaybackPositionStore(),
                    makeSynthesis: SpeechSynthesizerAdapter.init
                )
            })
        }
    }

    private var navigationTitle: String {
        let fileName: String

        switch loadedDocument {
        case let .failure(failedFileName, _):
            fileName = failedFileName
        case let .success(document):
            fileName = document.fileName
        }

        guard let extensionStart = fileName.lastIndex(of: ".") else {
            return fileName
        }

        return String(fileName[..<extensionStart])
    }

    #if os(iOS)
    private var readerContent: some View {
        documentContent
            .navigationTitle(navigationTitle)
            .toolbar {
                ToolbarTitleMenu()

                ToolbarItem(placement: .principal) {
                    Text(navigationTitle)
                        .lineLimit(1)
                        .accessibilityIdentifier("readerNavigationTitle")
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isSettingsPresented = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .accessibilityLabel("Reader settings")
                    .accessibilityIdentifier("readerSettingsGear")
                }
            }
            .sheet(isPresented: $isSettingsPresented) {
                ReaderSettingsView()
            }
    }
    #else
    private var readerContent: some View {
        documentContent
    }
    #endif
}
