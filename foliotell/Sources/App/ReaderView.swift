import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI

struct ReaderView: View {
    let loadedDocument: LoadedFolioDocument
    let fileName: String
    let documentPath: String?

    @AppStorage("selectedSpeechSpeed") private var selectedSpeechSpeed = SpeechSpeed.one.rawValue
    @AppStorage("selectedFrontMatterPlaybackMode") private var selectedFrontMatterPlaybackMode = FrontMatterPlaybackMode.skip.rawValue
    @AppStorage("selectedSpeechVoiceIdentifier") private var selectedSpeechVoiceIdentifier = SpeechVoiceSelection.automaticIdentifier
    @StateObject private var speechController = SpeechController()
    @State private var availableVoices: [SpeechVoiceOption] = []
    @State private var storedAnchor: Int?
    @State private var liveDocumentUTF16Offset: Int?

    private let positionStore: PlaybackPositionStore = DefaultsPlaybackPositionStore()

    var body: some View {
        content
            .padding()
            .navigationTitle(displayFileName)
            .safeAreaInset(edge: .bottom) {
                bottomControls
            }
            .task {
                // speechVoices() can stall for seconds on device; query the
                // catalog once, off the main actor, instead of per render.
                availableVoices = await Task.detached(priority: .userInitiated) {
                    AVSpeechSynthesisVoice.speechVoices().map(SpeechVoiceOption.init)
                }.value
            }
            .onAppear {
                if let documentPath {
                    storedAnchor = positionStore.anchor(forDocumentPath: documentPath)
                }
                speechController.onSpokenPositionChange = { spokenUTF16Offset in
                    updateLiveProgress(atSpokenUTF16Offset: spokenUTF16Offset)
                    recordAnchor(atSpokenUTF16Offset: spokenUTF16Offset)
                }
                speechController.onPlaybackDidFinishNaturally = {
                    clearStoredAnchor()
                }
            }
            .onDisappear {
                speechController.stop()
            }
            .onChange(of: selectedSpeed) { _, newSpeed in
                speechController.updateSpeed(newSpeed)
            }
            .onChange(of: selectedVoiceIdentifierForPlayback) { _, newVoiceIdentifier in
                speechController.updateVoiceIdentifier(newVoiceIdentifier)
            }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(displayFileName)
                .font(.title2)
                .fontWeight(.semibold)
                .lineLimit(2)

            switch loadedDocument {
            case let .failure(_, error):
                ErrorView(error: error)
            case let .success(document):
                documentText(document)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var displayFileName: String {
        switch loadedDocument {
        case let .failure(fileName, _):
            fileName
        case let .success(document):
            document.fileName
        }
    }

    private var selectedSpeed: SpeechSpeed {
        get { SpeechSpeed.speed(for: selectedSpeechSpeed) }
        nonmutating set { selectedSpeechSpeed = newValue.rawValue }
    }

    private var selectedFrontMatterMode: FrontMatterPlaybackMode {
        get { FrontMatterPlaybackMode.mode(for: selectedFrontMatterPlaybackMode) }
        nonmutating set { selectedFrontMatterPlaybackMode = newValue.rawValue }
    }

    private func speechText(for document: FolioDocument) -> String {

        SpeechTextNormalization.speechText(
            from: selectedFrontMatterMode.speechText(from: document.text)
        )
    }

    private var detectedDocumentLanguageCode: String? {
        switch loadedDocument {
        case .failure:
            nil
        case let .success(document):
            // Cyrillic detection is unaffected by Markdown syntax, so the
            // render path skips the full normalization pass.
            SpeechVoiceLanguage.languageCode(
                for: selectedFrontMatterMode.speechText(from: document.text)
            )
        }
    }

    private var voiceOptions: [SpeechVoiceOption] {
        let allVoiceOptions = availableVoices
        let filteredIdentifiers = SpeechVoiceSelection.filteredVoiceIdentifiers(
            availableIdentifiers: Set(allVoiceOptions.map(\.id)),
            languagesByIdentifier: Dictionary(uniqueKeysWithValues: allVoiceOptions.map { ($0.id, $0.language) }),
            detectedLanguageCode: detectedDocumentLanguageCode
        )

        return allVoiceOptions
            .filter { filteredIdentifiers.contains($0.id) }
            .sorted { lhs, rhs in
                if lhs.language == rhs.language {
                    lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                } else {
                    lhs.language.localizedCaseInsensitiveCompare(rhs.language) == .orderedAscending
                }
            }
    }

    private var selectedVoiceIdentifierForPlayback: String? {
        SpeechVoiceSelection.selectedVoiceIdentifier(
            storedIdentifier: selectedSpeechVoiceIdentifier,
            availableIdentifiers: Set(voiceOptions.map(\.id))
        )
    }

    private func updateLiveProgress(atSpokenUTF16Offset spokenUTF16Offset: Int) {
        guard case let .success(document) = loadedDocument else {
            return
        }

        liveDocumentUTF16Offset = PlaybackPositionMapping.documentUTF16Offset(
            documentText: document.text,
            frontMatterMode: selectedFrontMatterMode,
            spokenUTF16Offset: spokenUTF16Offset
        )
    }

    private func recordAnchor(atSpokenUTF16Offset spokenUTF16Offset: Int) {
        guard let documentPath, case let .success(document) = loadedDocument else {
            return
        }

        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: document.text,
            frontMatterMode: selectedFrontMatterMode,
            spokenUTF16Offset: spokenUTF16Offset
        )
        guard anchor != storedAnchor else {
            return
        }

        storedAnchor = anchor
        positionStore.setAnchor(anchor, forDocumentPath: documentPath)
    }

    private func clearStoredAnchor() {
        if let documentPath {
            positionStore.clearAnchor(forDocumentPath: documentPath)
        }
        storedAnchor = nil
        liveDocumentUTF16Offset = nil
    }

    private func resumeSpokenUTF16Offset(for document: FolioDocument) -> Int {

        guard let storedAnchor else {
            return 0
        }

        return PlaybackPositionMapping.resumeSpokenUTF16Offset(
            documentText: document.text,
            frontMatterMode: selectedFrontMatterMode,
            documentAnchor: storedAnchor
        )
    }

    private func startOver(_ document: FolioDocument) {
        clearStoredAnchor()
        if speechController.playbackState != .idle {
            speechController.play(
                speechText(for: document),
                speed: selectedSpeed,
                voiceIdentifier: selectedVoiceIdentifierForPlayback
            )
        }
    }

    private func playbackProgress(for document: FolioDocument) -> Double {

        let documentLength = document.text.utf16.count
        guard let position = liveDocumentUTF16Offset ?? storedAnchor, documentLength > 0 else {
            return 0
        }

        return min(1, Double(position) / Double(documentLength))
    }

    @ViewBuilder
    private var bottomControls: some View {
        switch loadedDocument {
        case .failure:
            EmptyView()
        case let .success(document):
            VStack(spacing: 8) {
                ProgressView(value: playbackProgress(for: document))
                    .progressViewStyle(.linear)
                    .accessibilityLabel("Listening progress")
                    .accessibilityIdentifier("playbackProgress")

                controlsCluster(for: document)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.bar)
        }
    }

    @ViewBuilder
    private func controlsCluster(for document: FolioDocument) -> some View {
        let cluster = HStack(spacing: 10) {
            settingsMenu(for: document)

            Spacer(minLength: 8)

            playbackButtons(for: document)
        }

        // Group the controls in a single Liquid Glass surface so adjacent glass
        // elements blend (Apple Music-style toolbar). The container is iOS 26+;
        // the macOS build path (swift build) keeps the flat cluster.
        #if os(iOS)
        GlassEffectContainer(spacing: 8) {
            cluster
        }
        #else
        cluster
        #endif
    }

    @ViewBuilder
    private func settingsMenu(for document: FolioDocument) -> some View {
        Menu {
            Section("Speed") {
                ForEach(SpeechSpeed.allCases) { speed in
                    Button {
                        selectedSpeed = speed
                    } label: {
                        if selectedSpeed == speed {
                            Label(speed.rawValue, systemImage: "checkmark")
                        } else {
                            Text(speed.rawValue)
                        }
                    }
                }
            }

            Section("Front matter") {
                ForEach(FrontMatterPlaybackMode.allCases) { mode in
                    Button {
                        selectedFrontMatterMode = mode
                    } label: {
                        if selectedFrontMatterMode == mode {
                            Label(mode.title, systemImage: "checkmark")
                        } else {
                            Text(mode.title)
                        }
                    }
                }
            }

            Section("Voice") {
                Button {
                    selectedSpeechVoiceIdentifier = SpeechVoiceSelection.automaticIdentifier
                } label: {
                    if selectedVoiceIdentifierForPlayback == nil {
                        Label("Auto", systemImage: "checkmark")
                    } else {
                        Text("Auto")
                    }
                }

                ForEach(voiceOptions) { voiceOption in
                    Button {
                        selectedSpeechVoiceIdentifier = voiceOption.id
                    } label: {
                        if selectedVoiceIdentifierForPlayback == voiceOption.id {
                            Label(voiceOption.menuTitle, systemImage: "checkmark")
                        } else {
                            Text(voiceOption.menuTitle)
                        }
                    }
                }
            }

            Section {
                Button {
                    startOver(document)
                } label: {
                    Label("Start Over", systemImage: "gobackward")
                }
                .disabled(storedAnchor == nil && speechController.playbackState == .idle)
            }
        } label: {
            Image(systemName: "slider.horizontal.3")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(minWidth: 44, minHeight: 44)
                .readerControlGlass(cornerRadius: 9)
        }
        .accessibilityLabel("Playback settings")
        .accessibilityIdentifier("readerSettingsMenu")
    }

    @ViewBuilder
    private func documentText(_ document: FolioDocument) -> some View {
        let renderableText = FrontMatterRendering.renderableText(from: document.text)

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let frontMatter = renderableText.frontMatter {
                    Text(frontMatter)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(renderableText.body)
                    .font(.body)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
        }
    }

    private func jumpToPreviousSentence(in document: FolioDocument) {
        switch speechController.playbackState {
        case .paused, .speaking:
            speechController.jumpToPreviousSentence()
        case .idle:
            let speechText = speechText(for: document)
            applyIdleJump(
                toSpokenUTF16Offset: PlaybackPositionMapping.previousSentenceStartUTF16Offset(
                    in: speechText,
                    from: resumeSpokenUTF16Offset(for: document)
                ),
                document: document
            )
        }
    }

    private func jumpToNextSentence(in document: FolioDocument) {
        switch speechController.playbackState {
        case .paused, .speaking:
            speechController.jumpToNextSentence()
        case .idle:
            let speechText = speechText(for: document)
            guard let target = PlaybackPositionMapping.nextSentenceStartUTF16Offset(
                in: speechText,
                from: resumeSpokenUTF16Offset(for: document)
            ) else {
                return
            }

            applyIdleJump(toSpokenUTF16Offset: target, document: document)
        }
    }

    private func applyIdleJump(toSpokenUTF16Offset target: Int, document: FolioDocument) {
        let anchor = PlaybackPositionMapping.documentAnchor(
            documentText: document.text,
            frontMatterMode: selectedFrontMatterMode,
            spokenUTF16Offset: target
        )
        storedAnchor = anchor
        // After an idle jump the position IS the anchor — drop any stale
        // frozen live offset so the progress bar tracks the jump.
        liveDocumentUTF16Offset = nil
        if let documentPath {
            positionStore.setAnchor(anchor, forDocumentPath: documentPath)
        }
    }

    @ViewBuilder
    private func playbackButtons(for document: FolioDocument) -> some View {
        let controlSize: CGFloat = 44
        let cornerRadius: CGFloat = 9

        Group {
            HStack(spacing: 8) {
                Button {
                    jumpToPreviousSentence(in: document)
                } label: {
                    Image(systemName: "backward.fill")
                        .font(.body.weight(.semibold))
                        .frame(width: controlSize, height: controlSize)
                        .foregroundStyle(Color.accentColor)
                        .readerControlGlass(cornerRadius: cornerRadius)
                }
                .accessibilityLabel("Previous sentence")
                .accessibilityIdentifier("previousSentenceButton")
                .buttonStyle(.plain)

                Button {
                    speechController.togglePrimaryControl(
                        speechText(for: document),
                        speed: selectedSpeed,
                        voiceIdentifier: selectedVoiceIdentifierForPlayback,
                        startingAtUTF16Offset: resumeSpokenUTF16Offset(for: document)
                    )
                } label: {
                    Image(systemName: speechController.primaryControlSystemImage)
                        .font(.title3.weight(.semibold))
                        .frame(width: controlSize, height: controlSize)
                        .foregroundStyle(.white)
                        .readerControlGlass(cornerRadius: cornerRadius, tint: Color.accentColor)
                }
                .accessibilityLabel(speechController.primaryControlTitle)
                .accessibilityIdentifier("primaryPlaybackButton")
                .buttonStyle(.plain)

                Button {
                    jumpToNextSentence(in: document)
                } label: {
                    Image(systemName: "forward.fill")
                        .font(.body.weight(.semibold))
                        .frame(width: controlSize, height: controlSize)
                        .foregroundStyle(Color.accentColor)
                        .readerControlGlass(cornerRadius: cornerRadius)
                }
                .accessibilityLabel("Next sentence")
                .accessibilityIdentifier("nextSentenceButton")
                .buttonStyle(.plain)

                Button {
                    speechController.stop()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.body.weight(.semibold))
                        .frame(width: controlSize, height: controlSize)
                        .foregroundStyle(stopForegroundStyle)
                        .readerControlGlass(cornerRadius: cornerRadius)
                }
                .accessibilityLabel("Stop")
                .accessibilityIdentifier("stopButton")
                .disabled(speechController.playbackState.isStopEnabled == false)
                .buttonStyle(.plain)
            }
        }
    }

    private var stopForegroundStyle: Color {
        speechController.playbackState.isStopEnabled ? Color.accentColor : Color.secondary.opacity(0.35)
    }
}

private extension View {

    /// Liquid Glass chrome for a reader control. On iOS 26 the label sits on an
    /// interactive glass capsule/rect (optionally tinted for the primary
    /// control); the macOS build path (swift build) keeps the original flat
    /// rounded-rectangle fill so the App target compiles without the iOS 26 SDK.
    @ViewBuilder
    func readerControlGlass(cornerRadius: CGFloat, tint: Color? = nil) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        #if os(iOS)
        let glass = tint.map { Glass.regular.tint($0).interactive() } ?? Glass.regular.interactive()
        glassEffect(glass, in: shape)
        #else
        background(tint ?? Color.secondary.opacity(0.12), in: shape)
        #endif
    }
}

private struct SpeechVoiceOption: Identifiable, Sendable {
    let id: String
    let name: String
    let language: String

    init(_ voice: AVSpeechSynthesisVoice) {
        id = voice.identifier
        name = voice.name
        language = voice.language
    }

    var menuTitle: String {
        "\(name) (\(language))"
    }
}

private struct ErrorView: View {
    let error: FolioDocumentError

    var body: some View {
        Text(error.message)
            .font(.body)
            .foregroundStyle(.red)
    }
}

private extension FolioDocumentError {

    var message: String {
        switch self {
        case .emptyDocument:
            "This document is empty."
        case .unreadableFile:
            "This file could not be read."
        case .unsupportedExtension:
            "This file type is not supported."
        case .unsupportedTextEncoding:
            "This document is not UTF-8 text."
        }
    }
}
