/// Reads who Zoom shows as talking from its windows' Accessibility tree.
///
/// Zoom 6 exposes the speaking indicator as a static text `Talking: <name>` (floating video
/// window during screen share) and the participant count on the toolbar's participants
/// button. Measured on a real 15-person meeting, 2026-11-10 (LAB-1123).
public struct Node: Equatable, Sendable {
    public var role: String
    public var title: String?
    public var identifier: String?
    public var description: String?
    public var value: String?
    public var children: [Node]
    public init(role: String, title: String? = nil, identifier: String? = nil, description: String? = nil, value: String? = nil, children: [Node] = []) {
        self.role = role; self.title = title; self.identifier = identifier; self.description = description; self.value = value; self.children = children
    }
}

public struct Reading: Equatable, Sendable {
    /// False when no meeting window is visible: nothing can be observed.
    public var inMeeting: Bool
    /// The name Zoom shows as talking, or nil when it shows nobody.
    public var talking: String?
    public var participantCount: Int?
    public init(inMeeting: Bool, talking: String?, participantCount: Int?) {
        self.inMeeting = inMeeting; self.talking = talking; self.participantCount = participantCount
    }
}

public enum ZoomReading {
    static let talkingPrefixes = ["Talking: ", "Говорит: "]

    public static func read(windows: [Node]) -> Reading {
        var reading = Reading(inMeeting: false, talking: nil, participantCount: nil)
        func visit(_ node: Node) {
            // The main window can leave the tree while the floating video window stays (screen share).
            if node.identifier == "zm.meeting.window.main" || node.title == "zoom floating video window" { reading.inMeeting = true }
            if node.role == "AXStaticText", reading.talking == nil, let value = node.value,
               let prefix = talkingPrefixes.first(where: value.hasPrefix) {
                let name = String(value.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
                if !name.isEmpty { reading.talking = name }
            }
            if node.identifier == "participant", let description = node.description { reading.participantCount = count(in: description) }
            node.children.forEach(visit)
        }
        windows.forEach(visit)
        if !reading.inMeeting { reading.talking = nil }
        return reading
    }

    /// "Open participants panel, closed, 15 participants" → 15.
    static func count(in description: String) -> Int? {
        let words = description.split(whereSeparator: { $0 == " " || $0 == "," })
        guard let index = words.lastIndex(where: { $0.hasPrefix("participant") }), index > words.startIndex else { return nil }
        return Int(words[words.index(before: index)])
    }
}

/// What changed between two readings, stamped by the caller in call time.
public enum Change: Equatable, Sendable {
    case started(name: String)
    case stopped(name: String)
    case observed
    case lost
}

public struct Transitions: Sendable {
    private var last: Reading?
    public init() {}

    /// Every poll yields at least `observed` while in a meeting, which serves as the heartbeat.
    public mutating func next(_ reading: Reading) -> [Change] {
        defer { last = reading }
        guard reading.inMeeting else { return last?.inMeeting == true ? stops() + [.lost] : [] }
        var changes: [Change] = []
        if last?.talking != reading.talking {
            if let old = last?.talking { changes.append(.stopped(name: old)) }
            if let new = reading.talking { changes.append(.started(name: new)) }
        }
        return changes + [.observed]
    }

    private func stops() -> [Change] { last?.talking.map { [.stopped(name: $0)] } ?? [] }
}
