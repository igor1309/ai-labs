import Foundation
import Testing
import ClientFind
import Settings
@testable import DeviceRadios
@testable import Root

@Suite @MainActor struct RadioClockCompositionTests {
    @Test func deviceFactoryPassesLiveTimeSourceToClientRadio() throws {
        let h = Harness()
        defer { h.finish() }
        var readingTime: (() -> Double)?
        let pair = deviceRadios(clock: h.clock, makeHost: { h.host }, makeClient: {
            readingTime = $0
            return h.client
        })
        let now = try #require(readingTime)
        #expect(pair.client === h.client)
        for time in [42.0, 43.5] {
            h.clock.setTime(time)
            #expect(now() == time)
        }
    }

    @Test func tickWrittenSignalLineAllowsReadingAtSharedOneSecondBoundary() async throws {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(1), for: .pickerAlpha)
        h.store.set(.number(10), for: .pickerFade)
        h.clock.setTime(5)
        var readingTime: (() -> Double)?
        let pair = deviceRadios(clock: h.clock, makeHost: { h.host }, makeClient: {
            readingTime = $0
            return h.client
        })
        let now = try #require(readingTime)
        let discovery = ClientDiscovery(radio: pair.client, clock: h.clock,
                                        settings: Settings(store: h.store), log: h.log)
        defer { discovery.stop() }
        let (events, sink) = AsyncStream<ClientFind.Event>.makeStream()
        defer { sink.finish() }
        discovery.send = { if case .pickerAnswered = $0 { sink.yield($0) } }
        var answers = events.makeAsyncIterator()
        let host = UUID()
        func read(_ rssi: Int) {
            discovery.reading(host: host, name: nil, rssi: rssi, time: now())
        }
        func messages() -> [String] {
            h.log.entries.filter { $0.category == .clientFind }.map(\.message)
        }

        discovery.start()
        read(-70)
        _ = await answers.next()
        read(-67)
        _ = await answers.next()
        #expect(messages() == ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1"])
        h.clock.advance(1)
        #expect(await answers.next() == .pickerAnswered(.holdCloser))
        let afterTick = ["picker none hosts=0", "picker holdCloser rssi=-70 hosts=1",
                         "picker holdCloser rssi=-67 hosts=1"]
        #expect(messages() == afterTick)
        h.clock.setTime(6.999)
        read(-70)
        _ = await answers.next()
        #expect(messages() == afterTick)
        h.clock.setTime(7)
        read(-70)
        _ = await answers.next()
        #expect(messages() == afterTick + ["picker holdCloser rssi=-70 hosts=1"])
    }
}
