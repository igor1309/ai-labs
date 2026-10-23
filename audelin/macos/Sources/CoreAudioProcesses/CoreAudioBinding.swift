import CoreAudio
import Darwin
import Foundation
import Synchronization

/// The process binding over Core Audio's own objects. Opens no audio device.
public struct CoreAudioBinding: ProcessBinding {

    private let queue = DispatchQueue(label: "audelin.core-audio-processes")

    public init() {}

    public func processObjects() throws -> [ProcessObject] {

        let system = AudioObjectID(kAudioObjectSystemObject)
        var address = address(kAudioHardwarePropertyProcessObjectList)
        var size: UInt32 = 0
        try check(AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size))
        guard size > 0 else { return [] }
        var objects = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        let status = objects.withUnsafeMutableBytes { buffer in
            AudioObjectGetPropertyData(system, &address, 0, nil, &size, buffer.baseAddress!)
        }
        try check(status)
        return Array(objects.prefix(Int(size) / MemoryLayout<AudioObjectID>.size))
    }

    public func pid(of object: ProcessObject) -> Int32? {

        var address = address(kAudioProcessPropertyPID)
        var pid: pid_t = 0
        var size = UInt32(MemoryLayout<pid_t>.size)
        guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, &pid) == noErr else { return nil }
        return pid
    }

    public func bundleID(of object: ProcessObject) -> String? {

        string(object, kAudioProcessPropertyBundleID)
    }

    public func name(of object: ProcessObject) -> String {

        if bundleID(of: object) != nil, let name = string(object, kAudioObjectPropertyName) { return name }
        guard let pid = pid(of: object) else { return "" }
        var path = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let count = path.withUnsafeMutableBytes { proc_pidpath(pid, $0.baseAddress, UInt32($0.count)) }
        if count > 0 {
            let bytes = path.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }
            return URL(fileURLWithPath: String(decoding: bytes, as: UTF8.self)).lastPathComponent
        }
        return string(object, kAudioObjectPropertyName) ?? "pid \(pid)"
    }

    public func isRunningInput(_ object: ProcessObject) -> Bool {

        var address = address(kAudioProcessPropertyIsRunningInput)
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr && value != 0
    }

    public func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation {

        try listen(
            AudioObjectID(kAudioObjectSystemObject), selector: kAudioHardwarePropertyProcessObjectList,
            notifying: [kAudioHardwarePropertyProcessObjectList], changed
        )
    }

    public func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation {

        try listen(
            object, selector: kAudioObjectPropertySelectorWildcard,
            notifying: [kAudioProcessPropertyIsRunning, kAudioProcessPropertyDevices], changed
        )
    }

    private func listen(
        _ object: AudioObjectID, selector: AudioObjectPropertySelector,
        notifying selectors: Set<AudioObjectPropertySelector>, _ changed: @escaping @Sendable () -> Void
    ) throws -> Cancellation {

        let active = ListenerState()
        var address = address(selector)
        if selector == kAudioObjectPropertySelectorWildcard {
            address.mScope = kAudioObjectPropertyScopeWildcard
            address.mElement = kAudioObjectPropertyElementWildcard
        }
        let block = ListenerBlock { count, addresses in
            guard active.enabled.withLock({ $0 }),
                  (0..<Int(count)).contains(where: { selectors.contains(addresses[$0].mSelector) }) else { return }
            changed()
        }
        try check(AudioObjectAddPropertyListenerBlock(object, &address, queue, block.value))
        let registeredAddress = address
        return Cancellation { [queue] in
            let remove = active.enabled.withLock { enabled in
                let wasEnabled = enabled
                enabled = false
                return wasEnabled
            }
            guard remove else { return }
            // Removal runs behind callbacks so cancellation never waits for one.
            queue.async {
                var address = registeredAddress
                AudioObjectRemovePropertyListenerBlock(object, &address, queue, block.value)
            }
        }
    }

    private func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {

        AudioObjectPropertyAddress(
            mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    private func string(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {

        var address = address(selector)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<CFString?>.size)
        guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr,
              let string = value?.takeRetainedValue() as String?, !string.isEmpty else { return nil }
        return string
    }

    private func check(_ status: OSStatus) throws {

        if status != noErr { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
}

private final class ListenerState: Sendable {

    let enabled = Mutex(true)
}

// The native block type has no Sendable annotation; its captures are locked.
private struct ListenerBlock: @unchecked Sendable {

    let value: AudioObjectPropertyListenerBlock

    init(_ value: @escaping @Sendable (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void) {

        self.value = value
    }
}
