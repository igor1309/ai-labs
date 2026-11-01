@testable import CoreAudioProcesses
import CoreFoundation
import Foundation
import Synchronization
import Testing

struct NativeCoreAudioBindingTests {

    @Test(arguments: [UInt32(0), 1, 7])
    func inputRunningReadsTheNativeFlag(value: UInt32) {

        let native = NativeAudioSpy(words: [value])
        let binding = CoreAudioBinding(native: native.calls)

        #expect(binding.isRunningInput(42) == (value != 0))
        #expect(native.reads == [PropertyRequest(object: 42, selector: "piri", size: 4)])
    }

    @Test(arguments: [false, true])
    func pidReadsTheNativeProperty(refused: Bool) {

        let native = NativeAudioSpy(words: [401], status: refused ? -1 : 0)
        let binding = CoreAudioBinding(native: native.calls)

        #expect(binding.pid(of: 42) == (refused ? nil : 401))
        #expect(native.reads == [PropertyRequest(object: 42, selector: "ppid", size: 4)])
    }

    @Test func aRefusedInputReadIsNotRunning() {

        let native = NativeAudioSpy(words: [1], status: -1)
        #expect(!CoreAudioBinding(native: native.calls).isRunningInput(42))
        #expect(native.reads == [PropertyRequest(object: 42, selector: "piri", size: 4)])
    }

    @Test(arguments: ["us.zoom.xos", ""])
    func bundleIDReadsTheNativeString(value: String) {

        let native = NativeAudioSpy(words: [], string: value)
        let binding = CoreAudioBinding(native: native.calls)

        #expect(binding.bundleID(of: 42) == (value.isEmpty ? nil : value))
        #expect(native.reads == [PropertyRequest(object: 42, selector: "pbid", size: UInt32(MemoryLayout<CFString?>.size))])
    }

    @Test func nameReadsTheNativeNameForABundledProcess() {

        let native = NativeAudioSpy(words: [], string: "Zoom")
        let binding = CoreAudioBinding(native: native.calls)

        #expect(binding.name(of: 42) == "Zoom")
        #expect(native.reads == [
            PropertyRequest(object: 42, selector: "pbid", size: UInt32(MemoryLayout<CFString?>.size)),
            PropertyRequest(object: 42, selector: "lnam", size: UInt32(MemoryLayout<CFString?>.size)),
        ])
    }

    @Test func aRefusedBundleIDReadIsAbsent() {

        let native = NativeAudioSpy(words: [], status: -1)
        #expect(CoreAudioBinding(native: native.calls).bundleID(of: 42) == nil)
        #expect(native.reads == [PropertyRequest(object: 42, selector: "pbid", size: UInt32(MemoryLayout<CFString?>.size))])
    }

    @Test(arguments: [[UInt32](), [7], [7, 9]])
    func processObjectsReadTheNativeList(objects: [UInt32]) throws {

        let native = NativeAudioSpy(words: objects)
        let binding = CoreAudioBinding(native: native.calls)

        #expect(try binding.processObjects() == objects)
        #expect(native.sizes == [PropertyRequest(object: 1, selector: "prs#", size: 0)])
        #expect(native.reads == (objects.isEmpty ? [] : [PropertyRequest(object: 1, selector: "prs#", size: UInt32(objects.count * 4))]))
    }

    @Test(arguments: [true, false])
    func aRefusedNativeListThrows(atSize: Bool) {

        let native = NativeAudioSpy(words: [7], status: atSize ? 0 : -1, sizeStatus: atSize ? -1 : 0)
        let binding = CoreAudioBinding(native: native.calls)

        #expect(throws: NSError(domain: NSOSStatusErrorDomain, code: -1)) { try binding.processObjects() }
    }

    @Test(arguments: [
        (["pir?"], 1), (["pdv#"], 1), (["piri"], 0), (["piro"], 0),
        (["ppid"], 0), (["prs#"], 0), (["piri", "pdv#"], 1),
        (["pir?", "pdv#"], 1), ([], 0),
    ])
    func processNotificationsRegisterAndFilter(selectors: [String], expected: Int) async throws {

        let native = NativeAudioSpy(words: [])
        let binding = CoreAudioBinding(native: native.calls)
        let count = Mutex(0)
        let listener = try binding.onProcessChange(42) { count.withLock { $0 += 1 } }
        let registration = try #require(native.registration)
        #expect(registration == PropertyRequest(object: 42, selector: "****", scope: "****", element: UInt32.max))

        native.notify(selectors)
        #expect(count.withLock { $0 } == expected)
        listener.cancel()
        listener.cancel()
        native.notify(["pir?", "pdv#"])
        #expect(count.withLock { $0 } == expected)
        var removals = native.removals.makeAsyncIterator()
        #expect(await removals.next() == registration)
        // Removal is queued before this barrier, so it has completed once it returns.
        await native.drainQueue()
        #expect(native.removedCount == 1)
    }

    @Test(arguments: [(["prs#"], 1), (["pir?"], 0), (["pdv#"], 0), (["ppid", "prs#"], 1)])
    func listNotificationsRegisterAndFilter(selectors: [String], expected: Int) async throws {

        let native = NativeAudioSpy(words: [])
        let count = Mutex(0)
        let listener = try CoreAudioBinding(native: native.calls).onProcessListChange { count.withLock { $0 += 1 } }
        let registration = try #require(native.registration)
        #expect(registration == PropertyRequest(object: 1, selector: "prs#"))

        native.notify(selectors)
        #expect(count.withLock { $0 } == expected)
        listener.cancel()
        native.notify(["prs#"])
        #expect(count.withLock { $0 } == expected)
        var removals = native.removals.makeAsyncIterator()
        #expect(await removals.next() == registration)
    }

    @Test(arguments: [false, true])
    func aRefusedListenerThrows(process: Bool) {

        let native = NativeAudioSpy(words: [], status: -1)
        let binding = CoreAudioBinding(native: native.calls)

        #expect(throws: NSError(domain: NSOSStatusErrorDomain, code: -1)) {
            if process { _ = try binding.onProcessChange(42) {} }
            else { _ = try binding.onProcessListChange {} }
        }
        #expect(native.removedCount == 0)
    }
}

private struct PropertyRequest: Equatable, Sendable {

    var object: UInt32
    var selector: UInt32
    var scope: UInt32
    var element: UInt32
    var size: UInt32

    init(object: UInt32, selector: String, scope: String = "glob", element: UInt32 = 0, size: UInt32 = 0) {

        self.object = object
        self.selector = fourCC(selector)
        self.scope = fourCC(scope)
        self.element = element
        self.size = size
    }

    init(_ object: UInt32, _ address: CoreAudioCalls.Address, _ size: UInt32 = 0) {

        self.object = object
        selector = address.mSelector
        scope = address.mScope
        element = address.mElement
        self.size = size
    }
}

private func fourCC(_ string: String) -> UInt32 {

    string.utf8.reduce(0) { ($0 << 8) | UInt32($1) }
}

private final class NativeAudioSpy: Sendable {

    private struct State {

        var reads: [PropertyRequest] = []
        var sizes: [PropertyRequest] = []
        var registration: PropertyRequest?
        var listener: ListenerBlock?
        var queue: DispatchQueue?
        var removedCount = 0
    }

    private let state = Mutex(State())
    private let words: [UInt32]
    private let string: String?
    private let status: Int32
    private let sizeStatus: Int32
    let removals: AsyncStream<PropertyRequest>
    private let removed: AsyncStream<PropertyRequest>.Continuation

    init(words: [UInt32], string: String? = nil, status: Int32 = 0, sizeStatus: Int32 = 0) {

        self.words = words
        self.string = string
        self.status = status
        self.sizeStatus = sizeStatus
        (removals, removed) = AsyncStream.makeStream()
    }

    var reads: [PropertyRequest] {

        state.withLock { $0.reads }
    }

    var sizes: [PropertyRequest] {

        state.withLock { $0.sizes }
    }

    var registration: PropertyRequest? {

        state.withLock { $0.registration }
    }

    var removedCount: Int {

        state.withLock { $0.removedCount }
    }

    var calls: CoreAudioCalls {

        CoreAudioCalls(
            dataSize: { [self] object, address, size in
                state.withLock { $0.sizes.append(PropertyRequest(object, address, size)) }
                size = UInt32(words.count * 4)
                return sizeStatus
            },
            data: { [self] object, address, size, buffer in
                state.withLock { $0.reads.append(PropertyRequest(object, address, size)) }
                guard status == 0 else { return status }
                if let string {
                    let value = CFStringCreateWithCString(nil, string, CFStringBuiltInEncodings.UTF8.rawValue)!
                    buffer.storeBytes(of: Unmanaged.passRetained(value), as: Unmanaged<CFString>.self)
                } else {
                    words.withUnsafeBytes { bytes in buffer.copyMemory(from: bytes.baseAddress!, byteCount: bytes.count) }
                    size = UInt32(words.count * 4)
                }
                return 0
            },
            addListener: { [self] object, address, queue, callback in
                state.withLock {
                    $0.registration = PropertyRequest(object, address)
                    $0.queue = queue
                    $0.listener = callback
                }
                return status
            },
            removeListener: { [self] object, address, _, _ in
                state.withLock { $0.removedCount += 1 }
                removed.yield(PropertyRequest(object, address))
                return 0
            }
        )
    }

    func notify(_ selectors: [String]) {

        let addresses = selectors.map {
            CoreAudioCalls.Address(mSelector: fourCC($0), mScope: fourCC("glob"), mElement: 0)
        }
        let block = state.withLock { $0.listener }
        addresses.withUnsafeBufferPointer { buffer in
            // An empty notification still supplies a valid address pointer.
            var empty = CoreAudioCalls.Address()
            if let base = buffer.baseAddress { block?.value(UInt32(buffer.count), base) }
            else { block?.value(0, &empty) }
        }
    }

    func drainQueue() async {

        let queue = state.withLock { $0.queue }
        await withCheckedContinuation { continuation in
            queue!.async { continuation.resume() }
        }
    }
}
