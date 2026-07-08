import AVFoundation
#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import OSLog
import SwiftUI

@MainActor
final class SpeechController: NSObject, ObservableObject {
    @Published private(set) var playbackState: PlaybackState = .idle

    /// Absolute UTF16 offset into the current speech text, reported as the
    /// synthesizer progresses.
    var onSpokenPositionChange: ((Int) -> Void)?
    /// Fired when speech reaches the end of the document (not on stop or
    /// utterance replacement).
    var onPlaybackDidFinishNaturally: (() -> Void)?

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

    func togglePrimaryControl(
        _ text: String,
        speed: SpeechSpeed,
        voiceIdentifier: String?,
        startingAtUTF16Offset: Int = 0
    ) {
        switch playbackState {
        case .idle:
            play(text, speed: speed, voiceIdentifier: voiceIdentifier, startingAtUTF16Offset: startingAtUTF16Offset)
        case .paused, .speaking:
            pauseOrResume()
        }
    }

    func play(_ text: String, speed: SpeechSpeed, voiceIdentifier: String?, startingAtUTF16Offset: Int = 0) {
        startSpeaking(
            fullText: text,
            speed: speed,
            voiceIdentifier: voiceIdentifier,
            startingAtUTF16Offset: startingAtUTF16Offset
        )
    }

    private func startSpeaking(
        fullText: String,
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

        let utteranceText = playback.remainingTextFromCurrentSpeechBoundary
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

    func jumpToPreviousSentence() {
        jump(toSpokenUTF16Offset: PlaybackPositionMapping.previousSentenceStartUTF16Offset(
            in: playback.currentText,
            from: playback.currentSpokenUTF16Offset
        ))
    }

    func jumpToNextSentence() {
        guard let target = PlaybackPositionMapping.nextSentenceStartUTF16Offset(
            in: playback.currentText,
            from: playback.currentSpokenUTF16Offset
        ) else {
            return
        }

        jump(toSpokenUTF16Offset: target)
    }

    private func jump(toSpokenUTF16Offset target: Int) {
        switch playbackState {
        case .idle:
            break
        case .speaking:
            startSpeaking(
                fullText: playback.currentText,
                speed: playback.currentSpeed,
                voiceIdentifier: currentVoiceIdentifier,
                startingAtUTF16Offset: target
            )
        case .paused:
            // Discard the paused utterance silently; resume restarts from the
            // repositioned offset via the continueSpeaking() fallback.
            if let currentUtteranceID {
                ignoredUtteranceIDs.insert(currentUtteranceID)
            }
            currentUtteranceID = nil
            synthesizer.stopSpeaking(at: .immediate)
            playback.reposition(toUTF16Offset: target)
            onSpokenPositionChange?(playback.currentSpokenUTF16Offset)
        }
    }

    func pauseOrResume() {
        switch playbackState {
        case .idle:
            break
        case .paused:
            if synthesizer.continueSpeaking() {
                playback.resumeSucceeded()
                publishPlaybackState()
            } else {
                startSpeaking(
                    fullText: playback.currentText,
                    speed: playback.currentSpeed,
                    voiceIdentifier: currentVoiceIdentifier,
                    startingAtUTF16Offset: playback.currentSpokenUTF16Offset
                )
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
            onSpokenPositionChange?(playback.currentSpokenUTF16Offset)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard didReceiveCurrentUtteranceCallback(utteranceID) else {
                return
            }

            logger.info("didFinish received for current utterance")
            // Stop also delivers didFinish, but stopRequested() has already
            // moved playback to .idle by then — only a still-active state
            // means speech ran off the end of the document.
            let didFinishNaturally = playback.playbackState != .idle
            playback.speechFinished()
            publishPlaybackState()
            deactivateAudioSession()
            if didFinishNaturally {
                onPlaybackDidFinishNaturally?()
            }
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
