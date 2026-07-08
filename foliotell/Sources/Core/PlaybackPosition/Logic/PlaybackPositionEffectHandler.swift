/// Executes position effects against the injected persistence collaborators.
@MainActor
public final class PlaybackPositionEffectHandler {

    private let persistAnchor: (String, Int) -> Void
    private let clearAnchor: (String) -> Void

    public init(
        persistAnchor: @escaping (String, Int) -> Void,
        clearAnchor: @escaping (String) -> Void
    ) {

        self.persistAnchor = persistAnchor
        self.clearAnchor = clearAnchor
    }

    public func handleEffect(
        _ effect: PlaybackPositionEffect,
        _ dispatch: @escaping @MainActor (PlaybackPositionEvent) -> Void
    ) {

        switch effect {
        case let .persistAnchor(documentPath, anchor):
            persistAnchor(documentPath, anchor)

        case let .clearAnchor(documentPath):
            clearAnchor(documentPath)
        }
    }
}
