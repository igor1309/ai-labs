import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import OSLog

/// Thin AVFoundation shell: executes speak commands and emits delegate facts
/// to the single reader coordinator that owns playback state.
@MainActor
final class SpeechSynthesizerAdapter: NSObject {

    private let logger = Logger(subsystem: "foliotell.FolioTell", category: "speech")
    private let synthesizer = AVSpeechSynthesizer()
    private var utteranceTokens: [ObjectIdentifier: Int] = [:]
    var eventHandler: ((SpeechSynthesisEvent) -> Void)?

    override init() {

        super.init()
        synthesizer.delegate = self
    }
}

extension SpeechSynthesizerAdapter: SpeechSynthesisControlling {

    func speak(_ command: SpeakCommand) {
        let utterance = AVSpeechUtterance(string: command.text)
        utterance.rate = command.speed.utteranceRate
        if let voiceIdentifier = command.voiceIdentifier,
           let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
            utterance.voice = voice
        }
        utteranceTokens[ObjectIdentifier(utterance)] = command.utteranceToken
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        let didAcceptStop = synthesizer.stopSpeaking(at: .immediate)
        logger.info("stop requested; stopSpeaking(at: .immediate) accepted: \(didAcceptStop)")
    }

    func pause() -> Bool {

        let didAcceptPause = synthesizer.pauseSpeaking(at: .word)
        logger.info("pause requested; pauseSpeaking(at: .word) accepted: \(didAcceptPause)")
        return didAcceptPause
    }

    func resume() -> Bool {

        synthesizer.continueSpeaking()
    }

    func activateAudioSession() {
        #if os(iOS)
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .spokenAudio)
            try audioSession.setActive(true)
        } catch {
            logger.error("audio session setup failed: \(error)")
        }
        #endif
    }

    func deactivateAudioSession() {
        #if os(iOS)
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            logger.info("audio session deactivated")
        } catch {
            logger.error("audio session deactivation failed: \(error)")
        }
        #endif
    }

}

private extension SpeechVoiceQuality {

    init(_ quality: AVSpeechSynthesisVoiceQuality) {
        switch quality {
        case .premium: self = .premium
        case .enhanced: self = .enhanced
        default: self = .standard
        }
    }
}

extension SpeechSynthesizerAdapter: AVSpeechSynthesizerDelegate {

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in
            guard let self, let utteranceToken = self.utteranceTokens[utteranceID] else {
                return
            }

            self.eventHandler?(.didStart(utteranceToken: utteranceToken))
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard let utteranceToken = utteranceTokens[utteranceID] else {
                return
            }

            eventHandler?(.willSpeakRange(utteranceToken: utteranceToken, utteranceUTF16Offset: characterRange.location))
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard let utteranceToken = utteranceTokens.removeValue(forKey: utteranceID) else {
                return
            }

            logger.info("didFinish received for utterance token \(utteranceToken)")
            eventHandler?(.didFinish(utteranceToken: utteranceToken))
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard let utteranceToken = utteranceTokens.removeValue(forKey: utteranceID) else {
                return
            }

            logger.info("didCancel received for utterance token \(utteranceToken)")
            eventHandler?(.didCancel(utteranceToken: utteranceToken))
        }
    }
}
