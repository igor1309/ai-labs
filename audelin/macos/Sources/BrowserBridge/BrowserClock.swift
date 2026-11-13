import Foundation

/// The app asks the extension for its clock with a ping, `{"ping": n}`; the
/// extension answers at once with `{"version": 1, "ping": n, "at": ms}`, its
/// clock in milliseconds. The reply carries no call and no sequence.
public struct BrowserClockReply: Equatable, Sendable {
    public var ping: Int
    public var at: Double

    public init(ping: Int, at: Double) { self.ping = ping; self.at = at }

    public static func ping(_ id: Int) -> Data { Data(#"{"ping":\#(id)}"#.utf8) }

    /// Reads a reply, or nil when the frame is not shaped as one.
    public static func decode(_ data: Data) -> BrowserClockReply? {
        guard let top = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              Set(top.keys) == ["version", "ping", "at"],
              let version = plain(top["version"]), version.doubleValue == Double(BrowserMessage.version),
              let ping = plain(top["ping"]), ping.doubleValue >= 0, ping.doubleValue == ping.doubleValue.rounded(), ping.doubleValue < 9_007_199_254_740_992,
              let at = plain(top["at"]), at.doubleValue.isFinite, at.doubleValue >= 0
        else { return nil }
        return BrowserClockReply(ping: ping.intValue, at: at.doubleValue)
    }

    private static func plain(_ value: Any?) -> NSNumber? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        return number
    }
}

/// A browser time placed on the call clock, in seconds, give or take
/// `uncertainty`.
public struct CallTime: Equatable, Sendable {
    public var time: Double
    public var uncertainty: Double

    public init(time: Double, uncertainty: Double) { self.time = time; self.uncertainty = uncertainty }
}

/// Estimates how far the browser clock is from the call clock from ping/reply
/// round trips. Each round trip brackets the browser's reading between when
/// the ping left and when the reply came back; the shortest of the latest
/// round trips gives the estimate, half its length the uncertainty. Old round
/// trips age out as new ones arrive, so the estimate follows drift; after a
/// reconnect or sleep, `reset` drops them all.
public struct BrowserClock: Equatable, Sendable {
    public struct RoundTrip: Equatable, Sendable {
        /// Call time, seconds, when the ping left and when the reply came back.
        public var sent: Double
        public var received: Double
        /// The browser's clock in the reply, milliseconds.
        public var browser: Double

        public init(sent: Double, received: Double, browser: Double) {
            self.sent = sent; self.received = received; self.browser = browser
        }
    }

    public var roundTrips: [RoundTrip]
    public var capacity: Int

    public init(roundTrips: [RoundTrip] = [], capacity: Int = 8) {
        self.roundTrips = roundTrips; self.capacity = capacity
    }

    /// Keeps a round trip, ignoring one that came back before it left.
    public mutating func record(_ roundTrip: RoundTrip) {
        guard roundTrip.received >= roundTrip.sent else { return }
        roundTrips.append(roundTrip)
        if roundTrips.count > capacity { roundTrips.removeFirst(roundTrips.count - capacity) }
    }

    public mutating func reset() { roundTrips = [] }

    /// Browser seconds minus call seconds, or nil before any round trip.
    public func offset() -> CallTime? {
        guard let best = roundTrips.min(by: { $0.received - $0.sent < $1.received - $1.sent }) else { return nil }
        return CallTime(time: best.browser / 1000 - (best.sent + best.received) / 2, uncertainty: (best.received - best.sent) / 2)
    }

    /// Places a browser timestamp on the call clock. A time from before the
    /// call started is placed at its start, since nothing was recorded
    /// earlier. Nil before any round trip.
    public func callTime(ofBrowser milliseconds: Double) -> CallTime? {
        guard let offset = offset() else { return nil }
        return CallTime(time: max(0, milliseconds / 1000 - offset.time), uncertainty: offset.uncertainty)
    }
}
