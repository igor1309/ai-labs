import FolioTellCore
import SwiftUI

struct ReaderView: View {
    let loadedDocument: LoadedFolioDocument
    let fileName: String

    @AppStorage("selectedSpeechSpeed") private var selectedSpeechSpeed = SpeechSpeed.one.rawValue
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

    @ViewBuilder
    private func readerControls(for document: FolioDocument) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Picker("Speed", selection: Binding(get: { selectedSpeed }, set: { selectedSpeed = $0 })) {
                ForEach(SpeechSpeed.allCases) { speed in
                    Text(speed.rawValue).tag(speed)
                }
            }
            .pickerStyle(.segmented)

            HStack(spacing: 12) {
                Button {
                    speechController.togglePrimaryControl(document.text, speed: selectedSpeed)
                } label: {
                    Label(speechController.primaryControlTitle, systemImage: speechController.primaryControlSystemImage)
                }
                .accessibilityIdentifier("primaryPlaybackButton")
                .buttonStyle(.borderedProminent)

                Button {
                    speechController.stop()
                } label: {
                    Label("Stop", systemImage: "stop.fill")
                }
                .accessibilityIdentifier("stopButton")
                .disabled(speechController.playbackState.isStopEnabled == false)
                .buttonStyle(.bordered)
            }

            Text(speechController.playbackState.title)
                .font(.caption)
                .foregroundStyle(.secondary)

            ScrollView {
                Text(document.text)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
        }
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

private extension PlaybackState {

    var title: String {
        switch self {
        case .idle:
            "Idle"
        case .paused:
            "Paused"
        case .speaking:
            "Speaking"
        }
    }
}
