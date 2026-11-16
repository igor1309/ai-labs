import Foundation
/// Reads who Zoom shows as talking from its windows' Accessibility tree.
///
/// Zoom shows a static text `Talking: <name>` only in Speaker view (and its floating video
/// window during screen share). Gallery view marks no speaker at any call size; every view
/// shows one tile per participant, an `AXTabGroup` described as `<name>, <audio>, <video>`.
/// The Workplace window's account button, `Zoom, <name>, <status>, <plan> account`, names
/// the user when that window is open.
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
    /// One participant tile in the meeting window.
    public struct Tile: Equatable, Sendable {
        public var name: String
        public var unmuted: Bool
        public init(name: String, unmuted: Bool) { self.name = name; self.unmuted = unmuted }
    }
    /// False when no meeting window is visible: nothing can be observed.
    public var inMeeting: Bool
    /// The name Zoom's Talking label shows, or nil when it shows nobody.
    public var talking: String?
    public var participantCount: Int?
    /// Each participant tile, once per name, in the order Zoom shows them.
    public var tiles: [Tile]
    /// The user's own name, when Zoom shows it.
    public var ownName: String?
    public init(inMeeting: Bool, talking: String?, participantCount: Int?, tiles: [Tile] = [], ownName: String? = nil) {
        self.inMeeting = inMeeting; self.talking = talking; self.participantCount = participantCount
        self.tiles = tiles; self.ownName = ownName
    }
}

public enum ZoomReading {
    static let talkingPrefixes = ["Talking: ", "Говорит: "]

    public static func read(windows: [Node]) -> Reading {
        var reading = Reading(inMeeting: false, talking: nil, participantCount: nil)
        func visit(_ node: Node, meeting: Bool) {
            // The main window can leave the tree while the floating video window stays (screen share).
            let meeting = meeting || node.identifier == "zm.meeting.window.main" || node.title == "zoom floating video window"
            if meeting { reading.inMeeting = true }
            if meeting, node.role == "AXTabGroup", let tile = node.description.flatMap(tile),
               !reading.tiles.contains(where: { $0.name == tile.name }) {
                reading.tiles.append(tile)
            }
            if node.role == "AXButton", reading.ownName == nil, let description = node.description {
                reading.ownName = ownName(in: description)
            }
            if node.role == "AXStaticText", reading.talking == nil, let value = node.value,
               let prefix = talkingPrefixes.first(where: value.hasPrefix) {
                let name = String(value.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
                if !name.isEmpty { reading.talking = name }
            }
            if node.identifier == "participant", let description = node.description { reading.participantCount = count(in: description) }
            node.children.forEach { visit($0, meeting: meeting) }
        }
        windows.forEach { visit($0, meeting: false) }
        if !reading.inMeeting { reading.talking = nil }
        return reading
    }

    /// The far-side participant a reading shows as speaking: the Talking label; else the only
    /// tile other than the user's; else the only other unmuted tile; else nobody. The user's
    /// tile is found by the name Zoom shows, else by `known`; without either only the label names.
    /// Zoom's stand-in for a participant without a name, such as `Zoom user`, names nobody.
    public static func speaker(in reading: Reading, known: String?) -> String? {
        anyone(in: reading, known: known).flatMap { isPlaceholder($0) ? nil : $0 }
    }

    /// Zoom's name for a participant who set none, in the languages Zoom ships.
    static let placeholders: Set<String> = [
        "zoom user", "пользователь zoom", "zoom-benutzer", "utilisateur zoom", "usuario de zoom",
        "utente zoom", "usuário do zoom", "zoom ユーザー", "zoom 用户", "zoom 사용자", "zoom kullanıcısı", "користувач zoom",
    ]

    static func isPlaceholder(_ name: String) -> Bool {
        placeholders.contains(name.trimmingCharacters(in: .whitespaces).lowercased())
    }

    private static func anyone(in reading: Reading, known: String?) -> String? {
        guard reading.inMeeting else { return nil }
        let own = reading.ownName ?? known
        if let talking = reading.talking { return talking == own ? nil : talking }
        guard let own, reading.tiles.contains(where: { $0.name == own }) else { return nil }
        let others = reading.tiles.filter { $0.name != own }
        if others.count == 1 { return others[0].name }
        let unmuted = others.filter(\.unmuted)
        return unmuted.count == 1 ? unmuted[0].name : nil
    }

    static let audioStates = ["Computer audio muted": false, "Computer audio unmuted": true, "No audio connected": false]

    /// "Анна Петрова, Computer audio unmuted, Video off" → Анна Петрова, unmuted.
    static func tile(in description: String) -> Reading.Tile? {
        let parts = description.components(separatedBy: ", ")
        guard let index = parts.firstIndex(where: { audioStates[$0] != nil }), index > 0 else { return nil }
        let name = parts[..<index].joined(separator: ", ").trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? nil : .init(name: name, unmuted: audioStates[parts[index]]!)
    }

    /// "Zoom, Igor Malyarov, In a Zoom Meeting, Basic account" → Igor Malyarov.
    static func ownName(in description: String) -> String? {
        let parts = description.components(separatedBy: ", ")
        guard parts.count >= 4, parts[0] == "Zoom", parts[parts.count - 1].hasSuffix(" account") else { return nil }
        let name = parts[1].trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? nil : name
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
    private var inMeeting = false
    private var speaker: String?
    public init() {}

    /// Every poll yields at least `observed` while in a meeting, which serves as the heartbeat.
    /// `known` is the user's remembered name, used when the reading does not show it.
    public mutating func next(_ reading: Reading, known: String? = nil) -> [Change] {
        let wasInMeeting = inMeeting, old = speaker
        inMeeting = reading.inMeeting
        speaker = ZoomReading.speaker(in: reading, known: known)
        guard reading.inMeeting else { return wasInMeeting ? (old.map { [.stopped(name: $0)] } ?? []) + [.lost] : [] }
        var changes: [Change] = []
        if old != speaker {
            if let old { changes.append(.stopped(name: old)) }
            if let speaker { changes.append(.started(name: speaker)) }
        }
        return changes + [.observed]
    }
}
