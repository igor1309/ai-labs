public enum PlaybackPositionEvent: Equatable, Sendable {
    case spokenOffsetChanged(Int)
    case playbackFinishedNaturally
    case startOverRequested
    case idleJumpRequested(SentenceJumpDirection)
    case frontMatterModeChanged(FrontMatterPlaybackMode)
}
