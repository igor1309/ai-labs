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
        ReaderSessionView(session: session)
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

/// Adapter wrapper: observes the single reader coordinator, holds global
/// settings, and delegates rendering to the pure `ReaderView`.
struct ReaderSessionView: View {
    @ObservedObject var session: ReaderSession

    @AppStorage("selectedSpeechSpeed") private var selectedSpeechSpeed = SpeechSpeed.one.rawValue
    @AppStorage("selectedFrontMatterPlaybackMode") private var selectedFrontMatterPlaybackMode = FrontMatterPlaybackMode.skip.rawValue
    @AppStorage("selectedSpeechVoiceIdentifier") private var selectedSpeechVoiceIdentifier = SpeechVoiceSelection.automaticIdentifier
    @AppStorage("dismissedVoiceQualityOnboardingLanguageCodes") private var dismissedVoiceQualityOnboardingLanguageCodes = ""
    @AppStorage("acknowledgedInstalledVoiceQualityLanguageCodes") private var acknowledgedInstalledVoiceQualityLanguageCodes = ""
    @State private var availableVoices: [AvailableVoice] = []
    @State private var voiceOptions: [ReaderVoiceOption] = []
    @State private var ignoredCatalogVoiceChange: VoiceSelectionChange?

    var body: some View {
            ReaderView(state: renderState, event: handle)
            .task {
                let selectedVoiceBeforeCatalogLoad = selectedVoiceIdentifierForPlayback
                availableVoices = await loadAvailableVoices()
                updateVoiceOptions()
                let selectedVoiceAfterCatalogLoad = selectedVoiceIdentifierForPlayback
                if selectedVoiceBeforeCatalogLoad != selectedVoiceAfterCatalogLoad {
                    ignoredCatalogVoiceChange = VoiceSelectionChange(
                        oldValue: selectedVoiceBeforeCatalogLoad,
                        newValue: selectedVoiceAfterCatalogLoad
                    )
                }
            }
            .onDisappear {
                session.stopTapped()
            }
            .onChange(of: selectedSpeed) { _, newSpeed in
                session.updateSpeed(newSpeed)
            }
            .onChange(of: selectedVoiceIdentifierForPlayback) { oldVoiceIdentifier, newVoiceIdentifier in
                let voiceChange = VoiceSelectionChange(
                    oldValue: oldVoiceIdentifier,
                    newValue: newVoiceIdentifier
                )
                if ignoredCatalogVoiceChange == voiceChange {
                    ignoredCatalogVoiceChange = nil
                    return
                }

                session.updateVoice(newVoiceIdentifier)
            }
            .onChange(of: selectedFrontMatterMode) { _, newMode in
                session.updateFrontMatterMode(newMode)
            }
            .onChange(of: session.playback.speechText) { _, _ in
                updateVoiceOptions()
            }
    }
}

private extension ReaderSessionView {

    func handle(_ viewEvent: ReaderViewEvent) {
        switch viewEvent {
        case .primaryTapped:
            session.primaryTapped(speed: selectedSpeed, voiceIdentifier: selectedVoiceIdentifierForPlayback)
        case .stopTapped:
            session.stopTapped()
        case .previousSentenceTapped:
            session.jump(.previous)
        case .nextSentenceTapped:
            session.jump(.next)
        case .startOverTapped:
            session.startOverTapped()
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

    var renderState: ReaderRenderState {

        return ReaderRenderState(
            title: session.documentPresentation.title,
            frontMatterText: session.documentPresentation.frontMatterText,
            bodyText: session.documentPresentation.bodyText,
            progress: session.playback.progressFraction,
            playbackState: session.playback.playbackState,
            isStartOverEnabled: session.playback.storedAnchor != nil || session.playback.playbackState != .idle,
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
        session.documentPresentation.languageCode
    }

    var voiceQualityBanner: ReaderVoiceQualityBanner? {
        VoiceQualityOnboarding.banner(
            detectedLanguageCode: detectedDocumentLanguageCode,
            availableVoices: availableVoices,
            dismissedLanguageCodes: dismissedVoiceQualityOnboardingLanguageCodesSet,
            acknowledgedInstalledLanguageCodes: acknowledgedInstalledVoiceQualityLanguageCodesSet
        )
    }

    func makeVoiceOptions() -> [ReaderVoiceOption] {

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

    func updateVoiceOptions() {

        voiceOptions = makeVoiceOptions()
    }

    var selectedVoiceIdentifierForPlayback: String? {

        if let selectedIdentifier = SpeechVoiceSelection.selectedVoiceIdentifier(
            storedIdentifier: selectedSpeechVoiceIdentifier,
            availableIdentifiers: Set(voiceOptions.map(\.id))
        ) {
            return selectedIdentifier
        }

        guard let detectedDocumentLanguageCode else {
            return nil
        }

        return SpeechVoiceSelection.automaticVoiceIdentifier(
            matching: detectedDocumentLanguageCode,
            availableVoices: availableVoices.map(\.speechDescriptor)
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

    var acknowledgedInstalledVoiceQualityLanguageCodesSet: Set<String> {

        Set(
            acknowledgedInstalledVoiceQualityLanguageCodes
                .split(separator: ",")
                .map(String.init)
                .filter { $0.isEmpty == false }
        )
    }

    func dismissVoiceQualityBanner() {

        guard let banner = voiceQualityBanner else {
            return
        }

        switch banner.kind {
        case .upgradeHint:
            dismissVoiceQualityUpgradeHint(for: banner.languageCode)
        case .installedAcknowledgement:
            acknowledgeInstalledVoiceQuality(for: banner.languageCode)
        }
    }

    func dismissVoiceQualityUpgradeHint(for languageCode: String) {

        var dismissedLanguageCodes = dismissedVoiceQualityOnboardingLanguageCodesSet
        dismissedLanguageCodes.insert(languageCode)
        dismissedVoiceQualityOnboardingLanguageCodes = dismissedLanguageCodes.sorted().joined(separator: ",")
    }

    func acknowledgeInstalledVoiceQuality(for languageCode: String) {

        var acknowledgedLanguageCodes = acknowledgedInstalledVoiceQualityLanguageCodesSet
        acknowledgedLanguageCodes.insert(languageCode)
        acknowledgedInstalledVoiceQualityLanguageCodes = acknowledgedLanguageCodes.sorted().joined(separator: ",")
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

struct ReaderDocumentPresentation: Equatable {
    let title: String
    let frontMatterText: String?
    let bodyText: String
    let languageCode: String?

    init(documentText: String, speechText: String, fileName: String = "") {

        let renderableText = FrontMatterRendering.renderableText(from: documentText)
        title = fileName
        frontMatterText = renderableText.frontMatter
        bodyText = renderableText.body
        languageCode = SpeechVoiceLanguage.languageCode(for: speechText)
    }
}

struct AvailableVoice: Sendable {
    let id: String
    let name: String
    let language: String
    let isAudioCapable: Bool
    let quality: SpeechVoiceQuality

    var speechDescriptor: SpeechVoiceDescriptor {
        SpeechVoiceDescriptor(
            identifier: id,
            language: language,
            isAudioCapable: isAudioCapable,
            quality: quality
        )
    }

    var menuTitle: String {
        name
    }

    init(_ voice: AVSpeechSynthesisVoice) {
        id = voice.identifier
        name = voice.name
        language = voice.language
        isAudioCapable = voice.audioFileSettings.isEmpty == false
        quality = SpeechVoiceQuality(voice.quality)
    }

    init(
        id: String,
        name: String,
        language: String,
        isAudioCapable: Bool = true,
        quality: SpeechVoiceQuality
    ) {
        self.id = id
        self.name = name
        self.language = language
        self.isAudioCapable = isAudioCapable
        self.quality = quality
    }
}

private struct VoiceSelectionChange: Equatable {
    let oldValue: String?
    let newValue: String?
}

enum VoiceQualityOnboarding {

    static func banner(
        detectedLanguageCode: String?,
        availableVoices: [AvailableVoice],
        dismissedLanguageCodes: Set<String>,
        acknowledgedInstalledLanguageCodes: Set<String> = []
    ) -> ReaderVoiceQualityBanner? {

        guard let detectedLanguageCode else {
            return nil
        }

        let languageVoices = availableVoices.filter { $0.language == detectedLanguageCode }
        guard languageVoices.isEmpty == false else {
            return nil
        }

        if let quality = bestQuality(in: languageVoices), quality != .standard {
            guard acknowledgedInstalledLanguageCodes.contains(detectedLanguageCode) == false else {
                return nil
            }

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
