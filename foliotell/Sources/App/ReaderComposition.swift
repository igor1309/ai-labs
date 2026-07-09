import Combine
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI

/// Synthesizer control surface the transport effect handler is wired to.
/// Owned by the composition root (its client); the AVFoundation adapter and
/// test spies conform.
@MainActor
protocol SpeechSynthesisControlling: AnyObject {
    func speak(_ command: SpeakCommand)
    func stopSpeaking()
    func pause() -> Bool
    func resume() -> Bool
    func activateAudioSession()
    func deactivateAudioSession()
}

/// Per-document playback machinery: the two composed state machines, the
/// synthesizer control surface keeping the adapter alive, and the binder
/// forwarding transport position facts to the position machine.
@MainActor
final class ReaderSession: ObservableObject {

    typealias TransportModel = RxViewModel<PlaybackTransportState, PlaybackTransportEvent, PlaybackTransportEffect>
    typealias PositionModel = RxViewModel<PlaybackPositionState, PlaybackPositionEvent, PlaybackPositionEffect>

    let transport: TransportModel
    let position: PositionModel

    private let synthesis: SpeechSynthesisControlling
    private var cancellables = Set<AnyCancellable>()

    init(transport: TransportModel, position: PositionModel, synthesis: SpeechSynthesisControlling) {

        self.transport = transport
        self.position = position
        self.synthesis = synthesis

        transport.$state
            .map(\.spokenUTF16Offset)
            .removeDuplicates()
            .compactMap { $0 }
            .sink { [weak position] in position?.event(.spokenOffsetChanged($0)) }
            .store(in: &cancellables)
    }
}

/// Composition root for the reader: constructs both machines, their effect
/// handlers, and the collaborator wiring.
@MainActor
enum ReaderComposition {

    static func makeReaderSession(
        document: FolioDocument,
        documentPath: String?,
        frontMatterMode: FrontMatterPlaybackMode,
        positionStore: PlaybackPositionStore,
        makeSynthesis: (@escaping (PlaybackTransportEvent) -> Void) -> SpeechSynthesisControlling,
        scheduler: EventScheduler
    ) -> ReaderSession {

        let positionReducer = PlaybackPositionReducer()
        let positionEffectHandler = PlaybackPositionEffectHandler(
            persistAnchor: { positionStore.setAnchor($1, forDocumentPath: $0) },
            clearAnchor: { positionStore.clearAnchor(forDocumentPath: $0) }
        )
        let position = PositionModel(
            initialState: PlaybackPositionState(
                documentText: document.text,
                frontMatterMode: frontMatterMode,
                documentPath: documentPath,
                storedAnchor: documentPath.flatMap { positionStore.anchor(forDocumentPath: $0) }
            ),
            reduce: positionReducer.reduce,
            handleEffect: positionEffectHandler.handleEffect,
            scheduler: scheduler
        )

        var transport: TransportModel!
        let synthesis = makeSynthesis { transport.event($0) }
        let transportReducer = PlaybackTransportReducer()
        let transportEffectHandler = PlaybackTransportEffectHandler(
            speak: { synthesis.speak($0) },
            stopSpeaking: { synthesis.stopSpeaking() },
            pause: { synthesis.pause() },
            resume: { synthesis.resume() },
            activateAudioSession: { synthesis.activateAudioSession() },
            deactivateAudioSession: { synthesis.deactivateAudioSession() },
            notifyFinishedNaturally: { [weak position] in position?.event(.playbackFinishedNaturally) },
            notifyStartOver: { [weak position] in position?.event(.startOverRequested) },
            notifyIdleJump: { [weak position] in position?.event(.idleJumpRequested($0)) }
        )
        transport = TransportModel(
            initialState: .idle(lastUtteranceToken: 0),
            reduce: transportReducer.reduce,
            handleEffect: transportEffectHandler.handleEffect,
            scheduler: scheduler
        )

        return ReaderSession(transport: transport, position: position, synthesis: synthesis)
    }

    private typealias TransportModel = ReaderSession.TransportModel
    private typealias PositionModel = ReaderSession.PositionModel
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
                    makeSynthesis: { SpeechSynthesizerAdapter(dispatch: $0) },
                    scheduler: .mainQueue
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
