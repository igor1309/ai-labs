import FolioTellCore
import SwiftUI

struct ReaderView: View {
    let loadedDocument: LoadedFolioDocument
    let fileName: String

    @AppStorage("selectedSpeechSpeed") private var selectedSpeechSpeed = SpeechSpeed.one.rawValue
    @AppStorage("selectedFrontMatterPlaybackMode") private var selectedFrontMatterPlaybackMode = FrontMatterPlaybackMode.skip.rawValue
    @StateObject private var speechController = SpeechController()

    var body: some View {
        content
            .padding()
            .navigationTitle(displayFileName)
            .safeAreaInset(edge: .bottom) {
                bottomControls
            }
            .onDisappear {
                speechController.stop()
            }
            .onChange(of: selectedSpeed) { _, newSpeed in
                speechController.updateSpeed(newSpeed)
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

    @ViewBuilder
    private var bottomControls: some View {
        switch loadedDocument {
        case .failure:
            EmptyView()
        case let .success(document):
            HStack(spacing: 10) {
                settingsMenu

                Spacer(minLength: 8)

                playbackButtons(for: document)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.bar)
        }
    }

    @ViewBuilder
    private var settingsMenu: some View {
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
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "slider.horizontal.3")
                    .foregroundStyle(.secondary)

                Text("\(selectedSpeed.rawValue) · \(selectedFrontMatterMode.title)")
                    .foregroundStyle(.primary)
            }
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
                .frame(minHeight: 44)
        }
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

    @ViewBuilder
    private func playbackButtons(for document: FolioDocument) -> some View {
        let controlSize: CGFloat = 44
        let cornerRadius: CGFloat = 9

        Group {
            HStack(spacing: 8) {
                Button {
                    speechController.togglePrimaryControl(selectedFrontMatterMode.speechText(from: document.text), speed: selectedSpeed)
                } label: {
                    Image(systemName: speechController.primaryControlSystemImage)
                        .font(.title3.weight(.semibold))
                        .frame(width: controlSize, height: controlSize)
                        .foregroundStyle(.white)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                }
                .accessibilityLabel(speechController.primaryControlTitle)
                .accessibilityIdentifier("primaryPlaybackButton")
                .buttonStyle(.plain)

                Button {
                    speechController.stop()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.body.weight(.semibold))
                        .frame(width: controlSize, height: controlSize)
                        .foregroundStyle(stopForegroundStyle)
                        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
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
