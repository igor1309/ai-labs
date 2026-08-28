#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI

/// Everything the reader renders, derived by the wrapper from the machines
/// and the persisted settings.
struct ReaderRenderState: Equatable {
    let title: String
    let frontMatterText: String?
    let bodyText: String
    let progress: Double
    let playbackState: PlaybackState
    let isStartOverEnabled: Bool
    let selectedSpeed: SpeechSpeed
    let selectedFrontMatterMode: FrontMatterPlaybackMode
    let selectedVoiceIdentifier: String?
    let voiceQualityBanner: ReaderVoiceQualityBanner?
    let voiceOptions: [ReaderVoiceOption]

    init(
        title: String,
        frontMatterText: String?,
        bodyText: String,
        progress: Double,
        playbackState: PlaybackState,
        isStartOverEnabled: Bool,
        selectedSpeed: SpeechSpeed,
        selectedFrontMatterMode: FrontMatterPlaybackMode,
        selectedVoiceIdentifier: String?,
        voiceQualityBanner: ReaderVoiceQualityBanner? = nil,
        voiceOptions: [ReaderVoiceOption]
    ) {
        self.title = title
        self.frontMatterText = frontMatterText
        self.bodyText = bodyText
        self.progress = progress
        self.playbackState = playbackState
        self.isStartOverEnabled = isStartOverEnabled
        self.selectedSpeed = selectedSpeed
        self.selectedFrontMatterMode = selectedFrontMatterMode
        self.selectedVoiceIdentifier = selectedVoiceIdentifier
        self.voiceQualityBanner = voiceQualityBanner
        self.voiceOptions = voiceOptions
    }

    var voiceMenuState: ReaderVoiceMenuState {

        ReaderVoiceMenuState(
            selectedVoiceIdentifier: selectedVoiceIdentifier,
            voiceOptions: voiceOptions
        )
    }

    var playbackMenuState: ReaderPlaybackMenuState {

        ReaderPlaybackMenuState(
            selectedSpeed: selectedSpeed,
            isStartOverEnabled: isStartOverEnabled
        )
    }
}

/// The Voice menu's complete input, intentionally excluding word-level
/// playback progress and the transport control state.
struct ReaderVoiceMenuState: Equatable {
    let selectedVoiceIdentifier: String?
    let voiceOptions: [ReaderVoiceOption]
}

/// The Playback menu's complete input, intentionally excluding word-level
/// playback progress and the transport control state.
struct ReaderPlaybackMenuState: Equatable {
    let selectedSpeed: SpeechSpeed
    let isStartOverEnabled: Bool
}

struct ReaderVoiceOption: Equatable, Identifiable {
    let id: String
    let menuTitle: String

    init(_ voice: AvailableVoice) {
        id = voice.id
        menuTitle = voice.menuTitle
    }

    init(id: String, menuTitle: String) {
        self.id = id
        self.menuTitle = menuTitle
    }
}

struct ReaderVoiceQualityBanner: Equatable, Identifiable {
    enum Kind: Equatable {
        case upgradeHint
        case installedAcknowledgement
    }

    let id: String
    let kind: Kind
    let languageCode: String
    let title: String
    let message: String

    init(kind: Kind, languageCode: String, title: String, message: String) {

        self.kind = kind
        self.languageCode = languageCode
        self.title = title
        self.message = message
        id = "\(kind)-\(languageCode)"
    }
}

enum ReaderViewEvent: Equatable {
    case primaryTapped
    case stopTapped
    case previousSentenceTapped
    case nextSentenceTapped
    case startOverTapped
    case speedSelected(SpeechSpeed)
    case frontMatterModeSelected(FrontMatterPlaybackMode)
    case voiceSelected(String?)
    case voiceQualityBannerOpenSettings
    case voiceQualityBannerDismissed
}

/// Pure presentation of the reader: a function of `state`, routing every user
/// action out through `event`.
struct ReaderView: View {
    let state: ReaderRenderState
    let event: (ReaderViewEvent) -> Void

    var body: some View {
        readerContent
    }

    #if os(iOS)
    // DocumentGroup hosts the reader in its own navigation container, which does
    // not bridge `.bottomBar` toolbar placement. An inner NavigationStack gives
    // the bottom bar a SwiftUI navigation container to attach to. Its top bar
    // must stay installed (hiding it drops the bottom bar too), so it is
    // emptied instead — no back button, empty inline title, hidden background —
    // leaving DocumentGroup's title/back/Actions chrome as the only visible bar.
    private var readerContent: some View {
        NavigationStack {
            reader
                .toolbar {
                    readerBottomBar
                }
                .navigationBarBackButtonHidden(true)
                .toolbarBackground(.hidden, for: .navigationBar)
                .navigationTitle("")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
    #else
    private var readerContent: some View {
        reader
    }
    #endif

    private var reader: some View {
        content
            .padding()
            .overlay(alignment: .top) {
                playbackProgressRibbon
            }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 24) {
            if let voiceQualityBanner = state.voiceQualityBanner {
                voiceQualityBannerView(voiceQualityBanner)
            }

            documentText
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var documentText: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let frontMatterText = state.frontMatterText {
                    Text(frontMatterText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(state.bodyText)
                    .font(.body)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
        }
    }

    @ViewBuilder
    private func voiceQualityBannerView(_ banner: ReaderVoiceQualityBanner) -> some View {

        let accentColor: Color = banner.kind == .upgradeHint ? .orange : .green
        VStack(alignment: .leading, spacing: 12) {
            Label {
                Text(banner.title)
                    .font(.headline)
            } icon: {
                Image(systemName: banner.kind == .upgradeHint ? "sparkles" : "checkmark.seal.fill")
            }
            .foregroundStyle(accentColor)

            Text(banner.message)
                .font(.callout)
                .foregroundStyle(.secondary)

            if banner.kind == .upgradeHint {
                HStack(spacing: 12) {
                    Button {
                        event(.voiceQualityBannerOpenSettings)
                    } label: {
                        Text("Open Settings")
                    }
                    .buttonStyle(.borderedProminent)

                    Button {
                        event(.voiceQualityBannerDismissed)
                    } label: {
                        Text("Not now")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(accentColor.opacity(0.2))
        )
        .accessibilityIdentifier("voiceQualityBanner")
        .task(id: banner.id) {
            guard banner.kind == .installedAcknowledgement else {
                return
            }

            do {
                try await Task.sleep(for: .seconds(5))
            } catch {
                return
            }

            event(.voiceQualityBannerDismissed)
        }
    }

    private var playbackProgressRibbon: some View {
        ProgressView(value: state.progress)
            .progressViewStyle(.linear)
            .padding(.horizontal, 16)
            .padding(.bottom, 4)
            .accessibilityLabel("Listening progress")
            .accessibilityIdentifier("playbackProgress")
    }

    #if os(iOS)
    // Native bottom-bar toolbar: on iOS 26 the system renders it as Liquid Glass
    // floating over the reader text (no edge inset). Voice selection stays on
    // the leading edge, transport stays centered, and the frequent playback
    // actions stay on the trailing edge.
    @ToolbarContentBuilder
    private var readerBottomBar: some ToolbarContent {
        ToolbarItem(placement: .bottomBar) {
            ReaderVoiceMenu(state: state.voiceMenuState, event: event)
                .equatable()
        }

        ToolbarSpacer(.flexible, placement: .bottomBar)

        ToolbarItemGroup(placement: .bottomBar) {
            Button {
                event(.previousSentenceTapped)
            } label: {
                Image(systemName: "backward.fill")
            }
            .accessibilityLabel("Previous sentence")
            .accessibilityIdentifier("previousSentenceButton")

            Button {
                event(.primaryTapped)
            } label: {
                Image(systemName: state.playbackState.primaryControlSystemImage)
            }
            .accessibilityLabel(state.playbackState.primaryControlTitle)
            .accessibilityIdentifier("primaryPlaybackButton")

            Button {
                event(.nextSentenceTapped)
            } label: {
                Image(systemName: "forward.fill")
            }
            .accessibilityLabel("Next sentence")
            .accessibilityIdentifier("nextSentenceButton")

            Button {
                event(.stopTapped)
            } label: {
                Image(systemName: "stop.fill")
            }
            .accessibilityLabel("Stop")
            .accessibilityIdentifier("stopButton")
            .disabled(state.playbackState.isStopEnabled == false)
        }

        ToolbarSpacer(.flexible, placement: .bottomBar)

        ToolbarItem(placement: .bottomBar) {
            ReaderPlaybackMenu(state: state.playbackMenuState, event: event)
                .equatable()
        }
    }
    #endif

}

private struct ReaderVoiceMenu: View {
    let state: ReaderVoiceMenuState
    let event: (ReaderViewEvent) -> Void

    var body: some View {
        Menu {
            Button {
                event(.voiceSelected(nil))
            } label: {
                if state.selectedVoiceIdentifier == nil {
                    Label("Auto", systemImage: "checkmark")
                } else {
                    Text("Auto")
                }
            }

            ForEach(state.voiceOptions) { voiceOption in
                Button {
                    event(.voiceSelected(voiceOption.id))
                } label: {
                    if state.selectedVoiceIdentifier == voiceOption.id {
                        Label(voiceOption.menuTitle, systemImage: "checkmark")
                    } else {
                        Text(voiceOption.menuTitle)
                    }
                }
            }
        } label: {
            Image(systemName: "waveform")
        }
        .accessibilityLabel("Voice")
        .accessibilityIdentifier("readerVoiceMenu")
    }
}

private struct ReaderPlaybackMenu: View {
    let state: ReaderPlaybackMenuState
    let event: (ReaderViewEvent) -> Void

    var body: some View {
        Menu {
            Section("Speed") {
                ForEach(SpeechSpeed.allCases) { speed in
                    Button {
                        event(.speedSelected(speed))
                    } label: {
                        if state.selectedSpeed == speed {
                            Label(speed.rawValue, systemImage: "checkmark")
                        } else {
                            Text(speed.rawValue)
                        }
                    }
                }
            }

            Section {
                Button {
                    event(.startOverTapped)
                } label: {
                    Label("Start Over", systemImage: "gobackward")
                }
                .disabled(state.isStartOverEnabled == false)
            }
        } label: {
            Image(systemName: "speedometer")
        }
        .accessibilityLabel("Playback controls")
        .accessibilityIdentifier("readerPlaybackMenu")
    }
}

extension ReaderVoiceMenu: @MainActor Equatable {

    static func == (lhs: ReaderVoiceMenu, rhs: ReaderVoiceMenu) -> Bool {

        lhs.state == rhs.state
    }
}

extension ReaderPlaybackMenu: @MainActor Equatable {

    static func == (lhs: ReaderPlaybackMenu, rhs: ReaderPlaybackMenu) -> Bool {

        lhs.state == rhs.state
    }
}

/// Load-failure presentation: file name and a readable reason.
struct ReaderFailureView: View {
    let fileName: String
    let error: FolioDocumentError

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(fileName)
                .font(.title2)
                .fontWeight(.semibold)
                .lineLimit(2)

            Text(error.message)
                .font(.body)
                .foregroundStyle(.red)

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
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
