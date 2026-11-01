import struct CallText.State
import Synchronization

/// Text states for a reader that may fall behind, keeping only what it needs:
/// the newest listening state and the newest one after it. A listening state
/// replaces the panel's text, so any before it can go; a state of another
/// status only adds to it, so the listening one before it must stay.
final class NewestText: Sendable {

    private struct Buffer {

        var states: [State] = []
        var waiter: CheckedContinuation<State?, Never>?
        var finished = false
    }

    private let buffer = Mutex(Buffer())

    var stream: AsyncStream<State> {

        AsyncStream(unfolding: { [self] in await next() })
    }

    func yield(_ state: State) {

        buffer.withLock { buffer in
            guard !buffer.finished else { return }
            if let waiter = buffer.waiter {
                buffer.waiter = nil
                waiter.resume(returning: state)
            } else if state.status == .listening {
                buffer.states = [state]
            } else {
                buffer.states = buffer.states.prefix { $0.status == .listening }.suffix(1) + [state]
            }
        }
    }

    func finish() {

        buffer.withLock { buffer in
            buffer.finished = true
            buffer.waiter?.resume(returning: nil)
            buffer.waiter = nil
        }
    }

    private func next() async -> State? {

        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                buffer.withLock { buffer in
                    if !buffer.states.isEmpty {
                        continuation.resume(returning: buffer.states.removeFirst())
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
