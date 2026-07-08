import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI

/// Owns the per-document session lifecycle; the session factory runs once per
/// document, seeded with the front-matter mode persisted at creation time.
struct ReaderScreen: View {
    let document: FolioDocument

    @StateObject private var session: ReaderSession

    init(document: FolioDocument, makeSession: @escaping (FrontMatterPlaybackMode) -> ReaderSession) {

        self.document = document
        _session = StateObject(wrappedValue: makeSession(Self.storedFrontMatterMode))
    }

    var body: some View {
        ReaderSessionView(document: document, transport: session.transport, position: session.position)
    }

    private static var storedFrontMatterMode: FrontMatterPlaybackMode {

        FrontMatterPlaybackMode.mode(
            for: UserDefaults.standard.string(forKey: "selectedFrontMatterPlaybackMode") ?? ""
        )
    }
}

/// Adapter wrapper: observes both machines, holds the global settings, and
/// delegates rendering to the pure `ReaderView` as `(state, event)`.
struct ReaderSessionView: View {
    let document: FolioDocument

    @ObservedObject var transport: ReaderSession.TransportModel
    @ObservedObject var position: ReaderSession.PositionModel

    @AppStorage("selectedSpeechSpeed") private var selectedSpeechSpeed = SpeechSpeed.one.rawValue
    @AppStorage("selectedFrontMatterPlaybackMode") private var selectedFrontMatterPlaybackMode = FrontMatterPlaybackMode.skip.rawValue
    @AppStorage("selectedSpeechVoiceIdentifier") private var selectedSpeechVoiceIdentifier = SpeechVoiceSelection.automaticIdentifier
    @State private var availableVoices: [AvailableVoice] = []

    var body: some View {
        ReaderView(state: renderState, event: handle)
            .task {
                // speechVoices() can stall for seconds on device; query the
                // catalog once, off the main actor, instead of per render.
                availableVoices = await Task.detached(priority: .userInitiated) {
                    AVSpeechSynthesisVoice.speechVoices().map(AvailableVoice.init)
                }.value
            }
            .onDisappear {
                transport.event(.stopTapped)
            }
            .onChange(of: selectedSpeed) { _, newSpeed in
                transport.event(.speedChanged(newSpeed))
            }
            .onChange(of: selectedVoiceIdentifierForPlayback) { _, newVoiceIdentifier in
                transport.event(.voiceChanged(newVoiceIdentifier))
            }
            .onChange(of: selectedFrontMatterMode) { _, newMode in
                position.event(.frontMatterModeChanged(newMode))
            }
    }
}

private extension ReaderSessionView {

    func handle(_ viewEvent: ReaderViewEvent) {
        switch viewEvent {
        case .primaryTapped:
            transport.event(.primaryTapped(playbackRequest))
        case .stopTapped:
            transport.event(.stopTapped)
        case .previousSentenceTapped:
            transport.event(.jumpToPreviousSentenceTapped)
        case .nextSentenceTapped:
            transport.event(.jumpToNextSentenceTapped)
        case .startOverTapped:
            transport.event(.startOverTapped)
        case let .speedSelected(speed):
            selectedSpeechSpeed = speed.rawValue
        case let .frontMatterModeSelected(mode):
            selectedFrontMatterPlaybackMode = mode.rawValue
        case let .voiceSelected(voiceIdentifier):
            selectedSpeechVoiceIdentifier = voiceIdentifier ?? SpeechVoiceSelection.automaticIdentifier
        }
    }

    var playbackRequest: PlaybackRequest {

        PlaybackRequest(
            text: position.state.speechText,
            speed: selectedSpeed,
            voiceIdentifier: selectedVoiceIdentifierForPlayback,
            startUTF16Offset: position.state.resumeSpokenUTF16Offset
        )
    }

    var renderState: ReaderRenderState {

        let renderableText = FrontMatterRendering.renderableText(from: document.text)
        return ReaderRenderState(
            title: document.fileName,
            frontMatterText: renderableText.frontMatter,
            bodyText: renderableText.body,
            progress: position.state.progressFraction,
            playbackState: transport.state.playbackState,
            isStartOverEnabled: position.state.storedAnchor != nil || transport.state.playbackState != .idle,
            selectedSpeed: selectedSpeed,
            selectedFrontMatterMode: selectedFrontMatterMode,
            selectedVoiceIdentifier: selectedVoiceIdentifierForPlayback,
            voiceOptions: voiceOptions
        )
    }

    var selectedSpeed: SpeechSpeed {
        SpeechSpeed.speed(for: selectedSpeechSpeed)
    }

    var selectedFrontMatterMode: FrontMatterPlaybackMode {
        FrontMatterPlaybackMode.mode(for: selectedFrontMatterPlaybackMode)
    }

    var detectedDocumentLanguageCode: String? {
        SpeechVoiceLanguage.languageCode(for: position.state.speechText)
    }

    var voiceOptions: [ReaderVoiceOption] {

        let filteredIdentifiers = SpeechVoiceSelection.filteredVoiceIdentifiers(
            availableIdentifiers: Set(availableVoices.map(\.id)),
            languagesByIdentifier: Dictionary(uniqueKeysWithValues: availableVoices.map { ($0.id, $0.language) }),
            detectedLanguageCode: detectedDocumentLanguageCode
        )

        return availableVoices
            .filter { filteredIdentifiers.contains($0.id) }
            .sorted { lhs, rhs in
                if lhs.language == rhs.language {
                    lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                } else {
                    lhs.language.localizedCaseInsensitiveCompare(rhs.language) == .orderedAscending
                }
            }
            .map { ReaderVoiceOption(id: $0.id, menuTitle: "\($0.name) (\($0.language))") }
    }

    var selectedVoiceIdentifierForPlayback: String? {

        SpeechVoiceSelection.selectedVoiceIdentifier(
            storedIdentifier: selectedSpeechVoiceIdentifier,
            availableIdentifiers: Set(voiceOptions.map(\.id))
        )
    }
}

private struct AvailableVoice: Sendable {
    let id: String
    let name: String
    let language: String

    init(_ voice: AVSpeechSynthesisVoice) {
        id = voice.identifier
        name = voice.name
        language = voice.language
    }
}
