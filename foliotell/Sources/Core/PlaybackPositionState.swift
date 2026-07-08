/// Per-document listening position: the persisted sentence anchor and the
/// live document offset, with the cached speech derivation for mapping.
public struct PlaybackPositionState: Equatable, Sendable {

    public let documentText: String
    public private(set) var frontMatterMode: FrontMatterPlaybackMode
    public let documentPath: String?
    public private(set) var derivation: SpeechDerivation
    public internal(set) var storedAnchor: Int?
    public internal(set) var liveDocumentUTF16Offset: Int?

    public init(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        documentPath: String?,
        storedAnchor: Int? = nil,
        liveDocumentUTF16Offset: Int? = nil
    ) {

        self.documentText = documentText
        self.frontMatterMode = frontMatterMode
        self.documentPath = documentPath
        self.derivation = SpeechDerivation(documentText: documentText, frontMatterMode: frontMatterMode)
        self.storedAnchor = storedAnchor
        self.liveDocumentUTF16Offset = liveDocumentUTF16Offset
    }

    /// Rebuilds the cached derivation; the document-space anchor survives.
    mutating func applyFrontMatterMode(_ mode: FrontMatterPlaybackMode) {
        frontMatterMode = mode
        derivation = SpeechDerivation(documentText: documentText, frontMatterMode: mode)
    }
}

public extension PlaybackPositionState {

    /// Speech-text UTF16 offset at which playback resumes the stored anchor.
    var resumeSpokenUTF16Offset: Int {

        guard let storedAnchor else {
            return 0
        }

        return derivation.resumeSpokenUTF16Offset(forDocumentAnchor: storedAnchor)
    }

    /// Listening progress through the raw document, 0...1; live offset wins
    /// over the persisted anchor.
    var progressFraction: Double {

        let documentLength = documentText.utf16.count
        guard let position = liveDocumentUTF16Offset ?? storedAnchor, documentLength > 0 else {
            return 0
        }

        return min(1, Double(position) / Double(documentLength))
    }

    /// Normalized speech text for the current front-matter mode.
    var speechText: String {

        derivation.speechText
    }
}
