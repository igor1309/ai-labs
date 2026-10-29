import AppKit
import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import CallAudioProbe

@Suite(.timeLimit(.minutes(1)))
struct OutputEnvironmentTests {
    @Test func outputSleepAndWakeInvalidateAndSubscriptionIsRemoved() async {
        let spy = OutputSpy()
        let center = NotificationCenter()
        var environment: OutputEnvironment? = OutputEnvironment(native: spy.native, center: center)
        #expect(await environment?.device() == 10)
        var changes = environment!.changes.makeAsyncIterator()
        spy.change()
        #expect(await changes.next() != nil)
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.didWakeNotification] {
            center.post(name: name, object: nil)
            #expect(await changes.next() != nil)
        }
        environment = nil
        for await _ in spy.removed.stream { break }
        #expect(spy.events.withLock { $0 } == ["add", "read", "remove"])
    }

    @Test func missingChangeSubscriptionAndFailedOutputReadFailClosed() async {
        for failure in ["add", "read"] {
            let spy = OutputSpy(failure: failure)
            var environment: OutputEnvironment? = OutputEnvironment(native: spy.native, center: NotificationCenter())
            #expect(await environment?.device() == nil)
            environment = nil
            if failure == "read" { for await _ in spy.removed.stream { break } }
            #expect(spy.events.withLock { $0 } == (failure == "add" ? ["add"] : ["add", "read", "remove"]))
        }
    }
}

private final class OutputSpy: Sendable {
    let failure: String
    let events = Mutex<[String]>([])
    let block = Mutex<CapturedListener?>(nil)
    let removed = AsyncStream<Void>.makeStream()
    init(failure: String = "") { self.failure = failure }
    var native: OutputNative {
        OutputNative(device: { [self] in
            #expect(!Thread.isMainThread)
            events.withLock { $0.append("read") }
            if failure == "read" { throw ProbeFailure("read") }
            return 10
        }, add: { [self] address, _, listener in
            #expect(!Thread.isMainThread)
            #expect(address.pointee.mSelector == kAudioHardwarePropertyDefaultOutputDevice)
            events.withLock { $0.append("add") }
            if failure == "add" { return -1 }
            block.withLock { $0 = CapturedListener(listener) }
            return noErr
        }, remove: { [self] address, _, _ in
            #expect(!Thread.isMainThread)
            #expect(address.pointee.mSelector == kAudioHardwarePropertyDefaultOutputDevice)
            events.withLock { $0.append("remove") }
            removed.continuation.yield(())
            return noErr
        })
    }
    func change() {
        var address = property(kAudioHardwarePropertyDefaultOutputDevice)
        block.withLock { $0 }?.value(1, &address)
    }
}

private final class CapturedListener: @unchecked Sendable {
    let value: AudioObjectPropertyListenerBlock
    init(_ value: @escaping AudioObjectPropertyListenerBlock) { self.value = value }
}
