import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import SystemAudioCapture

struct NativeCaptureBindingTests {

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
        #expect(calls.state.withLock { $0.events } == ["create tap", "start", "write", "stop", "destroy tap"])
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

private final class RecordingCaptureCalls: Sendable {

    struct State {

        var translated: [Int32] = []
        var created: [TapSnapshot] = []
        var written: [TapSnapshot] = []
        var events: [String] = []
        var missing: Int32?
        var writeStatus: Int32 = 0
    }

    let state = Mutex(State())

    var native: CoreAudioCalls {

        CoreAudioCalls(
            createTap: { [self] description, tap in
                state.withLock {
                    $0.created.append(TapSnapshot(description))
                    $0.events.append("create tap")
                }
                tap = 11
                return noErr
            },
            destroyTap: { [self] tap in
                #expect(tap == 11)
                state.withLock { $0.events.append("destroy tap") }
                return noErr
            },
            createDevice: { _, device in device = 22; return noErr },
            destroyDevice: { _ in noErr },
            read: { [self] object, address, qualifierSize, qualifier, size, data in
                if address.mSelector == kAudioHardwarePropertyTranslatePIDToProcessObject {
                    #expect(object == kAudioObjectSystemObject)
                    #expect(qualifierSize == MemoryLayout<Int32>.size)
                    let pid = qualifier!.load(as: Int32.self)
                    let process = state.withLock {
                        $0.translated.append(pid)
                        return $0.missing == pid ? UInt32(0) : UInt32(pid + 100)
                    }
                    data.storeBytes(of: process, as: UInt32.self)
                } else {
                    #expect(object == 11 && address.mSelector == kAudioTapPropertyFormat)
                    var format = AudioStreamBasicDescription()
                    format.mSampleRate = 48_000
                    format.mFormatID = kAudioFormatLinearPCM
                    format.mFormatFlags = kAudioFormatFlagIsFloat
                    format.mBitsPerChannel = 32
                    format.mChannelsPerFrame = 1
                    data.storeBytes(of: format, as: AudioStreamBasicDescription.self)
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
            createIO: { io, _, _ in io = { _, _, _, _, _, _, _ in noErr }; return noErr },
            removeIO: { _, _ in noErr },
            start: { [self] _, _ in state.withLock { $0.events.append("start") }; return noErr },
            stop: { [self] _, _ in state.withLock { $0.events.append("stop") }; return noErr },
            addListener: { _, _, _, _ in noErr },
            removeListener: { _, _, _, _ in noErr }
        )
    }
}
