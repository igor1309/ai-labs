import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI
#if os(iOS)
import UIKit
#endif

/// Owns the per-document session lifecycle; the injected factory runs once
/// per document.
struct ReaderScreen: View {
    let document: FolioDocument

    @StateObject private var session: ReaderSession

    init(document: FolioDocument, makeSession: @escaping () -> ReaderSession) {

        self.document = document
        _session = StateObject(wrappedValue: makeSession())
    }

    var body: some View {
        ReaderSessionView(document: document, transport: session.transport, position: session.position)
    }
}

struct ReaderSettingsView: View {
    @AppStorage("selectedFrontMatterPlaybackMode") private var storedFrontMatterMode = FrontMatterPlaybackMode.skip.rawValue

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Front matter") {
                    ForEach(FrontMatterPlaybackMode.allCases) { mode in
                        Button {
                            storedFrontMatterMode = mode.rawValue
                        } label: {
                            if selectedFrontMatterMode == mode {
                                Label(mode.title, systemImage: "checkmark")
                            } else {
                                Text(mode.title)
                            }
                        }
                        .accessibilityLabel(accessibilityLabel(for: mode))
                        .accessibilityIdentifier(accessibilityIdentifier(for: mode))
                    }
                }
            }
            .navigationTitle("Reader settings")
            .navigationBarBackButtonHidden(true)
            .accessibilityIdentifier("readerSettingsPage")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                    .accessibilityIdentifier("readerSettingsDone")
                }
            }
        }
    }
}

private extension ReaderSettingsView {

    var selectedFrontMatterMode: FrontMatterPlaybackMode {
        FrontMatterPlaybackMode.mode(for: storedFrontMatterMode)
    }

    func accessibilityLabel(for mode: FrontMatterPlaybackMode) -> String {

        selectedFrontMatterMode == mode ? "\(mode.title) selected" : mode.title
    }

    func accessibilityIdentifier(for mode: FrontMatterPlaybackMode) -> String {

        switch mode {
        case .read:
            "frontMatterReadOption"
        case .skip:
            "frontMatterSkipOption"
        }
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
    @AppStorage("dismissedVoiceQualityOnboardingLanguageCodes") private var dismissedVoiceQualityOnboardingLanguageCodes = ""
    @State private var availableVoices: [AvailableVoice] = []

    var body: some View {
            ReaderView(state: renderState, event: handle)
            .task {
                availableVoices = await loadAvailableVoices()
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
        case .voiceQualityBannerOpenSettings:
            openSettings()
        case .voiceQualityBannerDismissed:
            dismissVoiceQualityBanner()
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
            voiceQualityBanner: voiceQualityBanner,
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

    var voiceQualityBanner: ReaderVoiceQualityBanner? {
        VoiceQualityOnboarding.banner(
            detectedLanguageCode: detectedDocumentLanguageCode,
            availableVoices: availableVoices,
            dismissedLanguageCodes: dismissedVoiceQualityOnboardingLanguageCodesSet
        )
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
            .map(ReaderVoiceOption.init)
    }

    var selectedVoiceIdentifierForPlayback: String? {

        SpeechVoiceSelection.selectedVoiceIdentifier(
            storedIdentifier: selectedSpeechVoiceIdentifier,
            availableIdentifiers: Set(voiceOptions.map(\.id))
        )
    }

    var dismissedVoiceQualityOnboardingLanguageCodesSet: Set<String> {

        Set(
            dismissedVoiceQualityOnboardingLanguageCodes
                .split(separator: ",")
                .map(String.init)
                .filter { $0.isEmpty == false }
        )
    }

    func dismissVoiceQualityBanner() {

        guard let languageCode = voiceQualityBanner?.languageCode else {
            return
        }

        var dismissedLanguageCodes = dismissedVoiceQualityOnboardingLanguageCodesSet
        dismissedLanguageCodes.insert(languageCode)
        dismissedVoiceQualityOnboardingLanguageCodes = dismissedLanguageCodes.sorted().joined(separator: ",")
    }

    func openSettings() {

        #if os(iOS)
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else {
            return
        }

        UIApplication.shared.open(settingsURL)
        #endif
    }

    func loadAvailableVoices() async -> [AvailableVoice] {

        #if DEBUG
        if let overrideVoices = VoiceCatalogOverride.availableVoices() {
            return overrideVoices
        }
        #endif

        // speechVoices() can stall for seconds on device; query the catalog
        // once, off the main actor, instead of per render.
        return await Task.detached(priority: .userInitiated) {
            AVSpeechSynthesisVoice.speechVoices().map(AvailableVoice.init)
        }.value
    }
}

struct AvailableVoice: Sendable {
    let id: String
    let name: String
    let language: String
    let quality: SpeechVoiceQuality

    var menuTitle: String {
        let baseTitle = "\(name) (\(language))"
        switch quality {
        case .standard:
            return baseTitle
        case .enhanced:
            return "\(baseTitle) · Enhanced"
        case .premium:
            return "\(baseTitle) · Premium"
        }
    }

    init(_ voice: AVSpeechSynthesisVoice) {
        id = voice.identifier
        name = voice.name
        language = voice.language
        quality = SpeechVoiceQuality(voice.quality)
    }

    init(id: String, name: String, language: String, quality: SpeechVoiceQuality) {
        self.id = id
        self.name = name
        self.language = language
        self.quality = quality
    }
}

enum VoiceQualityOnboarding {

    static func banner(
        detectedLanguageCode: String?,
        availableVoices: [AvailableVoice],
        dismissedLanguageCodes: Set<String>
    ) -> ReaderVoiceQualityBanner? {

        guard let detectedLanguageCode else {
            return nil
        }

        let languageVoices = availableVoices.filter { $0.language == detectedLanguageCode }
        guard languageVoices.isEmpty == false else {
            return nil
        }

        if let quality = bestQuality(in: languageVoices), quality != .standard {
            return ReaderVoiceQualityBanner(
                kind: .installedAcknowledgement,
                languageCode: detectedLanguageCode,
                title: "\(quality.displayName) voice installed",
                message: "The picker already includes a higher-quality voice for this document's language."
            )
        }

        guard dismissedLanguageCodes.contains(detectedLanguageCode) == false else {
            return nil
        }

        return ReaderVoiceQualityBanner(
            kind: .upgradeHint,
            languageCode: detectedLanguageCode,
            title: "Voice quality upgrade",
            message: "This document is using a standard-quality voice. For better pronunciation, install an Enhanced or Premium voice in Settings > Accessibility > Spoken Content > Voices."
        )
    }

    private static func bestQuality(in voices: [AvailableVoice]) -> SpeechVoiceQuality? {

        voices
            .map(\.quality)
            .max()
    }
}

#if DEBUG
private enum VoiceCatalogOverride {

    static func availableVoices() -> [AvailableVoice]? {

        guard let mode = previewMode() else {
            return nil
        }

        switch mode {
        case "upgrade":
            return [
                AvailableVoice(id: "ru-compact", name: "Milena", language: "ru-RU", quality: .standard),
                AvailableVoice(id: "en-compact", name: "Samantha", language: "en-US", quality: .standard),
            ]
        case "installed":
            return [
                AvailableVoice(id: "ru-compact", name: "Milena", language: "ru-RU", quality: .standard),
                AvailableVoice(id: "ru-enhanced", name: "Yuliya", language: "ru-RU", quality: .enhanced),
            ]
        default:
            return nil
        }
    }

    private static func previewMode() -> String? {
        if let environmentValue = ProcessInfo.processInfo.environment["FOLIOTELL_VOICE_QUALITY_PREVIEW"] {
            return environmentValue
        }

        let arguments = ProcessInfo.processInfo.arguments
        if let indexed = arguments.firstIndex(of: "FOLIOTELL_VOICE_QUALITY_PREVIEW"),
           arguments.indices.contains(indexed + 1) {
            return arguments[indexed + 1]
        }

        if let valueArgument = arguments.first(where: { $0.hasPrefix("FOLIOTELL_VOICE_QUALITY_PREVIEW=") }) {
            return String(valueArgument.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).last ?? "")
        }

        let userDefaults = UserDefaults.standard
        if let storedMode = userDefaults.string(forKey: "voiceQualityPreviewMode"),
           storedMode.isEmpty == false {
            return storedMode
        }

        if let fileValue = filePreviewMode() {
            return fileValue
        }

        return nil
    }

    private static func filePreviewMode() -> String? {

        let fileManager = FileManager.default
        guard let applicationSupportURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }

        let previewURL = applicationSupportURL.appendingPathComponent("voice-quality-preview.txt")
        guard let contents = try? String(contentsOf: previewURL, encoding: .utf8) else {
            return nil
        }

        let trimmed = contents.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
#endif

private extension SpeechVoiceQuality {

    init(_ quality: AVSpeechSynthesisVoiceQuality) {
        switch quality {
        case .premium:
            self = .premium
        case .enhanced:
            self = .enhanced
        default:
            self = .standard
        }
    }

    var displayName: String {
        switch self {
        case .standard:
            "Standard"
        case .enhanced:
            "Enhanced"
        case .premium:
            "Premium"
        }
    }
}
