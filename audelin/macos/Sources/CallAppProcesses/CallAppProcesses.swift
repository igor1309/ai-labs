import Synchronization

/// A process with audio open.
public struct AudioProcess: Equatable, Sendable {

    public var pid: Int32
    public var bundleID: String?
    public var name: String
    public var isAudelin: Bool

    public init(pid: Int32, bundleID: String?, name: String, isAudelin: Bool) {

        self.pid = pid
        self.bundleID = bundleID
        self.name = name
        self.isAudelin = isAudelin
    }
}

/// The processes with audio open when asked.
public protocol ProcessList: Sendable {

    func processes() async throws -> [AudioProcess]
}

/// Which process ids to hear, in the process list's order.
public enum ProcessSelection: Equatable, Sendable {

    case only([Int32])
    case allExcept([Int32])
}

/// Chooses the processes carrying one call app's audio and keeps its last answer.
public final class CallAppProcesses: Sendable {

    private let app: String
    private let list: any ProcessList
    private let last = Mutex<ProcessSelection?>(nil)

    public init(app: String, list: any ProcessList) {

        self.app = app
        self.list = list
    }

    /// The app's processes, the last answer, or initially all but Audelin.
    public func processes() async throws -> ProcessSelection {

        let processes = try await list.processes()
        return last.withLock { last in
            let matching = processes.filter { belongsToApp($0) }.map(\.pid)
            let answer: ProcessSelection
            if !matching.isEmpty {
                answer = .only(matching)
            } else {
                answer = last ?? .allExcept(processes.filter(\.isAudelin).map(\.pid))
            }
            last = answer
            return answer
        }
    }

    private func belongsToApp(_ process: AudioProcess) -> Bool {

        if process.name == app { return true }
        guard let bundleID = process.bundleID, !bundleID.isEmpty else { return false }
        return bundleID.hasPrefix(app)
            || (bundleID.contains(".helper") && process.name.hasPrefix(app + " Helper"))
    }
}
