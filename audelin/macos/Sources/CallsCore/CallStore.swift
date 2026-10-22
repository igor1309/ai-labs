import CallDomain
import Foundation

/// The calls on disk, one folder per call, each known by the id in its
/// details rather than by its path.
public protocol CallStore: Sendable {
    /// Makes the call's folder, named from its start and `title`.
    func create(title: String, details: CallDetails) throws(CallStoreError) -> URL
    func list() throws(CallStoreError) -> [CallEntry]
    func folder(of call: CallID) -> URL?
    /// Gives the call a new title; its folder keeps the start in front.
    func rename(_ call: CallID, to title: String) throws(CallStoreError) -> URL
    /// Moves the call's folder to the macOS Trash and returns where it went.
    func trash(_ call: CallID) throws(CallStoreError) -> URL
    func save(_ details: CallDetails) throws(CallStoreError)
    /// Copies the call's folder into another calls folder. A failed copy
    /// leaves nothing there.
    func copy(_ call: CallID, to root: URL) throws(CallStoreError) -> CallCopy
    /// Deletes a copied call's source, once the copy matches it byte for byte.
    func deleteSource(after copy: CallCopy) throws(CallStoreError)
    /// The bytes of every file in the calls folder.
    func totalSize() throws(CallStoreError) -> Int
    /// Reports call folders added, renamed or removed, by anyone.
    func watch(_ onChange: @escaping @Sendable (CallChange) -> Void) -> CallWatch
}

public enum CallEntry: Equatable, Sendable {
    case call(StoredCall)
    /// A folder whose details are missing or damaged.
    case unreadable(folder: URL)

    public var call: StoredCall? {
        if case .call(let call) = self { call } else { nil }
    }
}

public struct StoredCall: Equatable, Sendable {
    public var details: CallDetails
    public var title: String
    public var folder: URL

    public init(details: CallDetails, title: String, folder: URL) {
        self.details = details
        self.title = title
        self.folder = folder
    }
}

public struct CallCopy: Equatable, Sendable {
    public var call: CallID
    public var source: URL
    public var target: URL

    public init(call: CallID, source: URL, target: URL) {
        self.call = call
        self.source = source
        self.target = target
    }
}

public enum CallChange: Equatable, Sendable {
    case changed(CallID)
    case removed(CallID)
}

/// A running watch; it stops when cancelled or released.
public final class CallWatch: Sendable {
    private let stop: @Sendable () -> Void

    public init(stop: @escaping @Sendable () -> Void) { self.stop = stop }

    public func cancel() { stop() }

    deinit { stop() }
}

public enum CallStoreError: Error, Equatable, Sendable {
    case notFound(CallID)
    case diskFull
    /// The copy does not match its source, which is kept.
    case copyDiffers
    case failed(String)
}
