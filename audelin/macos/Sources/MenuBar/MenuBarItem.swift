public struct MenuBarItem: Equatable, Sendable {

    public let title: String
    public let symbol: String
    public let stateLine: String
    public let isRed: Bool

    public static func from(_ recording: MenuBarRecording, liveText: Bool, text: (MenuBarPhrase) -> String) -> MenuBarItem {

        switch recording {
        case let .recording(call, faults):
            let line = text(!liveText ? .recordingNoText : (call ? .recordingCall : .recording))
            return MenuBarItem(
                title: text(.itemTitle), symbol: "record.circle.fill", stateLine: line + faultLine(faults, text),
                isRed: true
            )
        case let .ending(faults):
            return MenuBarItem(
                title: text(.itemTitle), symbol: "record.circle.fill",
                stateLine: text(.ending) + faultLine(faults, text), isRed: false
            )
        case let .idle(automatic, unavailable, failure):
            let reasons: [(MenuBarBlocker, MenuBarPhrase)] = [
                (.microphone, .blockedMicrophone),
                (.callAudio, .blockedCallAudio),
                (.folder, .blockedFolder),
                (.space, .blockedSpace),
            ]
            let missing = reasons.filter { unavailable.contains($0.0) }.map { text($0.1) }
            let line = !missing.isEmpty ? missing.joined(separator: "; ") : (
                failure ?? text(automatic ? .waiting : .notRecording)
            )
            return MenuBarItem(title: "Audelin", symbol: "text.alignleft", stateLine: line, isRed: false)
        }
    }

    private static func faultLine(_ faults: Set<MenuBarFault>, _ text: (MenuBarPhrase) -> String) -> String {

        let labels: [(MenuBarFault, MenuBarPhrase)] = [
            (.microphone, .faultMicrophone),
            (.callAudio, .faultCallAudio),
            (.diskFull, .faultDiskFull),
            (.callSilent, .faultCallSilent),
        ]
        return labels.filter { faults.contains($0.0) }.map { "; " + text($0.1) }.joined()
    }
}
