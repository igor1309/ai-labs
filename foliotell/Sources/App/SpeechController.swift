import AVFoundation
import FolioTellCore
import SwiftUI

@MainActor
final class SpeechController: NSObject, ObservableObject {
    @Published private(set) var playbackState: PlaybackState = .idle

    private let synthesizer = AVSpeechSynthesizer()
    private var playback = PlaybackStateMachine()
    private var currentUtteranceID: ObjectIdentifier?
    private var ignoredUtteranceIDs: Set<ObjectIdentifier> = []

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

    func togglePrimaryControl(_ text: String, speed: SpeechSpeed) {
        switch playbackState {
        case .idle:
            play(text, speed: speed)
        case .paused, .speaking:
            pauseOrResume()
        }
    }

    func play(_ text: String, speed: SpeechSpeed) {
        startSpeaking(fullText: text, utteranceText: text, speed: speed, startingAtUTF16Offset: 0)
    }

    private func startSpeaking(
        fullText: String,
        utteranceText: String,
        speed: SpeechSpeed,
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
        publishPlaybackState()
        if isReplacingUtterance {
            synthesizer.stopSpeaking(at: .immediate)
        }

        let utterance = AVSpeechUtterance(string: utteranceText)
        currentUtteranceID = ObjectIdentifier(utterance)
        utterance.rate = speed.utteranceRate
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
            if synthesizer.pauseSpeaking(at: .word) {
                playback.pauseSucceeded()
                publishPlaybackState()
            }
        }
    }

    func stop() {
        ignoredUtteranceIDs.removeAll()
        playback.stopRequested()
        publishPlaybackState()
        synthesizer.stopSpeaking(at: .immediate)
    }

    func updateSpeed(_ speed: SpeechSpeed) {
        if playback.applySpeed(speed) {
            startSpeaking(
                fullText: playback.currentText,
                utteranceText: playback.remainingTextFromCurrentSpeechBoundary,
                speed: speed,
                startingAtUTF16Offset: playback.currentSpokenUTF16Offset
            )
        }
    }

    private func publishPlaybackState() {
        playbackState = playback.playbackState
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
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let utteranceID = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard didReceiveCurrentUtteranceCallback(utteranceID) else {
                return
            }

            playback.speechCancelled()
            publishPlaybackState()
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
