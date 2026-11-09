import AppKit
import CoreAudio
import Dispatch
import Foundation

/// Observes route changes without changing the route. The queue exists only
/// because Core Audio delivers property listeners on one.
public final class OutputEnvironment: Sendable {
    public let changes: AsyncStream<Void>
    private let output: AsyncStream<Void>.Continuation
    private let listenerQueue = DispatchQueue(label: "audelin.ProbeEnvironment")
    private let listener: OutputListener
    private let native: OutputNative
    private let center: NotificationCenter
    private let observers: [ObserverToken]
    private let installed: Bool

    /// Observes `native` and `center`: `.live` and the workspace's notification center in the app.
    public init(native: OutputNative, center: NotificationCenter) {
        self.native = native
        self.center = center
        (changes, output) = AsyncStream.makeStream()
        let output = output
        listener = OutputListener { _, _ in output.yield(()) }
        observers = [NSWorkspace.willSleepNotification, NSWorkspace.didWakeNotification].map { name in
            ObserverToken(center.addObserver(forName: name, object: nil, queue: nil) { _ in output.yield(()) })
        }
        var address = property(kAudioHardwarePropertyDefaultOutputDevice)
        installed = native.add(&address, listenerQueue, listener.block) == noErr
    }

    public func device() async -> UInt32? {
        // Without change delivery a cached grant could survive sleep or a route change.
        installed ? try? native.device() : nil
    }

    deinit {
        for observer in observers { center.removeObserver(observer.value) }
        if installed {
            var address = property(kAudioHardwarePropertyDefaultOutputDevice)
            _ = native.remove(&address, listenerQueue, listener.block)
        }
        output.finish()
    }
}

private final class ObserverToken: @unchecked Sendable {
    let value: any NSObjectProtocol
    init(_ value: any NSObjectProtocol) { self.value = value }
}

public struct OutputNative: Sendable {
    var device: @Sendable () throws -> UInt32
    var add: @Sendable (UnsafePointer<AudioObjectPropertyAddress>, DispatchQueue, @escaping AudioObjectPropertyListenerBlock) -> OSStatus
    var remove: @Sendable (UnsafePointer<AudioObjectPropertyAddress>, DispatchQueue, @escaping AudioObjectPropertyListenerBlock) -> OSStatus

    public static let live = OutputNative(device: defaultOutputDevice, add: {
        AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), $0, $1, $2)
    }, remove: {
        AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), $0, $1, $2)
    })
}

private final class OutputListener: @unchecked Sendable {
    let block: AudioObjectPropertyListenerBlock
    init(_ block: @escaping AudioObjectPropertyListenerBlock) { self.block = block }
}
