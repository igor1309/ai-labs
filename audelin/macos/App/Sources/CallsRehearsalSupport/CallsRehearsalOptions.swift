import Foundation
import Preferences
import SummaryRuntime

public struct CallsRehearsalOptions: Equatable, Sendable {
    public let callsFolder: URL
    public let stateFolder: URL
    /// Where the rehearsal's Trash port moves items, so a run never reaches the user's Trash.
    public let trashFolder: URL
    public var preferencesURL: URL { stateFolder.appendingPathComponent("preferences.json") }
    public var controlFolder: URL { stateFolder.appendingPathComponent("control", isDirectory: true) }

    public enum Failure: Error { case invalidArguments }
    public static let usage = "CallsRehearsal --calls <absolute directory> --state <absolute directory> --trash <absolute directory>"

    public static func parse(_ arguments: [String]) throws -> Self {
        guard arguments.count == 6 else { throw Failure.invalidArguments }
        var paths: [String: URL] = [:]
        for index in stride(from: 0, to: arguments.count, by: 2) {
            let flag = arguments[index], path = arguments[index + 1]
            guard ["--calls", "--state", "--trash"].contains(flag), paths[flag] == nil,
                  path.hasPrefix("/"), !path.contains("\0") else { throw Failure.invalidArguments }
            paths[flag] = URL(fileURLWithPath: path, isDirectory: true)
        }
        guard let calls = paths["--calls"], let state = paths["--state"],
              let trash = paths["--trash"] else { throw Failure.invalidArguments }
        return Self(callsFolder: calls, stateFolder: state, trashFolder: trash)
    }

    /// Settings are written before composition, so no automatic work can start on launch.
    public func prepare() throws {
        try FileManager.default.createDirectory(at: controlFolder, withIntermediateDirectories: true)
        try PreferencesStore(fileURL: preferencesURL).write(Preferences(
            notes: .init(enabled: false, speakers: false,
                         primary: .init(kind: "compatibleAPI", model: "calls-rehearsal", executable: "",
                                        endpoint: "http://127.0.0.1:1", credentialVariable: "")),
            automaticRecording: false, liveText: false, callsFolder: callsFolder,
            language: .russian, appearance: .light))
    }

    /// Moves an item into the trash folder under a name no earlier item took, as the Trash does.
    public var trash: @Sendable (URL) throws -> Void {
        { [trashFolder] item in
            let files = FileManager.default
            try files.createDirectory(at: trashFolder, withIntermediateDirectories: true)
            let name = item.lastPathComponent
            var target = trashFolder.appendingPathComponent(name)
            var copy = 2
            while files.fileExists(atPath: target.path) {
                target = trashFolder.appendingPathComponent("\(name) \(copy)")
                copy += 1
            }
            try files.moveItem(at: item, to: target)
        }
    }

    public func runtime() -> SummaryRuntime.Runtime {
        let control = SummaryFileControl(folder: controlFolder)
        let service = LiveSummaryService(wait: control.wait, report: control.report)
        return SummaryRuntime.Runtime(process: NoRehearsalProcess(), http: service, credential: { _ in nil },
            resolveProgram: { _ in throw SummaryRuntime.Failure.unavailable }, deadline: {
                let never = AsyncStream<Void> { _ in }
                for await _ in never { }
                throw CancellationError()
            })
    }
}

private struct NoRehearsalProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput {
        throw SummaryRuntime.Failure.unavailable
    }
}
