import Darwin
import Foundation

// Standalone filesystem microbenchmark. Run on the target Mac and volume; this
// is not a substitute for Audelin's unavailable Benchmarks/Profile harness.
enum Flush: String, CaseIterable {
    case fsync
    case fullfsync

    func call(_ fd: Int32) -> Int32 {
        switch self {
        case .fsync: return Darwin.fsync(fd)
        case .fullfsync: return Darwin.fcntl(fd, F_FULLFSYNC)
        }
    }
}

enum Method: String, CaseIterable {
    case replace
    case truncateTail
    case appendLog
}

func check(_ result: Int32, _ operation: String) throws {
    guard result == 0 else { throw NSError(domain: "benchmark", code: Int(errno), userInfo: [NSLocalizedDescriptionKey: "\(operation): \(String(cString: strerror(errno)))"]) }
}

func writeAll(_ fd: Int32, _ data: Data) throws {
    try data.withUnsafeBytes { bytes in
        var offset = 0
        while offset < bytes.count {
            let count = Darwin.write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
            if count < 0 && errno == EINTR { continue }
            guard count > 0 else { throw NSError(domain: "benchmark", code: Int(errno)) }
            offset += count
        }
    }
}

func flush(_ fd: Int32, _ mode: Flush) throws {
    while mode.call(fd) != 0 {
        if errno == EINTR { continue }
        try check(-1, mode.rawValue)
    }
}

func timed(_ method: Method, _ mode: Flush, _ directory: URL, _ text: Data, _ stablePrefix: Data) throws -> UInt64 {
    let target = directory.appendingPathComponent("transcript.md")
    let temporary = directory.appendingPathComponent("transcript.tmp")
    let log = directory.appendingPathComponent("transcript.jsonl")
    let start = DispatchTime.now().uptimeNanoseconds
    switch method {
    case .replace:
        let fd = Darwin.open(temporary.path, O_CREAT | O_TRUNC | O_WRONLY, 0o600)
        guard fd >= 0 else { try check(-1, "open temp") ; fatalError() }
        do { try writeAll(fd, Data(text.dropFirst(stablePrefix.count))); try flush(fd, mode); _ = Darwin.close(fd) }
        catch { _ = Darwin.close(fd); throw error }
        try check(Darwin.rename(temporary.path, target.path), "rename")
    case .truncateTail:
        let fd = Darwin.open(target.path, O_CREAT | O_RDWR, 0o600)
        guard fd >= 0 else { try check(-1, "open target"); fatalError() }
        do {
            try check(Darwin.ftruncate(fd, off_t(stablePrefix.count)), "ftruncate")
            try check(Darwin.lseek(fd, off_t(stablePrefix.count), SEEK_SET) < 0 ? -1 : 0, "seek")
            try writeAll(fd, Data(text.dropFirst(stablePrefix.count)))
            try flush(fd, mode)
            _ = Darwin.close(fd)
        } catch { _ = Darwin.close(fd); throw error }
    case .appendLog:
        let fd = Darwin.open(log.path, O_CREAT | O_APPEND | O_WRONLY, 0o600)
        guard fd >= 0 else { try check(-1, "open log"); fatalError() }
        do { try writeAll(fd, text); try flush(fd, mode); _ = Darwin.close(fd) }
        catch { _ = Darwin.close(fd); throw error }
    }
    return DispatchTime.now().uptimeNanoseconds - start
}

let base = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("audelin-save-bench-\(UUID())", isDirectory: true)
try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: base) }
let shapes: [(Int, Int)] = [(20, 2_048), (1_620, 276_480), (6_000, 1_056_768)]
let iterations = 15
print("method,flush,lines,snapshot_bytes,write_bytes,median_ms,p95_ms,iterations")
for (lines, bytes) in shapes {
    let dataBytes = bytes - lines
    let baseLineBytes = dataBytes / lines
    let extraBytes = dataBytes % lines
    let content = (0..<lines).map { index in
        String(repeating: "x", count: baseLineBytes + (index < extraBytes ? 1 : 0)) + "\n"
    }.joined()
    let full = Data(content.utf8)
    let prefix = Data(full.prefix(max(0, full.count - min(256, full.count / 10))))
    for method in Method.allCases {
        for mode in Flush.allCases {
            var samples: [UInt64] = []
            for i in 0..<iterations {
                let directory = base.appendingPathComponent("\(lines)-\(method.rawValue)-\(mode.rawValue)-\(i)", isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let target = directory.appendingPathComponent("transcript.md")
                try Data(prefix).write(to: target)
                samples.append(try timed(method, mode, directory, full, prefix))
            }
            samples.sort()
            let median = Double(samples[samples.count / 2]) / 1_000_000
            let p95 = Double(samples[min(samples.count - 1, Int(Double(samples.count - 1) * 0.95))]) / 1_000_000
            let writeBytes = method == .replace ? full.count : full.count - prefix.count
            print("\(method.rawValue),\(mode.rawValue),\(lines),\(full.count),\(writeBytes),\(String(format: "%.3f", median)),\(String(format: "%.3f", p95)),\(iterations)")
        }
    }
}
