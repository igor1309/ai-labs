import Foundation

public struct Settings: Codable, Equatable, Sendable {
    public enum Bluetooth: String, Codable, Sendable { case on, off, notAllowed }
    public enum Decision: String, Codable, Sendable { case confirm, decline }
    public enum Outcome: String, Codable, Sendable { case success, failure }
    public enum ClientDrop: String, Codable, CaseIterable, Sendable {
        case beforeKey, afterKey, afterAmount, afterDecision
    }
    public enum HostDrop: String, Codable, CaseIterable, Sendable {
        case beforeKey, beforeAmountArrives, afterAmount, afterAcknowledgement
    }
    public struct Delays: Codable, Equatable, Sendable {
        public var connect: Double = 0.1
        public var key: Double = 0.1
        public var amount: Double = 0.1
        public var decision: Double = 0.1
        public var acknowledgement: Double = 0.1
        public var outcome: Double = 0.1
        public var end: Double = 0.1
        public var drop: Double = 0.1
        public init() {}
    }
    public struct Client: Codable, Equatable, Sendable {
        public var comes = true
        public var decision: Decision = .confirm
        public var drop: ClientDrop? = nil
        public var delays = Delays()
        public init() {}
    }
    public struct Reading: Codable, Equatable, Sendable {
        public var time: Double = 0
        public var rssi: Int = -40
        public init(time: Double = 0, rssi: Int = -40) { self.time = time; self.rssi = rssi }
    }
    public struct Host: Codable, Equatable, Sendable {
        public var name = "MIZAN-CAFE"
        public var readings: [Reading] = [.init()]
        public var amount: UInt64 = 12345
        public var cancelsAfterAmount = false
        public var outcome: Outcome = .success
        public var drop: HostDrop? = nil
        public var delays = Delays()
        public init() {}
    }
    public var bluetooth: Bluetooth = .on
    public var client = Client()
    public var hosts: [Host] = [.init()]
    public init() {}
}

public enum SettingsResult: Equatable, Sendable {
    public enum Unavailable: String, Sendable { case missing, invalid }
    case valid(Settings)
    case unavailable(kind: Unavailable)
}

extension Settings.Delays {
    private enum CodingKeys: String, CodingKey { case connect, key, amount, decision, acknowledgement, outcome, end, drop }
    public init(from decoder: any Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.contains(.connect) { connect = try c.decode(Double.self, forKey: .connect) }
        if c.contains(.key) { key = try c.decode(Double.self, forKey: .key) }
        if c.contains(.amount) { amount = try c.decode(Double.self, forKey: .amount) }
        if c.contains(.decision) { decision = try c.decode(Double.self, forKey: .decision) }
        if c.contains(.acknowledgement) { acknowledgement = try c.decode(Double.self, forKey: .acknowledgement) }
        if c.contains(.outcome) { outcome = try c.decode(Double.self, forKey: .outcome) }
        if c.contains(.end) { end = try c.decode(Double.self, forKey: .end) }
        if c.contains(.drop) { drop = try c.decode(Double.self, forKey: .drop) }
        guard connect.isFinite && connect >= 0, key.isFinite && key >= 0, amount.isFinite && amount >= 0, decision.isFinite && decision >= 0, acknowledgement.isFinite && acknowledgement >= 0, outcome.isFinite && outcome >= 0, end.isFinite && end >= 0, drop.isFinite && drop >= 0 else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid timing or signal"))
        }
    }
}

extension Settings.Client {
    private enum CodingKeys: String, CodingKey { case comes, decision, drop, delays }
    public init(from decoder: any Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.contains(.comes) { comes = try c.decode(Bool.self, forKey: .comes) }
        if c.contains(.decision) { decision = try c.decode(Settings.Decision.self, forKey: .decision) }
        drop = try c.decodeIfPresent(Settings.ClientDrop.self, forKey: .drop)
        if c.contains(.delays) { delays = try c.decode(Settings.Delays.self, forKey: .delays) }
    }
}

extension Settings.Reading {
    private enum CodingKeys: String, CodingKey { case time, rssi }
    public init(from decoder: any Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.contains(.time) { time = try c.decode(Double.self, forKey: .time) }
        if c.contains(.rssi) { rssi = try c.decode(Int.self, forKey: .rssi) }
        guard time.isFinite && time >= 0 else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid timing or signal"))
        }
    }
}

extension Settings.Host {
    private enum CodingKeys: String, CodingKey { case name, readings, amount, cancelsAfterAmount, outcome, drop, delays }
    public init(from decoder: any Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.contains(.name) { name = try c.decode(String.self, forKey: .name) }
        if c.contains(.readings) { readings = try c.decode([Settings.Reading].self, forKey: .readings) }
        if c.contains(.amount) { amount = try c.decode(UInt64.self, forKey: .amount) }
        if c.contains(.cancelsAfterAmount) { cancelsAfterAmount = try c.decode(Bool.self, forKey: .cancelsAfterAmount) }
        if c.contains(.outcome) { outcome = try c.decode(Settings.Outcome.self, forKey: .outcome) }
        drop = try c.decodeIfPresent(Settings.HostDrop.self, forKey: .drop)
        if c.contains(.delays) { delays = try c.decode(Settings.Delays.self, forKey: .delays) }
    }
}

extension Settings {
    private enum CodingKeys: String, CodingKey { case bluetooth, client, hosts }
    public init(from decoder: any Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.contains(.bluetooth) { bluetooth = try c.decode(Settings.Bluetooth.self, forKey: .bluetooth) }
        if c.contains(.client) { client = try c.decode(Settings.Client.self, forKey: .client) }
        if c.contains(.hosts) { hosts = try c.decode([Settings.Host].self, forKey: .hosts) }
    }
}
