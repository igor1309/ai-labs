import CallsListUI
import Foundation
import Preferences
import SummaryFiles
import SummaryJobs
import SummaryRuntime
import SummarySettings

func settingsConfiguration(_ notes: NotesPreferences) throws -> SummarySettings.Configuration {
    func runtime(_ value: NotesPreferences.Runtime) throws -> SummarySettings.Configuration.Runtime {
        guard let kind = SummarySettings.Configuration.Runtime.Kind(rawValue: value.kind) else { throw SummaryRuntime.Failure.configuration }
        return .init(kind: kind, model: value.model, executable: value.executable,
              endpoint: value.endpoint, credentialVariable: value.credentialVariable)
    }
    let config = SummarySettings.Configuration(enabled: notes.enabled, speakers: notes.speakers, primary: try runtime(notes.primary), fallback: try notes.fallback.map(runtime))
    guard SummaryAvailability.configurationIssues(config).isEmpty else { throw SummaryRuntime.Failure.configuration }
    return config
}
func storedConfiguration(_ config: SummarySettings.Configuration) -> NotesPreferences {
    func runtime(_ value: SummarySettings.Configuration.Runtime) -> NotesPreferences.Runtime {
        .init(kind: value.kind.rawValue, model: value.model, executable: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
    }
    return .init(enabled: config.enabled, speakers: config.speakers, primary: runtime(config.primary), fallback: config.fallback.map(runtime))
}
func runtimeConfiguration(_ value: SummaryJobs.Job.Runtime) throws -> SummaryRuntime.Configuration {
    guard let kind = SummaryRuntime.Configuration.Kind(rawValue: value.kind) else { throw SummaryRuntime.Failure.configuration }
    return .init(kind: kind, model: value.model, program: value.program, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
}
struct SummaryPreferences: SummarySettings.Preferences {
    let storage: PreferencesStore
    func load() async throws -> SummarySettings.Configuration {
        try settingsConfiguration(storage.loadNotes())
    }
    func save(_ configuration: SummarySettings.Configuration) async throws {
        guard SummaryAvailability.configurationIssues(configuration).isEmpty else { throw SummaryRuntime.Failure.configuration }
        try storage.updateNotes(storedConfiguration(configuration))
    }
}
struct SummaryAvailability: SummarySettings.Availability {
    static func configurationIssues(_ configuration: SummarySettings.Configuration) -> [SummarySettings.ValidationIssue] {
        [(SummarySettings.Slot.primary, configuration.primary), (.fallback, configuration.fallback)].flatMap { slot, value in
            guard let value else { return [SummarySettings.ValidationIssue]() }
            return SummaryRuntime.Runtime.configurationIssues(.init(kind: .init(rawValue: value.kind.rawValue)!, model: value.model,
                program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)).map { issue in
                let field: SummarySettings.Field
                switch issue.field {
                case .model: field = .model
                case .program: field = .executable
                case .endpoint: field = .endpoint
                case .credentialVariable: field = .credentialVariable
                }
                return .init(slot: slot, field: field, hidesValue: issue.hidesValue)
            }
        }
    }
    let runtime: SummaryRuntime.Runtime
    func validate(_ configuration: SummarySettings.Configuration) async -> [SummarySettings.ValidationIssue] {
        let syntax = Self.configurationIssues(configuration)
        guard syntax.isEmpty else { return syntax }
        for (slot, value) in [(SummarySettings.Slot.primary, configuration.primary), (.fallback, configuration.fallback)] {
            guard let value else { continue }
            do {
                try await runtime.validate(.init(kind: .init(rawValue: value.kind.rawValue)!, model: value.model,
                    program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable))
            } catch {
                if error as? SummaryRuntime.Failure == .authentication {
                    return [.init(slot: slot, field: .credentialVariable, reason: .authentication)]
                }
                return [.init(slot: slot, field: value.kind == .claudeCLI ? .executable : .endpoint, reason: .unavailable)]
            }
        }
        return []
    }
}

// Persistence DTOs belong to the root mapping, not to the job domain.
struct Snapshot: Codable {
    struct Runtime: Codable {
        var kind: String; var model: String; var program: String; var endpoint: String; var credentialVariable: String
        init(_ value: Job.Runtime) { kind = value.kind; model = value.model; program = value.program; endpoint = value.endpoint; credentialVariable = value.credentialVariable }
        var value: Job.Runtime { .init(kind: kind, model: model, program: program, endpoint: endpoint, credentialVariable: credentialVariable) }
    }
    struct Entry: Codable {
        var label: String; var time: String; var text: String
        init(_ value: Job.Entry) { label = value.label; time = value.time; text = value.text }
        var value: Job.Entry { .init(label: label, time: time, text: text) }
    }
    var entries: [Entry]; var speakers: Bool; var primary: Runtime; var fallback: Runtime?
    init(_ job: Job) { entries = job.entries.map(Entry.init); speakers = job.speakers; primary = .init(job.primary); fallback = job.fallback.map(Runtime.init) }
}
