import BrowserBridge
import Foundation
import Synchronization
@testable import Composer

/// One browser event as the extension frames it.
func browserMessage(_ sequence: Int, _ event: String) -> String {
    #"{"version":1,"callId":"12345678901234","sequence":\#(sequence),"event":\#(event)}"#
}

final class FakeBrowserChannel: Sendable {
    private let connections = AsyncStream<BrowserConnection>.makeStream()
    private let stops = Mutex(0)

    var stopped: Bool { stops.withLock { $0 } == 1 }

    func open() -> BrowserChannel {
        BrowserChannel(connections: connections.stream, stop: { [self] in
            stops.withLock { $0 += 1 }
            connections.continuation.finish()
        })
    }

    func connect() -> FakeBrowserPeer {
        let peer = FakeBrowserPeer()
        connections.continuation.yield(BrowserConnection(frames: peer.frames, send: { peer.sentIn.yield($0) }, close: { peer.framesIn.finish() }))
        return peer
    }
}

final class FakeBrowserPeer: Sendable {
    let frames: AsyncStream<Data>
    let framesIn: AsyncStream<Data>.Continuation
    let sent: AsyncStream<Data>
    let sentIn: AsyncStream<Data>.Continuation

    init() {
        (frames, framesIn) = AsyncStream.makeStream()
        (sent, sentIn) = AsyncStream.makeStream()
    }

    func send(_ text: String) { framesIn.yield(Data(text.utf8)) }
}
