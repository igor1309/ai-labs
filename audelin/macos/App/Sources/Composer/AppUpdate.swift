import Foundation

/// The swap in `install.sh` gives the installed path a new directory, so its
/// file number differs from the one this launch started with. A missing bundle
/// is the moment inside that swap, not yet a replacement.
public func bundleReplaced(at bundle: URL) -> @Sendable () -> Bool {

    let launched = fileNumber(of: bundle)
    return {
        guard let launched, let current = fileNumber(of: bundle) else { return false }
        return current != launched
    }
}

/// A process that outlives this one, waits for `pid` to exit and then opens the
/// bundle through Launch Services, so macOS keeps attributing access to the app.
public func relaunchProcess(after pid: Int32, bundle: URL, open: String = "/usr/bin/open") -> Process {

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/sh")
    process.arguments = ["-c", #"while kill -0 "$0" 2>/dev/null; do sleep 0.2; done; exec "$1" "$2""#,
                         String(pid), open, bundle.path]
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    return process
}

private func fileNumber(of url: URL) -> UInt64? {

    (try? FileManager.default.attributesOfItem(atPath: url.path))?[.systemFileNumber] as? UInt64
}
