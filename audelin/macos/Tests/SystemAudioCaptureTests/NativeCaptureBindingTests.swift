import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import SystemAudioCapture

struct NativeCaptureBindingTests {

    @Test func nativeBuffersCarryTheRateReadDuringIO() async throws {

        let calls = RecordingCaptureCalls()
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        try calls.deliver(rate: 48_000)
        calls.state.withLock { $0.rate = 24_000 }
        try calls.deliver(rate: 24_000)
        capture.stop()
        let pieces = try await drain(capture)
        #expect(pieces.map(\.sampleRate) == [48_000, 24_000])
        try expectTone(pieces, pid: 10)
    }

    @Test(arguments: [false, true])
    func nativeFormatFailuresKeepEarlierAudio(readRefused: Bool) async throws {

        let calls = RecordingCaptureCalls()
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        try calls.deliver(rate: 48_000)
        calls.state.withLock {
            if readRefused { $0.refuse = "format" } else { $0.rate = 0 }
        }
        try calls.deliver(rate: 48_000)
        capture.stop()
        var pieces: [AudioPiece] = []
        var failure: (any Error)?
        do {
            for try await piece in capture.audio { pieces.append(piece) }
        } catch { failure = error }
        let error = try #require(failure)
        if readRefused {
            #expect((error as NSError).domain == NSOSStatusErrorDomain)
            #expect((error as NSError).code == -50)
        } else {
            #expect(error as? CaptureError == .unsupportedFormat)
        }
        #expect(pieces.count == 1)
        try expectTone(pieces, pid: 10)
        #expect(calls.state.withLock { $0.released == Array($0.made.reversed()) })
    }

    @Test func nativeAggregateContainsOnlyItsPrivateManualTap() async throws {

        let calls = RecordingCaptureCalls()
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        let aggregate = try #require(calls.state.withLock { $0.aggregates.first?.value })
        let tap = try #require(calls.state.withLock { $0.created.first })
        #expect(aggregate[kAudioAggregateDeviceIsPrivateKey] as? Bool == true)
        #expect(aggregate[kAudioAggregateDeviceTapAutoStartKey] as? Bool == false)
        let taps = try #require(aggregate[kAudioAggregateDeviceTapListKey] as? [[String: String]])
        #expect(taps == [[kAudioSubTapUIDKey: tap.uuid.uuidString]])
        #expect(aggregate[kAudioAggregateDeviceSubDeviceListKey] == nil)
        #expect(aggregate[kAudioAggregateDeviceMainSubDeviceKey] == nil)
    }

    @Test(arguments: StopNotification.allCases)
    func nativeStopListenerReportsOnlyStoppedDevices(notification: StopNotification) throws {

        let calls = RecordingCaptureCalls()
        let binding = CoreAudioBinding(native: calls.native)
        let stops = Mutex(0)
        let watch = try binding.watchDevice(22) { stops.withLock { $0 += 1 } }
        defer { binding.unwatchDevice(22, watch) }
        let registration = try #require(calls.state.withLock { $0.listener })
        calls.state.withLock {
            $0.propertyValue = notification.value
            $0.propertyStatus = notification == .failedRead ? -50 : noErr
        }
        if notification == .afterUnwatch { binding.unwatchDevice(22, watch) }
        calls.fire([notification.selector], through: registration)
        #expect(stops.withLock { $0 } == (notification.reportsStop ? 1 : 0))
    }

    @Test func nativeStopReleasesEveryHandleInReverseOrder() async throws {

        let calls = RecordingCaptureCalls()
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        capture.stop()
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        let resources = calls.state.withLock { ($0.made, $0.released) }
        #expect(resources.0.count == 5)
        #expect(resources.1 == Array(resources.0.reversed()))
        #expect(calls.state.withLock { $0.events.suffix(5) } == ["stop", "unwatch", "remove io", "destroy device", "destroy tap"])
    }

    @Test(arguments: ["tap", "device", "format", "io", "watch", "start"])
    func eachRefusedNativeStartingStepReleasesOnlyItsHandles(step: String) {

        let calls = RecordingCaptureCalls()
        calls.state.withLock { $0.refuse = step }
        #expect(throws: NSError(domain: NSOSStatusErrorDomain, code: -50)) {
            _ = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        }
        let steps = ["tap", "device", "format", "io", "watch", "start"]
        let index = steps.firstIndex(of: step)!
        let resources = calls.state.withLock { ($0.made, $0.released) }
        #expect(resources.0.count == [0, 1, 2, 2, 3, 4][index])
        #expect(resources.1 == Array(resources.0.reversed()))
        let releases = ["unwatch", "remove io", "destroy device", "destroy tap"]
        #expect(calls.state.withLock { $0.events } == Array(steps.prefix(index + 1)) + Array(releases.suffix(resources.0.count)))
    }

    @Test(arguments: [ProcessSelection.only([10, 20]), .allExcept([30, 40])])
    func nativeTapDescriptionTranslatesEveryProcess(selection: ProcessSelection) throws {

        let calls = RecordingCaptureCalls()
        let binding = CoreAudioBinding(native: calls.native)
        let tap = try binding.createTap(TapRequest(selection: selection, mono: true, unmuted: true, isPrivate: true))
        defer { binding.destroyTap(tap) }
        let description = try #require(calls.state.withLock { $0.created.first })
        let pids: [Int32]
        let exclusive: Bool
        switch selection {
        case .only(let named): pids = named; exclusive = false
        case .allExcept(let excluded): pids = excluded; exclusive = true
        }
        #expect(calls.state.withLock { $0.translated } == pids)
        #expect(description.processes == pids.map { UInt32($0 + 100) })
        #expect(description.exclusive == exclusive)
        #expect(description.mixdown && description.mono && description.unmuted && description.isPrivate)
    }

    @Test func runningRenameWritesTheNativeTapDescription() async throws {

        let calls = RecordingCaptureCalls()
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10, 20]))
        try capture.name(.allExcept([30, 40]))
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        let created = try #require(calls.state.withLock { $0.created.first })
        let written = try #require(calls.state.withLock { $0.written.first })
        #expect(written.uuid == created.uuid)
        #expect(written.processes == [130, 140])
        #expect(written.exclusive && written.mixdown && written.mono && written.unmuted && written.isPrivate)
        #expect(calls.state.withLock { $0.events } == ["tap", "device", "format", "io", "watch", "start", "write", "stop", "unwatch", "remove io", "destroy device", "destroy tap"])
    }

    @Test func aPIDWithoutANativeProcessObjectIsRefused() throws {

        let calls = RecordingCaptureCalls()
        calls.state.withLock { $0.missing = 20 }
        let binding = CoreAudioBinding(native: calls.native)
        #expect(throws: CaptureError.processUnavailable(20)) {
            _ = try binding.createTap(TapRequest(selection: .only([10, 20]), mono: true, unmuted: true, isPrivate: true))
        }
        #expect(calls.state.withLock { $0.created.isEmpty })
    }

    @Test func aRefusedNativeDescriptionWriteIsThrown() async throws {

        let calls = RecordingCaptureCalls()
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        calls.state.withLock { $0.writeStatus = -50 }
        do {
            try capture.name(.only([20, 30]))
            Issue.record("The native write must be refused")
        } catch {
            #expect((error as NSError).domain == NSOSStatusErrorDomain)
            #expect((error as NSError).code == -50)
        }
        capture.stop()
        #expect(try await drain(capture).isEmpty)
    }
}

enum StopNotification: CaseIterable, Sendable {

    case abnormal, notAlive, notRunning, failedRead, unrelated, afterUnwatch, alive, running

    var selector: AudioObjectPropertySelector {

        switch self {
        case .abnormal, .afterUnwatch: kAudioDevicePropertyIOStoppedAbnormally
        case .notAlive, .failedRead, .alive: kAudioDevicePropertyDeviceIsAlive
        case .notRunning, .running: kAudioDevicePropertyDeviceIsRunning
        case .unrelated: kAudioDevicePropertyNominalSampleRate
        }
    }

    var value: UInt32 { self == .notAlive || self == .notRunning ? 0 : 1 }
    var reportsStop: Bool { [.abnormal, .notAlive, .notRunning, .failedRead].contains(self) }
}

private struct TapSnapshot: Sendable {

    let uuid: UUID
    let processes: [UInt32]
    let exclusive: Bool
    let mixdown: Bool
    let mono: Bool
    let unmuted: Bool
    let isPrivate: Bool

    init(_ description: CATapDescription) {

        uuid = description.uuid
        processes = description.processes
        exclusive = description.isExclusive
        mixdown = description.isMixdown
        mono = description.isMono
        unmuted = description.muteBehavior == .unmuted
        isPrivate = description.isPrivate
    }
}

private struct ListenerIdentity: Equatable, Sendable {

    let selector: UInt32
    let scope: UInt32
    let element: UInt32
    let queue: ObjectIdentifier
    let block: UInt

    init(
        _ address: AudioObjectPropertyAddress, _ queue: DispatchQueue,
        _ block: @escaping @convention(block) (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void
    ) {

        selector = address.mSelector
        scope = address.mScope
        element = address.mElement
        self.queue = ObjectIdentifier(queue)
        self.block = unsafeBitCast(block, to: UInt.self)
    }
}

private enum NativeResource: Equatable, Sendable {

    case tap(UInt32)
    case device(UInt32)
    case io(UInt32, UInt)
    case listener(UInt32, ListenerIdentity)
    case running(UInt32, UInt)
}

// The dictionary is an immutable snapshot of the native request.
private struct AggregateSnapshot: @unchecked Sendable {

    let value: NSDictionary
}

// Retain the native block until removal so its recorded address cannot be reused.
private struct ListenerRegistration: @unchecked Sendable {

    let queue: DispatchQueue
    let block: @convention(block) (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void
}

private final class RecordingCaptureCalls: Sendable {

    struct State {

        var translated: [Int32] = []
        var created: [TapSnapshot] = []
        var written: [TapSnapshot] = []
        var aggregates: [AggregateSnapshot] = []
        var events: [String] = []
        var made: [NativeResource] = []
        var released: [NativeResource] = []
        var listener: ListenerRegistration?
        var io: IOBlock?
        var missing: Int32?
        var refuse: String?
        var propertyValue: UInt32 = 1
        var propertyStatus: Int32 = 0
        var writeStatus: Int32 = 0
        var rate = 48_000.0
    }

    let state = Mutex(State())

    func deliver(rate: Double) throws {

        let block = try #require(state.withLock { $0.io })
        var samples = (0..<Int(rate / 100)).map { tone(10, frame: $0, rate: rate) }
        samples.withUnsafeMutableBytes { bytes in
            var input = AudioBufferList(
                mNumberBuffers: 1,
                mBuffers: AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(bytes.count), mData: bytes.baseAddress)
            )
            var output = input
            var timestamp = AudioTimeStamp()
            withUnsafePointer(to: &timestamp) { time in
                block.value(time, &input, time, &output, time)
            }
        }
    }

    /// Drains the same queue native notifications use, including stale blocks.
    func fire(_ selectors: [AudioObjectPropertySelector], through registration: ListenerRegistration) {

        registration.queue.sync {
            let addresses = selectors.map {
                AudioObjectPropertyAddress(
                    mSelector: $0, mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMain
                )
            }
            addresses.withUnsafeBufferPointer {
                registration.block(UInt32($0.count), $0.baseAddress!)
            }
        }
    }

    private func attempt(_ step: String) -> OSStatus {

        state.withLock {
            $0.events.append(step)
            return $0.refuse == step ? -50 : noErr
        }
    }

    private func release(_ resource: NativeResource, _ event: String) -> OSStatus {

        state.withLock {
            $0.events.append(event)
            $0.released.append(resource)
        }
        return noErr
    }

    var native: CoreAudioCalls {

        CoreAudioCalls(
            createTap: { [self] description, tap in
                let status = attempt("tap")
                guard status == noErr else { return status }
                tap = 11
                state.withLock {
                    $0.created.append(TapSnapshot(description))
                    $0.made.append(.tap(tap))
                }
                return noErr
            },
            destroyTap: { [self] in release(.tap($0), "destroy tap") },
            createDevice: { [self] composition, device in
                let status = attempt("device")
                guard status == noErr else { return status }
                device = 22
                state.withLock {
                    $0.aggregates.append(AggregateSnapshot(value: composition as NSDictionary))
                    $0.made.append(.device(device))
                }
                return noErr
            },
            destroyDevice: { [self] in release(.device($0), "destroy device") },
            read: { [self] object, address, qualifierSize, qualifier, size, data in
                switch address.mSelector {
                case kAudioHardwarePropertyTranslatePIDToProcessObject:
                    #expect(object == kAudioObjectSystemObject)
                    #expect(qualifierSize == MemoryLayout<Int32>.size)
                    let pid = qualifier!.load(as: Int32.self)
                    let process = state.withLock {
                        $0.translated.append(pid)
                        return $0.missing == pid ? UInt32(0) : UInt32(pid + 100)
                    }
                    data.storeBytes(of: process, as: UInt32.self)
                case kAudioTapPropertyFormat:
                    #expect(object == 11)
                    let status = attempt("format")
                    guard status == noErr else { return status }
                    var format = AudioStreamBasicDescription()
                    format.mSampleRate = state.withLock { $0.rate }
                    format.mFormatID = kAudioFormatLinearPCM
                    format.mFormatFlags = kAudioFormatFlagIsFloat
                    format.mBitsPerChannel = 32
                    format.mChannelsPerFrame = 1
                    data.storeBytes(of: format, as: AudioStreamBasicDescription.self)
                case kAudioDevicePropertyDeviceIsAlive, kAudioDevicePropertyDeviceIsRunning:
                    #expect(object == 22)
                    let result = state.withLock { ($0.propertyValue, $0.propertyStatus) }
                    data.storeBytes(of: result.0, as: UInt32.self)
                    return result.1
                default:
                    Issue.record("Unexpected native property read")
                }
                return noErr
            },
            write: { [self] tap, address, size, data in
                #expect(tap == 11 && address.mSelector == kAudioTapPropertyDescription)
                #expect(size == MemoryLayout<UnsafeMutableRawPointer>.size)
                let pointer = data.load(as: UnsafeMutableRawPointer.self)
                let description = Unmanaged<CATapDescription>.fromOpaque(pointer).takeUnretainedValue()
                return state.withLock {
                    $0.events.append("write")
                    $0.written.append(TapSnapshot(description))
                    return $0.writeStatus
                }
            },
            createIO: { [self] io, device, block in
                let status = attempt("io")
                guard status == noErr else { return status }
                let handle: AudioDeviceIOProcID = { _, _, _, _, _, _, _ in noErr }
                io = handle
                state.withLock {
                    $0.io = block
                    $0.made.append(.io(device, unsafeBitCast(handle, to: UInt.self)))
                }
                return noErr
            },
            removeIO: { [self] device, io in
                state.withLock { $0.io = nil }
                return release(.io(device, unsafeBitCast(io, to: UInt.self)), "remove io")
            },
            start: { [self] device, io in
                let status = attempt("start")
                guard status == noErr else { return status }
                state.withLock { $0.made.append(.running(device, unsafeBitCast(io, to: UInt.self))) }
                return noErr
            },
            stop: { [self] in release(.running($0, unsafeBitCast($1, to: UInt.self)), "stop") },
            addListener: { [self] device, address, queue, block in
                let status = attempt("watch")
                guard status == noErr else { return status }
                let registration = ListenerRegistration(queue: queue, block: block.value)
                state.withLock {
                    $0.listener = registration
                    $0.made.append(.listener(device, ListenerIdentity(address, queue, registration.block)))
                }
                return noErr
            },
            removeListener: { [self] device, address, queue, block in
                let identity = ListenerIdentity(address, queue, block.value)
                state.withLock { $0.listener = nil }
                return release(.listener(device, identity), "unwatch")
            }
        )
    }
}
