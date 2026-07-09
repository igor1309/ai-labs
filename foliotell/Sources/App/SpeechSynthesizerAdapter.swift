import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import OSLog

/// Thin AVFoundation shell: executes speak commands, maps delegate callbacks
/// back to transport events carrying the utterance token they belong to.
@MainActor
final class SpeechSynthesizerAdapter: NSObject {

    private let logger = Logger(subsystem: "foliotell.FolioTell", category: "speech")
    private let synthesizer = AVSpeechSynthesizer()
    private let dispatch: (PlaybackTransportEvent) -> Void
    private var utteranceTokens: [ObjectIdentifier: Int] = [:]

    init(dispatch: @escaping (PlaybackTransportEvent) -> Void) {

        self.dispatch = dispatch
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
        } else if let languageCode = command.languageCode {
            utterance.voice = automaticVoice(matching: languageCode)
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

    /// Voices with empty audioFileSettings can instantiate yet produce no
    /// audio on device, so the catalog lookup prefers voices with populated
    /// settings.
    private func automaticVoice(matching languageCode: String) -> AVSpeechSynthesisVoice? {

        let availableVoices = AVSpeechSynthesisVoice.speechVoices().map {
            SpeechVoiceDescriptor(
                identifier: $0.identifier,
                language: $0.language,
                isAudioCapable: $0.audioFileSettings.isEmpty == false,
                quality: SpeechVoiceQuality($0.quality)
            )
        }
        guard let identifier = SpeechVoiceSelection.automaticVoiceIdentifier(
            matching: languageCode,
            availableVoices: availableVoices
        ) else {
            logger.error("no voice matches \(languageCode); catalog has \(availableVoices.count) voices; falling back to default voice")
            return nil
        }

        logger.info("resolved \(languageCode) to voice \(identifier) from \(availableVoices.count) catalog voices")
        return AVSpeechSynthesisVoice(identifier: identifier)
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

            dispatch(.willSpeakRange(utteranceToken: utteranceToken, utteranceUTF16Offset: characterRange.location))
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard let utteranceToken = utteranceTokens.removeValue(forKey: utteranceID) else {
                return
            }

            logger.info("didFinish received for utterance token \(utteranceToken)")
            dispatch(.utteranceDidFinish(utteranceToken: utteranceToken))
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard let utteranceToken = utteranceTokens.removeValue(forKey: utteranceID) else {
                return
            }

            logger.info("didCancel received for utterance token \(utteranceToken)")
            dispatch(.utteranceDidCancel(utteranceToken: utteranceToken))
        }
    }
}
