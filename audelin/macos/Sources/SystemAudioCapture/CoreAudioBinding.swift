import CoreAudio
import Foundation
import Synchronization

/// A process tap and a private aggregate device over the native audio API.
public final class CoreAudioBinding: CaptureBinding, Sendable {

    private let state = Mutex(NativeState())
    private let queue = DispatchQueue(label: "audelin.system-audio-events")

    private let native: CoreAudioCalls

    public convenience init() {

        self.init(native: .system)
    }

    init(native: CoreAudioCalls) {

        self.native = native
    }

    public func createTap(_ request: TapRequest) throws -> UInt32 {

        let uuid = UUID()
        let description = try description(request, uuid: uuid)
        var tap: AudioObjectID = 0
        try check(native.createTap(description, &tap))
        state.withLock { $0.taps[tap] = uuid }
        return tap
    }

    public func updateTap(_ tap: UInt32, _ request: TapRequest) throws {

        guard let uuid = state.withLock({ $0.taps[tap] }) else { throw CaptureError.stopped }
        let description = try description(request, uuid: uuid)
        var reference = Unmanaged.passUnretained(description).toOpaque()
        var address = address(kAudioTapPropertyDescription)
        try withExtendedLifetime(description) {
            try check(native.write(
                tap, &address, UInt32(MemoryLayout<UnsafeMutableRawPointer>.size), &reference
            ))
        }
    }

    public func destroyTap(_ tap: UInt32) {

        _ = native.destroyTap(tap)
        _ = state.withLock { $0.taps.removeValue(forKey: tap) }
    }

    public func createDevice(_ request: DeviceRequest) throws -> UInt32 {

        guard let uuid = state.withLock({ $0.taps[request.tap] }) else { throw CaptureError.stopped }
        let composition: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Audelin system audio",
            kAudioAggregateDeviceUIDKey: "audelin-system-audio-\(uuid.uuidString)",
            kAudioAggregateDeviceIsPrivateKey: request.isPrivate,
            kAudioAggregateDeviceTapAutoStartKey: request.autoStart,
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: uuid.uuidString]],
        ]
        var device: AudioObjectID = 0
        try check(native.createDevice(composition as CFDictionary, &device))
        state.withLock { $0.devices[device] = request.tap }
        return device
    }

    public func destroyDevice(_ device: UInt32) {

        _ = native.destroyDevice(device)
        _ = state.withLock { $0.devices.removeValue(forKey: device) }
    }

    public func sampleRate(_ tap: UInt32) throws -> Double {

        var format = AudioStreamBasicDescription()
        var address = address(kAudioTapPropertyFormat)
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        try check(native.read(tap, &address, 0, nil, &size, &format))
        guard format.mFormatID == kAudioFormatLinearPCM,
              format.mFormatFlags & kAudioFormatFlagIsFloat != 0,
              format.mFormatFlags & kAudioFormatFlagIsBigEndian == 0,
              format.mBitsPerChannel == 32, format.mChannelsPerFrame == 1,
              format.mSampleRate > 0 else { throw CaptureError.unsupportedFormat }
        return format.mSampleRate
    }

    public func installIO(_ device: UInt32, receive: @escaping @Sendable (Result<AudioPiece, any Error>) -> Void) throws -> UInt64 {

        guard let tap = state.withLock({ $0.devices[device] }) else { throw CaptureError.stopped }
        var io: AudioDeviceIOProcID?
        try check(native.createIO(&io, device, IOBlock { [self] _, input, _, _, _ in
            let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
            guard buffers.count == 1, let buffer = buffers.first,
                  buffer.mNumberChannels == 1, let data = buffer.mData else { return }
            do {
                let rate = try sampleRate(tap)
                let count = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
                let samples = Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: Float.self), count: count))
                receive(.success(AudioPiece(samples: samples, sampleRate: rate)))
            } catch {
                receive(.failure(error))
            }
        }))
        guard let io else { throw CaptureError.stopped }
        return state.withLock {
            $0.nextIO += 1
            $0.ios[$0.nextIO] = io
            return $0.nextIO
        }
    }

    public func removeIO(_ device: UInt32, _ io: UInt64) {

        guard let native = state.withLock({ $0.ios.removeValue(forKey: io) }) else { return }
        _ = self.native.removeIO(device, native)
    }

    public func watchDevice(_ device: UInt32, stopped: @escaping @Sendable () -> Void) throws -> UInt64 {

        let listener = DeviceListener()
        let native = self.native
        let block = ListenerBlock(value: { count, addresses in
            guard listener.active.withLock({ $0 }) else { return }
            for index in 0..<Int(count) {
                let selector = addresses[index].mSelector
                if selector == kAudioDevicePropertyIOStoppedAbnormally {
                    stopped()
                    return
                }
                if selector == kAudioDevicePropertyDeviceIsAlive || selector == kAudioDevicePropertyDeviceIsRunning {
                    var address = Self.property(selector)
                    var value: UInt32 = 0
                    var size = UInt32(MemoryLayout<UInt32>.size)
                    let status = native.read(device, &address, 0, nil, &size, &value)
                    if status != noErr || value == 0 {
                        stopped()
                        return
                    }
                }
            }
        })
        var address = Self.property(kAudioObjectPropertySelectorWildcard)
        address.mScope = kAudioObjectPropertyScopeWildcard
        address.mElement = kAudioObjectPropertyElementWildcard
        try check(native.addListener(device, &address, queue, block))
        return state.withLock {
            $0.nextWatch += 1
            $0.watches[$0.nextWatch] = NativeWatch(listener: listener, block: block, address: address)
            return $0.nextWatch
        }
    }

    public func unwatchDevice(_ device: UInt32, _ watch: UInt64) {

        guard let watch = state.withLock({ $0.watches.removeValue(forKey: watch) }) else { return }
        watch.listener.active.withLock { $0 = false }
        var address = watch.address
        _ = native.removeListener(device, &address, queue, watch.block)
    }

    public func startDevice(_ device: UInt32, _ io: UInt64) throws {

        guard let native = state.withLock({ $0.ios[io] }) else { throw CaptureError.stopped }
        try check(self.native.start(device, native))
    }

    public func stopDevice(_ device: UInt32, _ io: UInt64) {

        guard let native = state.withLock({ $0.ios[io] }) else { return }
        _ = self.native.stop(device, native)
    }

    private func description(_ request: TapRequest, uuid: UUID) throws -> CATapDescription {

        let pids: [Int32]
        let exclusive: Bool
        switch request.selection {
        case .only(let named): pids = named; exclusive = false
        case .allExcept(let excluded): pids = excluded; exclusive = true
        }
        let objects = try pids.map(processObject)
        let description = CATapDescription()
        description.uuid = uuid
        description.processes = objects
        description.isExclusive = exclusive
        description.isMixdown = true
        description.isMono = request.mono
        description.isPrivate = request.isPrivate
        description.muteBehavior = request.unmuted ? .unmuted : .muted
        return description
    }

    func processObject(_ pid: Int32) throws -> UInt32 {

        var pid = pid
        var object: AudioObjectID = 0
        var address = address(kAudioHardwarePropertyTranslatePIDToProcessObject)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        try check(native.read(
            AudioObjectID(kAudioObjectSystemObject), &address,
            UInt32(MemoryLayout<Int32>.size), &pid, &size, &object
        ))
        guard object != kAudioObjectUnknown else { throw CaptureError.processUnavailable(pid) }
        return object
    }

    private static func property(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {

        AudioObjectPropertyAddress(
            mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    private func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {

        Self.property(selector)
    }

    private func check(_ status: OSStatus) throws {

        if status != noErr { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
}

private struct NativeState {

    var devices: [UInt32: UInt32] = [:]
    var ios: [UInt64: AudioDeviceIOProcID] = [:]
    var nextIO: UInt64 = 0
    var taps: [UInt32: UUID] = [:]
    var watches: [UInt64: NativeWatch] = [:]
    var nextWatch: UInt64 = 0
}

private final class DeviceListener: Sendable {

    let active = Mutex(true)
}

private struct NativeWatch: Sendable {

    let listener: DeviceListener
    let block: ListenerBlock
    let address: AudioObjectPropertyAddress
}

// Native block types lack Sendable; their captured state is synchronized.
struct IOBlock: @unchecked Sendable {

    let value: AudioDeviceIOBlock
}

struct ListenerBlock: @unchecked Sendable {

    // Listener removal requires the same native block object used to register.
    let value: @convention(block) (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void
}

/// Native calls beneath tap translation and resource ownership.
struct CoreAudioCalls: Sendable {

    typealias Address = AudioObjectPropertyAddress

    var createTap: @Sendable (CATapDescription, inout UInt32) -> Int32
    var destroyTap: @Sendable (UInt32) -> Int32
    var createDevice: @Sendable (CFDictionary, inout UInt32) -> Int32
    var destroyDevice: @Sendable (UInt32) -> Int32
    var read: @Sendable (UInt32, inout Address, UInt32, UnsafeRawPointer?, inout UInt32, UnsafeMutableRawPointer) -> Int32
    var write: @Sendable (UInt32, inout Address, UInt32, UnsafeRawPointer) -> Int32
    var createIO: @Sendable (inout AudioDeviceIOProcID?, UInt32, IOBlock) -> Int32
    var removeIO: @Sendable (UInt32, AudioDeviceIOProcID) -> Int32
    var start: @Sendable (UInt32, AudioDeviceIOProcID) -> Int32
    var stop: @Sendable (UInt32, AudioDeviceIOProcID) -> Int32
    var addListener: @Sendable (UInt32, inout Address, DispatchQueue, ListenerBlock) -> Int32
    var removeListener: @Sendable (UInt32, inout Address, DispatchQueue, ListenerBlock) -> Int32

    static let system = CoreAudioCalls(
        createTap: { AudioHardwareCreateProcessTap($0, &$1) },
        destroyTap: { AudioHardwareDestroyProcessTap($0) },
        createDevice: { AudioHardwareCreateAggregateDevice($0, &$1) },
        destroyDevice: { AudioHardwareDestroyAggregateDevice($0) },
        read: { AudioObjectGetPropertyData($0, &$1, $2, $3, &$4, $5) },
        write: { AudioObjectSetPropertyData($0, &$1, 0, nil, $2, $3) },
        createIO: { AudioDeviceCreateIOProcIDWithBlock(&$0, $1, nil, $2.value) },
        removeIO: { AudioDeviceDestroyIOProcID($0, $1) },
        start: { AudioDeviceStart($0, $1) },
        stop: { AudioDeviceStop($0, $1) },
        addListener: { AudioObjectAddPropertyListenerBlock($0, &$1, $2, $3.value) },
        removeListener: { AudioObjectRemovePropertyListenerBlock($0, &$1, $2, $3.value) }
    )
}
