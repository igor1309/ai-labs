import AppKit
import CoreAudio
import Dispatch
import Foundation

/// Reads the route off the cooperative pool and observes changes without changing it.
public final class OutputEnvironment: @unchecked Sendable {
    public let changes: AsyncStream<Void>
    private let output: AsyncStream<Void>.Continuation
    private let queue = DispatchQueue(label: "audelin.ProbeEnvironment")
    private let listener: OutputListener
    private let native: OutputNative
    private let center: NotificationCenter
    private var observers: [any NSObjectProtocol] = []
    private var installed = false

    public convenience init() {
        self.init(native: .live, center: NSWorkspace.shared.notificationCenter)
    }

    init(native: OutputNative, center: NotificationCenter) {
        self.native = native
        self.center = center
        (changes, output) = AsyncStream.makeStream()
        let output = output
        listener = OutputListener { _, _ in output.yield(()) }
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.didWakeNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: nil) { _ in output.yield(()) })
        }
        queue.async { [self] in
            var address = property(kAudioHardwarePropertyDefaultOutputDevice)
            installed = native.add(&address, queue, listener.block) == noErr
        }
    }

    public func device() async -> UInt32? {
        await withCheckedContinuation { done in
            queue.async { [self] in
                // Without change delivery a cached grant could survive sleep or a route change.
                done.resume(returning: installed ? try? native.device() : nil)
            }
        }
    }

    deinit {
        for observer in observers { center.removeObserver(observer) }
        if installed {
            let queue = queue, listener = listener, native = native
            queue.async {
                var address = property(kAudioHardwarePropertyDefaultOutputDevice)
                _ = native.remove(&address, queue, listener.block)
            }
        }
        output.finish()
    }
}

struct OutputNative: Sendable {
    var device: @Sendable () throws -> UInt32
    var add: @Sendable (UnsafePointer<AudioObjectPropertyAddress>, DispatchQueue, @escaping AudioObjectPropertyListenerBlock) -> OSStatus
    var remove: @Sendable (UnsafePointer<AudioObjectPropertyAddress>, DispatchQueue, @escaping AudioObjectPropertyListenerBlock) -> OSStatus

    static let live = OutputNative(device: defaultOutputDevice, add: {
        AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), $0, $1, $2)
    }, remove: {
        AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), $0, $1, $2)
    })
}

private final class OutputListener: @unchecked Sendable {
    let block: AudioObjectPropertyListenerBlock
    init(_ block: @escaping AudioObjectPropertyListenerBlock) { self.block = block }
}
