import BrowserBridge
import Foundation
import Testing

@Suite struct BrowserClockTests {
    @Test func hasNoEstimateBeforeARoundTrip() {
        #expect(BrowserClock().callTime(ofBrowser: 1_000) == nil)
    }

    @Test func estimatesTheOffsetFromTheMiddleOfARoundTrip() {
        var clock = BrowserClock()
        // Ping leaves at call time 10 s, returns at 10.2 s; the browser read 1000.1 s.
        clock.record(.init(sent: 10, received: 10.2, browser: 1_000_100))
        #expect(clock.offset()?.rounded == CallTime(time: 990, uncertainty: 0.1))
        #expect(clock.callTime(ofBrowser: 1_005_000)?.rounded == CallTime(time: 15, uncertainty: 0.1))
    }

    @Test func prefersTheShortestRoundTrip() {
        var clock = BrowserClock()
        clock.record(.init(sent: 10, received: 11, browser: 1_000_900))   // slow: says 989.4
        clock.record(.init(sent: 20, received: 20.02, browser: 1_010_010)) // fast: says 990
        #expect(clock.offset()?.rounded == CallTime(time: 990, uncertainty: 0.01))
    }

    @Test func refreshesAsOldRoundTripsAgeOut() {
        var clock = BrowserClock(capacity: 2)
        clock.record(.init(sent: 0, received: 0.01, browser: 990_005))      // fast, offset 990
        clock.record(.init(sent: 100, received: 100.1, browser: 1_091_050)) // browser drifted to 991
        #expect(clock.offset()?.rounded.time == 990)
        clock.record(.init(sent: 200, received: 200.1, browser: 1_191_050))
        #expect(clock.offset()?.rounded == CallTime(time: 991, uncertainty: 0.05))
    }

    @Test func forgetsEverythingOnReset() {
        var clock = BrowserClock()
        clock.record(.init(sent: 0, received: 0.1, browser: 990_050))
        clock.reset()
        #expect(clock.offset() == nil)
    }

    @Test func ignoresARoundTripThatEndsBeforeItStarts() {
        var clock = BrowserClock()
        clock.record(.init(sent: 5, received: 4, browser: 990_000))
        #expect(clock.offset() == nil)
    }

    @Test func placesATimeFromBeforeTheCallAtItsStart() {
        var clock = BrowserClock()
        clock.record(.init(sent: 10, received: 10.2, browser: 1_000_100))
        #expect(clock.callTime(ofBrowser: 985_000)?.rounded == CallTime(time: 0, uncertainty: 0.1))
    }

    @Test func readsAClockReplyAndWritesAPing() throws {
        #expect(BrowserClockReply.decode(Data(#"{"version":1,"ping":7,"at":1731499200000.5}"#.utf8)) == BrowserClockReply(ping: 7, at: 1_731_499_200_000.5))
        #expect(String(decoding: BrowserClockReply.ping(7), as: UTF8.self) == #"{"ping":7}"#)
        for bad in [#"{"version":2,"ping":7,"at":1}"#, #"{"version":1,"ping":-1,"at":1}"#, #"{"version":1,"ping":7,"at":true}"#, #"{"version":1,"ping":7}"#, #"{"version":1,"ping":7,"at":1,"x":1}"#] {
            #expect(BrowserClockReply.decode(Data(bad.utf8)) == nil, "\(bad)")
        }
    }
}

private extension CallTime {
    var rounded: CallTime { CallTime(time: (time * 1e6).rounded() / 1e6, uncertainty: (uncertainty * 1e6).rounded() / 1e6) }
}
