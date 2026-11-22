/// Live transcript outcomes, in order across every call in a Recording's lifetime.
/// Text and names are snapshots; resource handles belong to the composition.
public enum RecordingTranscriptOutput<Text: Sendable, Names: Sendable>: Sendable {
    case opened(call: String)
    case wrote(call: String, Text)
    case writeFailed(call: String)
    case closed(call: String, names: Names)
}

extension RecordingTranscriptOutput: Equatable where Text: Equatable, Names: Equatable {}
