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
    let voiceOptions: [ReaderVoiceOption]
}

struct ReaderVoiceOption: Equatable, Identifiable {
    let id: String
    let menuTitle: String
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
            Text(state.title)
                .font(.title2)
                .fontWeight(.semibold)
                .lineLimit(2)

            documentText

            Spacer()
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
    // floating over the reader text (no edge inset). The playback transport lives
    // in one glass capsule centered between flexible spacers; the settings menu
    // is promoted into its own separate glass capsule, the way Search is set
    // apart in Apple Music.
    @ToolbarContentBuilder
    private var readerBottomBar: some ToolbarContent {
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
            settingsMenu
        }
    }
    #endif

    private var settingsMenu: some View {
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

            Section("Front matter") {
                ForEach(FrontMatterPlaybackMode.allCases) { mode in
                    Button {
                        event(.frontMatterModeSelected(mode))
                    } label: {
                        if state.selectedFrontMatterMode == mode {
                            Label(mode.title, systemImage: "checkmark")
                        } else {
                            Text(mode.title)
                        }
                    }
                }
            }

            Section("Voice") {
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
            Image(systemName: "slider.horizontal.3")
        }
        .accessibilityLabel("Playback settings")
        .accessibilityIdentifier("readerSettingsMenu")
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
