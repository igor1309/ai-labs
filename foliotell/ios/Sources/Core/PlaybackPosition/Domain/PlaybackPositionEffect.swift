public enum PlaybackPositionEffect: Equatable, Sendable {
    case persistAnchor(documentPath: String, anchor: Int)
    case clearAnchor(documentPath: String)
}
