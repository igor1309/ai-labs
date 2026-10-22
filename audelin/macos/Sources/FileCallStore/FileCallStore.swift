import CallDomain
import CallsCore
import Darwin
import Foundation

/// The calls folder on disk: one folder per call, its details in `meta.json`.
public final class FileCallStore: CallStore {
    public let root: URL

    public init(root: URL) { self.root = root }

    public func create(title: String, details: CallDetails) throws(CallStoreError) -> URL {
        let name = CallFolderName.make(start: details.start, title: title, taken: Set(try names()))
        let folder = root.appendingPathComponent(name)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        } catch {
            throw Self.storeError(error)
        }
        try write(details, in: folder)
        return folder
    }

    public func list() throws(CallStoreError) -> [CallEntry] {
        try names().map { name in
            let folder = root.appendingPathComponent(name)
            guard let details = Self.details(in: folder) else { return .unreadable(folder: folder) }
            return .call(StoredCall(details: details, title: CallFolderName.read(name).title, folder: folder))
        }
    }

    public func folder(of call: CallID) -> URL? {
        (try? list())?.lazy.compactMap(\.call).first { $0.details.id == call }?.folder
    }

    public func rename(_ call: CallID, to title: String) throws(CallStoreError) -> URL {
        let stored = try find(call)
        let taken = Set(try names()).subtracting([stored.folder.lastPathComponent])
        let renamed = root.appendingPathComponent(
            CallFolderName.make(start: stored.details.start, title: title, taken: taken))
        guard renamed.lastPathComponent != stored.folder.lastPathComponent else { return renamed }
        do {
            try FileManager.default.moveItem(at: stored.folder, to: renamed)
        } catch {
            throw Self.storeError(error)
        }
        return renamed
    }

    public func trash(_ call: CallID) throws(CallStoreError) -> URL {
        let folder = try find(call).folder
        var trashed: NSURL?
        do {
            try FileManager.default.trashItem(at: folder, resultingItemURL: &trashed)
        } catch {
            throw Self.storeError(error)
        }
        guard let trashed else { throw .failed("the Trash gave no place for \(folder.path)") }
        return trashed as URL
    }

    public func save(_ details: CallDetails) throws(CallStoreError) {
        try write(details, in: find(details.id).folder)
    }

    public func copy(_ call: CallID, to root: URL) throws(CallStoreError) -> CallCopy {
        let source = try find(call).folder
        let target = root.appendingPathComponent(source.lastPathComponent)
        guard !FileManager.default.fileExists(atPath: target.path) else { throw .targetExists }
        do {
            try FileManager.default.copyItem(at: source, to: target)
        } catch {
            try? FileManager.default.removeItem(at: target)
            throw Self.storeError(error)
        }
        return CallCopy(call: call, root: root)
    }

    public func deleteSource(after copy: CallCopy) throws(CallStoreError) {
        let source = try find(copy.call).folder
        guard let target = FileCallStore(root: copy.root).folder(of: copy.call) else { throw .notFound(copy.call) }
        guard FileManager.default.contentsEqual(atPath: source.path, andPath: target.path) else {
            throw .copyDiffers
        }
        do {
            try FileManager.default.removeItem(at: source)
        } catch {
            throw Self.storeError(error)
        }
    }

    public func totalSize() throws(CallStoreError) -> Int {
        guard let files = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey])
        else { throw .failed("can't read \(root.path)") }
        var total = 0
        for case let file as URL in files {
            let values = try? file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            if values?.isRegularFile == true { total += values?.fileSize ?? 0 }
        }
        return total
    }

    /// Watches the calls folder itself: a call folder renamed, added or
    /// removed changes it. Each change is found by comparing ids and names.
    public func watch(_ onChange: @escaping @Sendable (CallChange) -> Void) -> CallWatch {
        let fd = open(root.path, O_EVTONLY)
        guard fd >= 0 else { return CallWatch {} }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd, eventMask: [.write, .rename, .delete], queue: DispatchQueue(label: "audelin.call-watch"))
        var known = foldersByID()
        source.setEventHandler { [self] in
            let now = foldersByID()
            for (id, name) in now where known[id] != name { onChange(.changed(id)) }
            for id in known.keys where now[id] == nil { onChange(.removed(id)) }
            known = now
        }
        source.setCancelHandler { close(fd) }
        source.resume()
        return CallWatch { source.cancel() }
    }

    // MARK: - Folders

    private func names() throws(CallStoreError) -> [String] {
        do {
            return try FileManager.default.contentsOfDirectory(atPath: root.path)
                .filter { !$0.hasPrefix(".") }
                .filter { name in
                    var isDirectory: ObjCBool = false
                    return FileManager.default.fileExists(
                        atPath: root.appendingPathComponent(name).path, isDirectory: &isDirectory)
                        && isDirectory.boolValue
                }
                .sorted()
        } catch {
            throw Self.storeError(error)
        }
    }

    private func find(_ call: CallID) throws(CallStoreError) -> StoredCall {
        guard let stored = try list().lazy.compactMap(\.call).first(where: { $0.details.id == call }) else {
            throw .notFound(call)
        }
        return stored
    }

    private func foldersByID() -> [CallID: String] {
        let calls = (try? list())?.compactMap(\.call) ?? []
        return Dictionary(calls.map { ($0.details.id, $0.folder.lastPathComponent) }, uniquingKeysWith: { a, _ in a })
    }

    // MARK: - meta.json

    private static func details(in folder: URL) -> CallDetails? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("meta.json")) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(CallDetails.self, from: data)
    }

    private func write(_ details: CallDetails, in folder: URL) throws(CallStoreError) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        do {
            try encoder.encode(details).write(to: folder.appendingPathComponent("meta.json"), options: .atomic)
        } catch {
            throw Self.storeError(error)
        }
    }

    private static func storeError(_ error: any Error) -> CallStoreError {
        let underlying = (error as NSError).userInfo[NSUnderlyingErrorKey] as? NSError
        if (error as? CocoaError)?.code == .fileWriteOutOfSpace
            || (underlying?.domain == NSPOSIXErrorDomain && underlying?.code == Int(ENOSPC)) {
            return .diskFull
        }
        return .failed("\(error)")
    }
}
