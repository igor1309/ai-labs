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
/// The calls list's icon for a summary phase.
func summaryBadge(_ phase: SummaryJobs.State.Phase) -> CallsListState.Row.Summary {
    switch phase {
    case .idle, .succeeded: .none
    case .waiting, .pending, .claiming, .observed, .running, .starting, .identifying, .checkpointing, .noting, .publishing, .saving: .pending
    case .failed, .interrupted, .unavailable: .failed
    }
}

extension CallsListText {
    /// A call's notes status as its calls list row shows it.
    func summaryStatus(_ phase: SummaryJobs.State.Phase, _ warning: Bool) -> String {
        switch phase {
        case .idle: ""
        case .waiting: self(.summaryWaiting)
        case .pending, .claiming, .observed: self(.summaryPending)
        case .running, .starting, .identifying, .checkpointing, .noting, .publishing, .saving: self(.summaryRunning)
        case .succeeded: warning ? self(.summaryReadyUnnamed) : self(.summaryReady)
        case .failed: self(.summaryFailed)
        case .interrupted: self(.summaryInterrupted)
        case .unavailable: self(.summaryUnavailable)
        }
    }
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
private struct Snapshot: Codable {
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
struct SummaryJobStore: SummaryJobs.Store {
    let files: SummaryFiles.Files
    /// Writes a job's status in the list's language.
    var status: @Sendable (SummaryJobs.State.Phase, Bool) -> String = { CallsListText(language: .russian).summaryStatus($0, $1) }
    func record(_ job: Job, phase: String = "running", warning: Bool = false) throws -> Record {
        .init(job: job.id, call: job.call, input: job.input, snapshot: try JSONEncoder().encode(Snapshot(job)), phase: phase, warning: warning)
    }
    func state(_ record: Record) throws -> SummaryJobs.State {
        let saved = try JSONDecoder().decode(Snapshot.self, from: record.snapshot)
        let job = Job(id: record.job, call: record.call, input: record.input, entries: saved.entries.map(\.value), speakers: saved.speakers,
                      primary: saved.primary.value, fallback: saved.fallback?.value)
        guard let phase = SummaryJobs.State.Phase(rawValue: record.phase),
              [.pending, .running, .interrupted, .succeeded, .failed].contains(phase) else { throw CocoaError(.fileReadCorruptFile) }
        return .init(phase: phase, job: job, warning: record.warning, status: status(phase, record.warning))
    }
    func claim(_ job: Job) async throws -> (owned: Bool, state: SummaryJobs.State) {
        let result = try await files.claim(record(job, phase: "pending"))
        return (result.owned, try state(result.record))
    }
    func release(_ job: Job) async {
        await files.release(job: job.id, call: job.call, input: job.input)
    }
    func start(_ job: Job) async throws -> Bool { try await files.start(record(job)) }
    func checkpoint(_ job: Job, identities: [SummaryJobs.Identity], warning: Bool) async throws {
        var value = try record(job, warning: warning)
        value.checkpoint = try JSONSerialization.data(withJSONObject: identities.map { ["label": $0.label, "name": $0.name, "time": $0.time, "quote": $0.quote] })
        try await files.progress(value)
    }
    func publish(_ job: Job, notes: String, warning: Bool) async throws { try await files.publish(record(job, warning: warning), notes: notes) }
    func save(_ job: Job, phase: SummaryJobs.State.Phase, warning: Bool) async throws {
        try await files.progress(record(job, phase: phase.rawValue, warning: warning))
    }
    func discard(_ job: Job) async throws { try await files.discard(record(job)) }
}
