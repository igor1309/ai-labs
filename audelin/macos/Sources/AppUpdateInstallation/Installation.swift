import CoreServices
import Darwin
import Foundation

/// File access, stream lifetime and process launch share one blocking executor.
public actor Installation {
    private nonisolated let queue = DispatchSerialQueue(label: "audelin.app-update.installation")
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }
    private let bundle: URL
    private let pid: Int32
    private let run: @Sendable (Process) throws -> Void
    private var stream: FSEventStreamRef?
    private var output: AsyncStream<Void>.Continuation?
    private var watchID: UUID?

    public init(bundle: URL, pid: Int32) {
        self.init(bundle: bundle, pid: pid, run: { try $0.run() })
    }

    init(bundle: URL, pid: Int32, run: @escaping @Sendable (Process) throws -> Void) {
        self.bundle = bundle
        self.pid = pid
        self.run = run
    }

    public func readBuildID() -> String? {
        let plist = bundle.appendingPathComponent("Contents/Info.plist")
        guard let data = try? Data(contentsOf: plist),
              let values = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              values["CFBundleIdentifier"] as? String == "dev.igor1309.audelin",
              let id = values["AudelinBuildID"] as? String, !id.isEmpty else { return nil }
        return id
    }

    public func watch() -> AsyncStream<Void> {
        stopWatching()
        let id = UUID()
        let (changes, output) = AsyncStream<Void>.makeStream()
        guard let paths = watchPaths(for: bundle) else {
            output.finish()
            return changes
        }
        let sink = WatchSink(bundlePath: paths.bundle, output: output)
        var context = FSEventStreamContext(
            version: 0, info: Unmanaged.passUnretained(sink).toOpaque(),
            retain: { info in
                guard let info else { return nil }
                _ = Unmanaged<WatchSink>.fromOpaque(info).retain()
                return info
            },
            release: { info in
                if let info { Unmanaged<WatchSink>.fromOpaque(info).release() }
            }, copyDescription: nil
        )
        guard let stream = FSEventStreamCreate(
            nil, { _, info, count, paths, flags, _ in
                guard let info else { return }
                let sink = Unmanaged<WatchSink>.fromOpaque(info).takeUnretainedValue()
                let paths = unsafeBitCast(paths, to: NSArray.self) as! [String]
                if (0..<count).contains(where: {
                    isBundleEvent(paths[$0], flags: flags[$0], bundlePath: sink.bundlePath)
                }) {
                    sink.output.yield(())
                }
            }, &context, [paths.root] as CFArray,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0,
            FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagNoDefer)
        ) else {
            output.finish()
            return changes
        }
        FSEventStreamSetDispatchQueue(stream, queue)
        guard FSEventStreamStart(stream) else {
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            output.finish()
            return changes
        }
        self.stream = stream
        self.output = output
        self.watchID = id
        output.onTermination = { [weak self] _ in Task { await self?.stopWatching(id: id) } }
        return changes
    }

    private func stopWatching(id: UUID) {
        if watchID == id { stopWatching() }
    }

    public func stopWatching() {
        watchID = nil
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            self.stream = nil
        }
        output?.finish()
        output = nil
    }

    public func relaunch(opener: String = "open") throws {
        guard readBuildID() != nil else { throw Failure.unreadableBundle }
        let helper = Process()
        helper.executableURL = URL(filePath: "/bin/sh")
        // Arguments carry the path and pid without interpolating shell source. The
        // helper outlives this process; no inherited pipe keeps the parent alive.
        helper.arguments = ["-c", Self.relaunchScript, "audelin-relaunch", String(pid), bundle.path, opener]
        helper.standardInput = FileHandle.nullDevice
        helper.standardOutput = FileHandle.nullDevice
        helper.standardError = FileHandle.nullDevice
        try run(helper)
    }

    public enum Failure: Error, Equatable { case unreadableBundle }

    static let relaunchScript = "trap '' HUP; while kill -0 \"$1\" 2>/dev/null; do /bin/sleep 0.1; done; exec \"$3\" \"$2\""

    isolated deinit {
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
        output?.finish()
    }
}

func watchPaths(for bundle: URL) -> (root: String, bundle: String)? {
    // FSEvents reports physical paths; Foundation can strip their /private
    // prefix. Resolve only the parent so a missing bundle can still be watched.
    guard let resolved = realpath(bundle.deletingLastPathComponent().path, nil) else { return nil }
    defer { free(resolved) }
    let root = String(cString: resolved)
    return (root, (root == "/" ? "" : root) + "/" + bundle.lastPathComponent)
}

func isBundlePath(_ path: String, bundlePath: String) -> Bool {
    path == bundlePath || path.hasPrefix(bundlePath + "/")
}

func isBundleEvent(_ path: String, flags: FSEventStreamEventFlags, bundlePath: String) -> Bool {
    if isBundlePath(path, bundlePath: bundlePath) { return true }
    let rescan = FSEventStreamEventFlags(kFSEventStreamEventFlagMustScanSubDirs |
        kFSEventStreamEventFlagUserDropped | kFSEventStreamEventFlagKernelDropped |
        kFSEventStreamEventFlagRootChanged)
    guard flags & rescan != 0 else { return false }
    let ancestor = path.hasSuffix("/") ? String(path.dropLast()) : path
    return bundlePath.hasPrefix(ancestor + "/")
}

private final class WatchSink {
    let bundlePath: String
    let output: AsyncStream<Void>.Continuation
    init(bundlePath: String, output: AsyncStream<Void>.Continuation) {
        self.bundlePath = bundlePath
        self.output = output
    }
}
