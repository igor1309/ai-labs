import AVFoundation
import FolioTellCore
import SwiftUI

@MainActor
final class SpeechController: NSObject, ObservableObject {
    @Published private(set) var playbackState: PlaybackState = .idle

    private let synthesizer = AVSpeechSynthesizer()
    private var playback = PlaybackStateMachine()

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
        let isReplacingUtterance = synthesizer.isSpeaking || synthesizer.isPaused || playbackState != .idle
        playback.startSpeaking(text: text, speed: speed, isReplacingUtterance: isReplacingUtterance)
        publishPlaybackState()
        if isReplacingUtterance {
            synthesizer.stopSpeaking(at: .immediate)
        }

        let utterance = AVSpeechUtterance(string: text)
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
        playback.stopRequested()
        publishPlaybackState()
        synthesizer.stopSpeaking(at: .immediate)
    }

    func updateSpeed(_ speed: SpeechSpeed) {
        if playback.applySpeed(speed) {
            play(playback.currentText, speed: speed)
        }
    }

    private func publishPlaybackState() {
        playbackState = playback.playbackState
    }
}

extension SpeechController: AVSpeechSynthesizerDelegate {

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            playback.speechFinished()
            publishPlaybackState()
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            playback.speechCancelled()
            publishPlaybackState()
        }
    }
}
