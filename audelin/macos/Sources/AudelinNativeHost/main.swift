import BrowserBridge
import Foundation

// The browser starts this program for the Audelin extension and talks to it
// over standard input and output; it relays to the running app's socket.
let input = AsyncStream<Data>.makeStream()
FileHandle.standardInput.readabilityHandler = { handle in
    let bytes = handle.availableData
    if bytes.isEmpty { handle.readabilityHandler = nil; input.continuation.finish() }
    else { input.continuation.yield(bytes) }
}
guard let link = try? RelayLink.connect(to: BrowserSocket.path(home: FileManager.default.homeDirectoryForCurrentUser)) else {
    exit(1)
}
await NativeHostRelay(
    read: {
        var iterator = input.stream.makeAsyncIterator()
        return await iterator.next()
    },
    write: { try FileHandle.standardOutput.write(contentsOf: $0) },
    link: link
).run()
exit(0)
