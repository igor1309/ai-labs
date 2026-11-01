@testable import Composer
import Foundation
import MenuBar
import Preferences
import Recording
import Testing

struct MenuBarMappingTests {
    @Test func presentationMapsEveryRecordingFault() {

        for (faults, expected): (Set<RecordingFault>, Set<MenuBarFault>) in [
            ([.microphone], [.microphone]), ([.callAudio], [.callAudio]), ([.diskFull], [.diskFull]),
            (Set(RecordingFault.allCases), [.microphone, .callAudio, .diskFull]),
        ] {
            for phase: RecordingState.Phase in [.beginning, .recording, .ending, .idle] {
                for origin: RecordingState.Origin in [.hand, .call] {
                    var state = RecordingState(automatic: true, missing: [])
                    state.phase = phase
                    state.session = .init(id: 1, origin: origin)
                    state.faults = faults
                    let input: MenuBarRecording = switch phase {
                    case .idle: .idle(automatic: true, unavailable: [], failure: nil)
                    case .beginning, .recording: .recording(call: origin == .call, faults: expected)
                    case .ending: .ending(faults: expected)
                    }
                    #expect(menuBarRecording(state) == input)
                }
            }
        }
    }


    @Test func presentationMapsTheCurrentCallSilenceWarning() {

        for phase: RecordingState.Phase in [.beginning, .recording, .ending, .idle] {
            for callSilent in [false, true] {
                var state = RecordingState(missing: [])
                state.phase = phase
                state.callSilent = callSilent
                state.faults = [.microphone]
                let faults: Set<MenuBarFault> = callSilent ? [.microphone, .callSilent] : [.microphone]
                let expected: MenuBarRecording = switch phase {
                case .idle: .idle(automatic: false, unavailable: [], failure: nil)
                case .beginning, .recording: .recording(call: false, faults: faults)
                case .ending: .ending(faults: faults)
                }
                #expect(menuBarRecording(state) == expected)
            }
        }
    }

    @Test func presentationInputsTranslateRecordingAndPreferences() async {

        for automatic in [false, true] {
            var variants: [(RecordingState, MenuBarRecording)] = []
            for (missing, blockers): (Set<RecordingCondition>, Set<MenuBarBlocker>) in [
                ([], []), ([.microphoneAccess], [.microphone]), ([.callAudioAccess], [.callAudio]),
                ([.callsFolder], [.folder]), ([.room], [.space]),
                (Set(RecordingCondition.allCases), Set(MenuBarBlocker.allCases)),
            ] {
                for failure: String? in [nil, "Ошибка записи"] {
                    var state = RecordingState(automatic: automatic, missing: missing)
                    state.cannotRecord = failure
                    variants.append((state, .idle(automatic: automatic, unavailable: blockers, failure: failure)))
                }
            }
            for origin: RecordingState.Origin? in [nil, .call, .hand] {
                for phase: RecordingState.Phase in [.beginning, .recording, .ending] {
                    var state = RecordingState()
                    state.phase = phase
                    state.session = origin.map { .init(id: 42, origin: $0) }
                    state.callOn = origin != .call
                    variants.append((state, phase == .ending ? .ending(faults: []) : .recording(call: origin == .call, faults: [])))
                }
            }
            for liveText in [false, true] {
                let stored = Preferences(automaticRecording: automatic, liveText: liveText,
                                         callsFolder: URL(fileURLWithPath: "/calls"))
                #expect(menuBarPreferences(stored) == MenuBarPreferences(automatic: automatic, liveText: liveText))
                for (state, input) in variants {
                    #expect(menuBarRecording(state) == input)
                    let menu = MenuBarModel(recording: input,
                        preferences: MenuBarPreferences(automatic: automatic, liveText: liveText))
                    #expect(menu.item.isRed == (state.phase == .beginning || state.phase == .recording))
                }
            }
        }
    }
}
