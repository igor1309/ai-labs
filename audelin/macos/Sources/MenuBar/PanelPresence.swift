/// Window presence policy, independent of AppKit and recording's types.
public struct PanelPresence: Equatable, Sendable {

    public private(set) var recordingID: UInt64?
    public private(set) var visible = false
    private var generation: UInt64 = 0

    public init() {}

    public var offersReopen: Bool { recordingID != nil && !visible }

    public enum Event: Equatable, Sendable {
        case recordingChanged(UInt64?)
        case userClosed, reopen, appReopen
        case delayElapsed(UInt64)
    }

    public enum Effect: Equatable, Sendable {
        case show(Reason), hide(Reason)
        case hideAfter(seconds: Int, generation: UInt64)
        case cancelDelay
    }

    public enum Reason: String, Equatable, Sendable {
        case recordingBegan, recordingEnded, userClosed, menuReopen, appReopen
    }

    public static func reduce(_ state: Self, _ event: Event) -> (Self, [Effect]) {

        var next = state
        var effects: [Effect] = []
        switch event {
        case let .recordingChanged(id):
            guard id != state.recordingID else { return (state, []) }
            next.recordingID = id
            next.generation += 1
            effects.append(.cancelDelay)
            if id != nil {
                next.visible = true
                if !state.visible { effects.append(.show(.recordingBegan)) }
            } else if state.visible {
                effects.append(.hideAfter(seconds: 3, generation: next.generation))
            }
        case .userClosed:
            next.generation += 1
            next.visible = false
            effects.append(.cancelDelay)
            if state.visible { effects.append(.hide(.userClosed)) }
        case .reopen:
            guard state.offersReopen else { return (state, []) }
            next.visible = true
            effects.append(.show(.menuReopen))
        case .appReopen:
            // Shown again even when visible, so the panel comes forward.
            guard state.recordingID != nil else { return (state, []) }
            next.visible = true
            effects.append(.show(.appReopen))
        case let .delayElapsed(generation):
            guard generation == state.generation, state.recordingID == nil, state.visible else {
                return (state, [])
            }
            next.visible = false
            effects.append(.hide(.recordingEnded))
        }
        return (next, effects)
    }
}
