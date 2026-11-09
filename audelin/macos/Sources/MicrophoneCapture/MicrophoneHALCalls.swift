import CoreAudio
import Dispatch

// Native blocks lack Sendable; the callback captures only immutable handlers.
struct MicrophoneListenerBlock: @unchecked Sendable {

    // Removal requires the same native block object used for registration.
    let value: @convention(block) (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void
}

struct MicrophoneHALCalls: Sendable {

    typealias Address = AudioObjectPropertyAddress

    var read: @Sendable (UInt32, inout Address, UInt32, UnsafeRawPointer?, inout UInt32, UnsafeMutableRawPointer) -> Int32
    var addListener: @Sendable (UInt32, inout Address, DispatchQueue, MicrophoneListenerBlock) -> Int32
    var removeListener: @Sendable (UInt32, inout Address, DispatchQueue, MicrophoneListenerBlock) -> Int32

    static let system = MicrophoneHALCalls(
        read: { AudioObjectGetPropertyData($0, &$1, $2, $3, &$4, $5) },
        addListener: { AudioObjectAddPropertyListenerBlock($0, &$1, $2, $3.value) },
        removeListener: { AudioObjectRemovePropertyListenerBlock($0, &$1, $2, $3.value) }
    )
}
