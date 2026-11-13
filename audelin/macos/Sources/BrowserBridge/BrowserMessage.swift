import Foundation

/// One observation the browser extension sends about a call: version 1 of the
/// wire format. Times are milliseconds on the browser's clock; participant IDs
/// name one observed tile for the life of the page, never a person or account.
public struct BrowserMessage: Equatable, Sendable {
    public static let version = 1

    public var callID: String
    public var sequence: Int
    public var event: BrowserEvent

    public init(callID: String, sequence: Int, event: BrowserEvent) {
        self.callID = callID; self.sequence = sequence; self.event = event
    }
}

public enum BrowserEvent: Equatable, Sendable {
    case roster(at: Double, participants: [BrowserParticipant])
    case speakingStarted(at: Double, participantID: String)
    case speakingStopped(at: Double, participantID: String)
    case callEnded(at: Double)
}

public struct BrowserParticipant: Equatable, Sendable {
    public var id: String
    public var name: String
    public var isSelf: Bool

    public init(id: String, name: String, isSelf: Bool) { self.id = id; self.name = name; self.isSelf = isSelf }
}

public struct BrowserMessageError: Error, Equatable, CustomStringConvertible {
    public var description: String
}

extension BrowserMessage {
    /// Reads one message, rejecting anything not exactly version 1: an unknown
    /// version, field or event, a missing or mistyped field, a call ID that is
    /// not a 14-digit room, or a roster that names one participant twice.
    public static func decode(_ data: Data) throws(BrowserMessageError) -> BrowserMessage {
        guard let json = try? JSONSerialization.jsonObject(with: data), let top = json as? [String: Any] else {
            throw fail("not a JSON object")
        }
        try keys(top, ["version", "callId", "sequence", "event"])
        guard try integer(top["version"], "version") == version else { throw fail("unknown version") }
        let callID = try text(top["callId"], "callId")
        guard callID.count == 14, callID.allSatisfy({ $0.isASCII && $0.isNumber }) else { throw fail("callId is not a room number") }
        let sequence = try integer(top["sequence"], "sequence")
        guard sequence >= 0 else { throw fail("sequence is negative") }
        guard let event = top["event"] as? [String: Any] else { throw fail("event is not an object") }
        return BrowserMessage(callID: callID, sequence: sequence, event: try decodeEvent(event))
    }

    private static func decodeEvent(_ event: [String: Any]) throws(BrowserMessageError) -> BrowserEvent {
        let type = try text(event["type"], "type")
        switch type {
        case "roster":
            try keys(event, ["type", "at", "participants"])
            guard let list = event["participants"] as? [Any] else { throw fail("participants is not a list") }
            var participants: [BrowserParticipant] = []
            for item in list {
                guard let fields = item as? [String: Any] else { throw fail("participant is not an object") }
                try keys(fields, ["id", "name", "isSelf"])
                let participant = BrowserParticipant(
                    id: try text(fields["id"], "id"), name: try text(fields["name"], "name"), isSelf: try boolean(fields["isSelf"], "isSelf"))
                guard !participants.contains(where: { $0.id == participant.id }) else { throw fail("participant \(participant.id) listed twice") }
                participants.append(participant)
            }
            return .roster(at: try time(event["at"]), participants: participants)
        case "speakingStarted", "speakingStopped":
            try keys(event, ["type", "at", "participantId"])
            let at = try time(event["at"]), id = try text(event["participantId"], "participantId")
            return type == "speakingStarted" ? .speakingStarted(at: at, participantID: id) : .speakingStopped(at: at, participantID: id)
        case "callEnded":
            try keys(event, ["type", "at"])
            return .callEnded(at: try time(event["at"]))
        default:
            throw fail("unknown event \(type)")
        }
    }

    private static func keys(_ object: [String: Any], _ expected: Set<String>) throws(BrowserMessageError) {
        let actual = Set(object.keys)
        guard actual == expected else {
            let extra = actual.subtracting(expected).sorted(), missing = expected.subtracting(actual).sorted()
            throw fail("fields: unknown \(extra), missing \(missing)")
        }
    }

    private static func number(_ value: Any?, _ field: String) throws(BrowserMessageError) -> NSNumber {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { throw fail("\(field) is not a number") }
        return number
    }

    private static func integer(_ value: Any?, _ field: String) throws(BrowserMessageError) -> Int {
        let double = try number(value, field).doubleValue
        guard double.rounded() == double, abs(double) < 9_007_199_254_740_992 else { throw fail("\(field) is not an integer") }
        return Int(double)
    }

    private static func time(_ value: Any?) throws(BrowserMessageError) -> Double {
        let at = try number(value, "at").doubleValue
        guard at.isFinite, at >= 0 else { throw fail("at is not a time") }
        return at
    }

    private static func text(_ value: Any?, _ field: String) throws(BrowserMessageError) -> String {
        guard let text = value as? String, !text.isEmpty, text.count <= 200 else { throw fail("\(field) is not a short non-empty string") }
        return text
    }

    private static func boolean(_ value: Any?, _ field: String) throws(BrowserMessageError) -> Bool {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { throw fail("\(field) is not a boolean") }
        return number.boolValue
    }

    private static func fail(_ reason: String) -> BrowserMessageError { BrowserMessageError(description: reason) }
}
