import BrowserBridge
import Foundation
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1))) struct NativeHostRelayTests {
    @Test func passesBrowserMessagesToTheAppInOrder() async {
        let browser = FakeBrowser(), app = FakeApp()
        browser.type(framed("one") + framed("two").prefix(5))
        browser.type(framed("two").dropFirst(5) + framed("three"))
        browser.quit()
        await relay(browser, app).run()
        #expect(app.received == ["one", "two", "three"].map { Data($0.utf8) })
        #expect(app.closed)
    }

    @Test func passesAppMessagesToTheBrowserFramed() async {
        let browser = FakeBrowser(), app = FakeApp()
        app.say("ping"); app.say("pong"); app.hangUp()
        await relay(browser, app).run()
        #expect(browser.shown == framed("ping") + framed("pong"))
        #expect(app.closed)
    }

    @Test func endsWhenTheAppClosesWhileTheBrowserStaysOpen() async {
        let browser = FakeBrowser(), app = FakeApp()
        app.hangUp()
        await relay(browser, app).run()
        #expect(app.closed)
    }

    @Test func endsAndClosesTheAppOnAnUnframableBrowserMessage() async {
        let browser = FakeBrowser(), app = FakeApp()
        browser.type(withUnsafeBytes(of: UInt32(NativeMessageFraming.maximumFromBrowser + 1).littleEndian) { Data($0) })
        await relay(browser, app).run()
        #expect(app.received.isEmpty && app.closed)
    }

    private func relay(_ browser: FakeBrowser, _ app: FakeApp) -> NativeHostRelay {
        NativeHostRelay(read: browser.read, write: browser.write, link: app.link)
    }
}

private func framed(_ text: String) -> Data {
    withUnsafeBytes(of: UInt32(text.utf8.count).littleEndian) { Data($0) } + Data(text.utf8)
}

/// Standard input and output as the browser drives them.
private final class FakeBrowser: Sendable {
    private let input = AsyncStream<Data>.makeStream()
    private let output = Mutex(Data())
    var shown: Data { output.withLock { $0 } }
    func type(_ bytes: Data) { input.continuation.yield(bytes) }
    func quit() { input.continuation.finish() }
    @Sendable func read() async -> Data? {
        var iterator = input.stream.makeAsyncIterator()
        return await iterator.next()
    }
    @Sendable func write(_ bytes: Data) { output.withLock { $0.append(bytes) } }
}

/// The app's end of the link.
private final class FakeApp: Sendable {
    private let messages = AsyncStream<Data>.makeStream()
    private let state = Mutex((received: [Data](), closed: false))
    var received: [Data] { state.withLock { $0.received } }
    var closed: Bool { state.withLock { $0.closed } }
    func say(_ text: String) { messages.continuation.yield(Data(text.utf8)) }
    func hangUp() { messages.continuation.finish() }
    var link: RelayLink {
        RelayLink(send: { message in self.state.withLock { $0.received.append(message) } },
                  receive: {
                      var iterator = self.messages.stream.makeAsyncIterator()
                      return await iterator.next()
                  },
                  close: { self.state.withLock { $0.closed = true }; self.messages.continuation.finish() })
    }
}
