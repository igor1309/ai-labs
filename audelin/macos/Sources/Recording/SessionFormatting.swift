public enum SessionFailureReason: Equatable, Sendable {

    case piece(SessionState.Piece, error: String)
    case missingModels([String])
}

public enum SessionCannotRecordReason: Equatable, Sendable {

    case missingModels([String])
    case folderFailure(String)
    case noTrack
}

/// Production wording for the values rendered from session state.
public enum SessionFormatting {

    public static func failure(_ reason: SessionFailureReason) -> SessionFailure {

        switch reason {
        case let .missingModels(names):
            .init(piece: "model", message: "\(names.joined(separator: ", ")) not on disk")
        case let .piece(piece, error):
            .init(piece: pieceName(piece), message: error)
        }
    }

    public static func cannotRecord(_ reason: SessionCannotRecordReason) -> String {

        switch reason {
        case let .missingModels(names): "model: \(names.joined(separator: ", ")) not on disk"
        case let .folderFailure(error): "folder: \(error)"
        case .noTrack: "no track can record"
        }
    }

    private static func pieceName(_ piece: SessionState.Piece) -> String {

        switch piece {
        case .folder: "folder"
        case .processes: "processes"
        case let .track(side): sideName(side) + " track"
        case .transcript: "transcript"
        case .callText: "call text"
        case let .capture(side): sideName(side) + " capture"
        case let .access(side): sideName(side) + " access"
        }
    }

    private static func sideName(_ side: SessionSide) -> String {

        side == .microphone ? "microphone" : "call"
    }
}
