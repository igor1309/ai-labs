import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import OSLog
import SwiftUI

@MainActor
final class SpeechController: NSObject, ObservableObject {
    @Published private(set) var playbackState: PlaybackState = .idle

    private let logger = Logger(subsystem: "foliotell.FolioTell", category: "speech")
    private let synthesizer = AVSpeechSynthesizer()
    private var playback = PlaybackStateMachine()
    private var currentUtteranceID: ObjectIdentifier?
    private var ignoredUtteranceIDs: Set<ObjectIdentifier> = []
    private var currentVoiceIdentifier: String?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    var primaryControlTitle: String {
        playbackState.primaryControlTitle
    }

    var primaryControlSystemImage: String {
        playbackState.primaryControlSystemImage
    }

    func togglePrimaryControl(_ text: String, speed: SpeechSpeed, voiceIdentifier: String?) {
        switch playbackState {
        case .idle:
            play(text, speed: speed, voiceIdentifier: voiceIdentifier)
        case .paused, .speaking:
            pauseOrResume()
        }
    }

    func play(_ text: String, speed: SpeechSpeed, voiceIdentifier: String?) {
        startSpeaking(
            fullText: text,
            utteranceText: text,
            speed: speed,
            voiceIdentifier: voiceIdentifier,
            startingAtUTF16Offset: 0
        )
    }

    private func startSpeaking(
        fullText: String,
        utteranceText: String,
        speed: SpeechSpeed,
        voiceIdentifier: String?,
        startingAtUTF16Offset: Int
    ) {
        let isReplacingUtterance = synthesizer.isSpeaking || synthesizer.isPaused || playbackState != .idle
        if isReplacingUtterance, let currentUtteranceID {
            ignoredUtteranceIDs.insert(currentUtteranceID)
        }
        playback.startSpeaking(
            text: fullText,
            speed: speed,
            isReplacingUtterance: isReplacingUtterance,
            startingAtUTF16Offset: startingAtUTF16Offset
        )
        currentVoiceIdentifier = voiceIdentifier
        publishPlaybackState()
        if isReplacingUtterance {
            synthesizer.stopSpeaking(at: .immediate)
        }

        configureAudioSessionForPlayback()

        let utterance = AVSpeechUtterance(string: utteranceText)
        currentUtteranceID = ObjectIdentifier(utterance)
        utterance.rate = speed.utteranceRate
        if let voiceIdentifier, let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
            utterance.voice = voice
        } else if let languageCode = SpeechVoiceLanguage.languageCode(for: utteranceText) {
            utterance.voice = automaticVoice(matching: languageCode)
        }
        synthesizer.speak(utterance)
    }

    func pauseOrResume() {
        switch playbackState {
        case .idle:
            break
        case .paused:
            if synthesizer.continueSpeaking() {
                playback.resumeSucceeded()
                publishPlaybackState()
            }
        case .speaking:
            let didAcceptPause = synthesizer.pauseSpeaking(at: .word)
            logger.info("pause requested; pauseSpeaking(at: .word) accepted: \(didAcceptPause)")
            if didAcceptPause {
                playback.pauseSucceeded()
                publishPlaybackState()
            }
        }
    }

    func stop() {
        ignoredUtteranceIDs.removeAll()
        playback.stopRequested()
        currentVoiceIdentifier = nil
        publishPlaybackState()
        let didAcceptStop = synthesizer.stopSpeaking(at: .immediate)
        logger.info("stop requested; stopSpeaking(at: .immediate) accepted: \(didAcceptStop)")
        deactivateAudioSession()
    }

    func updateSpeed(_ speed: SpeechSpeed) {
        if playback.applySpeed(speed) {
            startSpeaking(
                fullText: playback.currentText,
                utteranceText: playback.remainingTextFromCurrentSpeechBoundary,
                speed: speed,
                voiceIdentifier: currentVoiceIdentifier,
                startingAtUTF16Offset: playback.currentSpokenUTF16Offset
            )
        }
    }

    func updateVoiceIdentifier(_ voiceIdentifier: String?) {
        guard currentVoiceIdentifier != voiceIdentifier else {
            return
        }

        currentVoiceIdentifier = voiceIdentifier
        guard playback.playbackState != .idle else {
            return
        }

        startSpeaking(
            fullText: playback.currentText,
            utteranceText: playback.remainingTextFromCurrentSpeechBoundary,
            speed: playback.currentSpeed,
            voiceIdentifier: voiceIdentifier,
            startingAtUTF16Offset: playback.currentSpokenUTF16Offset
        )
    }

    private func publishPlaybackState() {
        playbackState = playback.playbackState
    }

    private func automaticVoice(matching languageCode: String) -> AVSpeechSynthesisVoice? {
        // Voices with empty audioFileSettings can instantiate yet produce no audio
        // on device, so the catalog lookup prefers voices with populated settings.
        let availableVoices = AVSpeechSynthesisVoice.speechVoices().map {
            SpeechVoiceDescriptor(
                identifier: $0.identifier,
                language: $0.language,
                isAudioCapable: $0.audioFileSettings.isEmpty == false
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

    private func configureAudioSessionForPlayback() {
        #if os(iOS)
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .spokenAudio)
            try audioSession.setActive(true)
        } catch {
            print("FolioTell audio session setup failed: \(error)")
        }
        #endif
    }

    private func deactivateAudioSession() {
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

extension SpeechController: AVSpeechSynthesizerDelegate {

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            playback.willSpeakRange(startingAtUTF16Offset: characterRange.location)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard didReceiveCurrentUtteranceCallback(utteranceID) else {
                return
            }

            playback.speechFinished()
            publishPlaybackState()
            deactivateAudioSession()
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard didReceiveCurrentUtteranceCallback(utteranceID) else {
                return
            }

            logger.info("didCancel received for current utterance")
            playback.speechCancelled()
            publishPlaybackState()
            deactivateAudioSession()
        }
    }

    private func didReceiveCurrentUtteranceCallback(_ utteranceID: ObjectIdentifier) -> Bool {
        if ignoredUtteranceIDs.remove(utteranceID) != nil {
            return false
        }

        guard currentUtteranceID == utteranceID else {
            return false
        }

        currentUtteranceID = nil
        return true
    }
}
