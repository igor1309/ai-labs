import BlockingTestWork
import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import MicrophoneCapture

struct NativeMicrophoneHALTests {

    @Test(arguments: [UInt32(7), 41])
    func defaultInputReadsTheSystemDefaultProperty(device: UInt32) async throws {

        let calls = RecordingMicrophoneHAL(value: device)
        let binding = makeBinding(calls)
        #expect(try await offPool { try binding.defaultInput() } == device)
        #expect(try await offPool { try NativeMicrophoneBinding.readDefaultInput(hal: calls.hal) } == device)
        #expect(calls.state.withLock { $0.reads } == Array(repeating: .defaultInput, count: 2))
    }

    @Test func anUnknownDefaultDeviceThrowsNoInput() async {

        let calls = RecordingMicrophoneHAL(value: kAudioObjectUnknown)
        let binding = makeBinding(calls)
        await #expect(throws: CaptureError.noInput) {
            try await offPool { try binding.defaultInput() }
        }
        #expect(calls.state.withLock { $0.reads } == [.defaultInput])
    }

    @Test(arguments: [OSStatus(-50), kAudioHardwareBadObjectError])
    func aFailedDefaultReadNamesTheNativeCall(status: OSStatus) async {

        let calls = RecordingMicrophoneHAL(value: 7, readStatus: status)
        let binding = makeBinding(calls)
        let error = await #expect(throws: NativeMicrophoneError.self) {
            try await offPool { try binding.defaultInput() }
        }
        #expect(error?.call == "reading the default input")
        #expect(error?.status == status)
        #expect(calls.state.withLock { $0.reads } == [.defaultInput])
    }

    @Test(arguments: [UInt32(0), 1, 2], [OSStatus(noErr), -50, kAudioHardwareBadObjectError])
    func availabilityRequiresASuccessfulAliveRead(alive: UInt32, status: OSStatus) async {

        let calls = RecordingMicrophoneHAL(value: alive, readStatus: status)
        let binding = makeBinding(calls)
        #expect(await offPool { binding.inputAvailable(41) } == (status == noErr && alive != 0))
        #expect(calls.state.withLock { $0.reads } == [HALRead(
            object: 41, selector: kAudioDevicePropertyDeviceIsAlive
        )])
    }

    @Test func aDefaultChangeReadsAndDeliversTheNewDeviceOnTheNotificationQueue() async throws {

        let calls = RecordingMicrophoneHAL(value: 7)
        let binding = makeBinding(calls)
        let delivered = Mutex<[UInt32]>([])
        try await withCleanup {
            try await offPool {
                try binding.watchDefaultInput { device in
                    #expect(isMicrophoneNotification)
                    delivered.withLock { $0.append(device) }
                }
            }
            #expect(calls.state.withLock { $0.reads }.isEmpty)
            for device in [UInt32(41), 83] {
                calls.state.withLock { $0.value = device }
                let inline = try await calls.notify { delivered.withLock { $0 } }
                #expect(inline == (device == 41 ? [41] : [41, 83]))
            }
            #expect(calls.state.withLock { $0.reads } == Array(repeating: .defaultInput, count: 2))
            #expect(calls.state.withLock { $0.notificationReads } == [true, true])
        } cleanup: {
            binding.unwatchDefaultInput()
        }
    }

    @Test(arguments: [OSStatus(noErr), -50, kAudioHardwareBadObjectError])
    func anUnknownOrUnreadableDefaultNotifiesUnknown(status: OSStatus) async throws {

        let calls = RecordingMicrophoneHAL(value: 7)
        let binding = makeBinding(calls)
        let delivered = Mutex<[UInt32]>([])
        try await withCleanup {
            try await offPool {
                try binding.watchDefaultInput { device in delivered.withLock { $0.append(device) } }
            }
            calls.state.withLock {
                $0.value = status == noErr ? kAudioObjectUnknown : 41
                $0.readStatus = status
            }
            let inline = try await calls.notify { delivered.withLock { $0 } }
            #expect(inline == [kAudioObjectUnknown])
            #expect(calls.state.withLock { $0.reads } == [.defaultInput])
            #expect(calls.state.withLock { $0.notificationReads } == [true])
        } cleanup: {
            binding.unwatchDefaultInput()
        }
    }

    @Test(arguments: [OSStatus(-50), kAudioHardwareIllegalOperationError])
    func aRefusedRegistrationThrowsAndRetainsNoListener(status: OSStatus) async throws {

        let calls = RecordingMicrophoneHAL(value: 7, addStatus: status)
        let binding = makeBinding(calls)
        let lifetime = WeakCallbackLifetime()
        let error = await #expect(throws: NativeMicrophoneError.self) {
            try await offPool {
                let token = CallbackLifetime()
                lifetime.value = token
                try binding.watchDefaultInput { [token] _ in withExtendedLifetime(token) {} }
            }
        }
        #expect(error?.call == "watching the default input")
        #expect(error?.status == status)
        #expect(lifetime.value == nil)
        await offPool { binding.unwatchDefaultInput() }
        #expect(calls.state.withLock { $0.additions.count } == 1)
        #expect(calls.state.withLock { $0.listener } == nil)
        #expect(calls.state.withLock { $0.removals }.isEmpty)
    }

    @Test(arguments: [OSStatus(noErr), -50])
    func unwatchRemovesTheExactRegistrationOnlyOnce(removeStatus: OSStatus) async throws {

        let calls = RecordingMicrophoneHAL(value: 7, removeStatus: removeStatus)
        let binding = makeBinding(calls)
        try await withCleanup {
            await offPool { binding.unwatchDefaultInput() }
            #expect(calls.state.withLock { $0.removals }.isEmpty)
            try await offPool { try binding.watchDefaultInput { _ in } }
            let registration = try #require(calls.state.withLock { $0.listener })
            #expect(registration.object == kAudioObjectSystemObject)
            #expect(registration.property == HALRead.defaultInput)
            #expect(registration.queue.label == "audelin.microphone-notifications")
            await offPool { binding.unwatchDefaultInput() }
            await offPool { binding.unwatchDefaultInput() }
            #expect(calls.state.withLock { $0.removals } == [registration.identity])
            #expect(calls.state.withLock { $0.additions } == [registration.identity])
        } cleanup: {
            binding.unwatchDefaultInput()
        }
    }

    private func makeBinding(_ calls: RecordingMicrophoneHAL) -> NativeMicrophoneBinding {

        NativeMicrophoneBinding(
            makeEngine: { preconditionFailure("HAL operations must not create an engine") },
            readClock: { preconditionFailure("HAL operations must not read a clock") },
            hal: calls.hal
        )
    }
}

private struct HALRead: Equatable, Sendable {

    let object: UInt32
    let selector: UInt32
    var scope: UInt32 = kAudioObjectPropertyScopeGlobal
    var element: UInt32 = kAudioObjectPropertyElementMain

    static var defaultInput: Self {
        HALRead(object: AudioObjectID(kAudioObjectSystemObject), selector: kAudioHardwarePropertyDefaultInputDevice)
    }

    init(object: UInt32, selector: UInt32) {
        self.object = object
        self.selector = selector
    }

    init(object: UInt32, address: AudioObjectPropertyAddress) {
        self.object = object
        selector = address.mSelector
        scope = address.mScope
        element = address.mElement
    }
}

private struct HALListenerIdentity: Equatable, Sendable {

    let property: HALRead
    let queue: ObjectIdentifier
    let block: UInt
}

private struct HALListener: Sendable {

    let object: UInt32
    let address: AudioObjectPropertyAddress
    let queue: DispatchQueue
    let block: MicrophoneListenerBlock

    var property: HALRead { HALRead(object: object, address: address) }
    var identity: HALListenerIdentity {
        HALListenerIdentity(property: property, queue: ObjectIdentifier(queue), block: unsafeBitCast(block.value, to: UInt.self))
    }
}

private var isMicrophoneNotification: Bool {
    Thread.current.threadDictionary["audelin.microphone-hal-notification"] as? Bool == true
}

private final class RecordingMicrophoneHAL: Sendable {

    struct State {
        var value: UInt32
        var readStatus: OSStatus
        var reads: [HALRead] = []
        var notificationReads: [Bool] = []
        var additions: [HALListenerIdentity] = []
        var removals: [HALListenerIdentity] = []
        var listener: HALListener?
    }

    let state: Mutex<State>
    let addStatus: OSStatus
    let removeStatus: OSStatus

    init(value: UInt32, readStatus: OSStatus = noErr, addStatus: OSStatus = noErr, removeStatus: OSStatus = noErr) {
        state = Mutex(State(value: value, readStatus: readStatus))
        self.addStatus = addStatus
        self.removeStatus = removeStatus
    }

    var hal: MicrophoneHALCalls {
        MicrophoneHALCalls(
            read: { [self] object, address, qualifierSize, qualifier, size, data in
                #expect(qualifierSize == 0)
                #expect(qualifier == nil)
                #expect(size == MemoryLayout<UInt32>.size)
                return state.withLock {
                    $0.reads.append(HALRead(object: object, address: address))
                    $0.notificationReads.append(isMicrophoneNotification)
                    data.storeBytes(of: $0.value, as: UInt32.self)
                    return $0.readStatus
                }
            },
            addListener: { [self] object, address, queue, block in
                let listener = HALListener(object: object, address: address, queue: queue, block: block)
                state.withLock {
                    $0.additions.append(listener.identity)
                    if addStatus == noErr { $0.listener = listener }
                }
                return addStatus
            },
            removeListener: { [self] object, address, queue, block in
                let listener = HALListener(object: object, address: address, queue: queue, block: block)
                state.withLock {
                    $0.removals.append(listener.identity)
                    $0.listener = nil
                }
                return removeStatus
            }
        )
    }

    func notify<Value: Sendable>(after: @escaping @Sendable () -> Value) async throws -> Value {
        let listener = try #require(state.withLock { $0.listener })
        return await withCheckedContinuation { done in
            listener.queue.async {
                let key = "audelin.microphone-hal-notification"
                let previous = Thread.current.threadDictionary[key]
                Thread.current.threadDictionary[key] = true
                defer { Thread.current.threadDictionary[key] = previous }
                var address = listener.address
                listener.block.value(1, &address)
                done.resume(returning: after())
            }
        }
    }
}

private final class CallbackLifetime: Sendable {}

// Accessed only before and after the awaited registration call.
private final class WeakCallbackLifetime: @unchecked Sendable {
    weak var value: CallbackLifetime?
}

