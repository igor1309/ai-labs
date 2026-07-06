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
                readerControls(for: document)
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

    private var shouldReadFrontMatter: Bool {
        get { selectedFrontMatterMode == .read }
        nonmutating set { selectedFrontMatterMode = newValue ? .read : .skip }
    }

    @ViewBuilder
    private func readerControls(for document: FolioDocument) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("Speed", selection: Binding(get: { selectedSpeed }, set: { selectedSpeed = $0 })) {
                ForEach(SpeechSpeed.allCases) { speed in
                    Text(speed.rawValue).tag(speed)
                }
            }
            .pickerStyle(.segmented)

            HStack(alignment: .center, spacing: 12) {
                Toggle("Front matter", isOn: Binding(get: { shouldReadFrontMatter }, set: { shouldReadFrontMatter = $0 }))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .tint(.blue)
                    .fixedSize(horizontal: true, vertical: false)

                Spacer(minLength: 8)

                playbackButtons(for: document)
            }
            .padding(.top, 2)

            ScrollView {
                Text(document.text)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
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
