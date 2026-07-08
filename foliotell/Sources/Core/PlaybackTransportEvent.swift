public enum PlaybackTransportEvent: Equatable, Sendable {
    case primaryTapped(PlaybackRequest)
    case stopTapped
    case startOverTapped
    case jumpToNextSentenceTapped
    case jumpToPreviousSentenceTapped
    case speedChanged(SpeechSpeed)
    case voiceChanged(String?)
    case pauseResolved(accepted: Bool)
    case resumeResolved(accepted: Bool)
    case willSpeakRange(utteranceToken: Int, utteranceUTF16Offset: Int)
    case utteranceDidFinish(utteranceToken: Int)
    case utteranceDidCancel(utteranceToken: Int)
}
