import Synchronization

/// Elements for a reader that may fall behind, keeping only what it needs.
/// An element the policy marks as replacing stands for everything before it,
/// so those can go; any other element only adds to the newest replacing one
/// before it, so that one stays, followed by the newest added element.
public final class LatestText<Element: Sendable>: Sendable {

    private struct Buffer {

        var elements: [Element] = []
        var waiter: CheckedContinuation<Element?, Never>?
        var finished = false
    }

    private let replaces: @Sendable (Element) -> Bool
    private let buffer = Mutex(Buffer())

    /// - Parameter replaces: whether an element replaces the buffer rather than adding to it.
    public init(replaces: @escaping @Sendable (Element) -> Bool) {

        self.replaces = replaces
    }

    public var stream: AsyncStream<Element> {

        AsyncStream(unfolding: { [self] in await next() })
    }

    public func yield(_ element: Element) {

        buffer.withLock { buffer in
            guard !buffer.finished else { return }
            if let waiter = buffer.waiter {
                buffer.waiter = nil
                waiter.resume(returning: element)
            } else if replaces(element) {
                buffer.elements = [element]
            } else {
                buffer.elements = buffer.elements.prefix(while: replaces).suffix(1) + [element]
            }
        }
    }

    /// Ends the stream once the reader has taken what is buffered.
    public func finish() {

        buffer.withLock { buffer in
            buffer.finished = true
            buffer.waiter?.resume(returning: nil)
            buffer.waiter = nil
        }
    }

    private func next() async -> Element? {

        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                buffer.withLock { buffer in
                    if !buffer.elements.isEmpty {
                        continuation.resume(returning: buffer.elements.removeFirst())
                    } else if buffer.finished || Task.isCancelled {
                        continuation.resume(returning: nil)
                    } else {
                        buffer.waiter = continuation
                    }
                }
            }
        } onCancel: {
            buffer.withLock { buffer in
                buffer.waiter?.resume(returning: nil)
                buffer.waiter = nil
            }
        }
    }
}
