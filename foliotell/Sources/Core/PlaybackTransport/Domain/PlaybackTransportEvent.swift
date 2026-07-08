public enum PlaybackTransportEvent: Equatable, Sendable {
    case primaryTapped(PlaybackRequest)
    case stopTapped
    case startOverTapped
    case jumpToNextSentenceTapped
    case jumpToPreviousSentenceTapped
    case speedChanged(SpeechSpeed)
    case voiceChanged(String?)
    case pauseResolved(accepted: Bool, utteranceToken: Int)
    case resumeResolved(accepted: Bool, utteranceToken: Int)
    case willSpeakRange(utteranceToken: Int, utteranceUTF16Offset: Int)
    case utteranceDidFinish(utteranceToken: Int)
    case utteranceDidCancel(utteranceToken: Int)
}
