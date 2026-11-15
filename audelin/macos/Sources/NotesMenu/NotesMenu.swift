import Foundation

/// Choosing how the shown call's notes are made. Generation is an output,
/// leaving the app to connect this responsibility to its jobs.
public struct NotesMenuState: Equatable, Sendable {
    public struct Facts: Equatable, Sendable {
        public var call: String
        public var hasNotes: Bool
        public var template: String?
        public var busy: Bool
        public init(call: String, hasNotes: Bool, template: String?, busy: Bool) {
            self.call = call; self.hasNotes = hasNotes; self.template = template; self.busy = busy
        }
    }
    public struct Template: Equatable, Sendable {
        public var id: String
        public var name: String
        public var usable: Bool
        public var enabled: Bool
        public var reason: String?
        public var isFile: Bool
        public init(id: String, name: String, usable: Bool = true, enabled: Bool, reason: String? = nil, isFile: Bool = true) {
            self.id = id; self.name = name; self.usable = usable; self.enabled = enabled; self.reason = reason; self.isFile = isFile
        }
    }
    public struct Catalogue: Equatable, Sendable {
        public var templates: [Template]
        public var folderReason: String?
        public init(templates: [Template], folderReason: String? = nil) {
            self.templates = templates; self.folderReason = folderReason
        }
    }
    public struct Intention: Equatable, Sendable {
        public var call: String
        public var template: String
        public init(call: String, template: String) { self.call = call; self.template = template }
    }
    public var facts: Facts?
    public var section: String
    public var templates: [Template]
    public var keeping: Bool
    public var offersKeeping: Bool
    public var saving: Bool
    public var saveFailure: String?
    public var filesReason: String?
    public var offersFolder: Bool
    public var openingFolder: Bool
    public var folderOpened: Bool
    public var folderFailure: String?
    public var catalogueRevision: Int
    public var reading: Int
    public var intention: Intention?
    public var intentions: Int
    public init(facts: Facts? = nil, section: String = "", templates: [Template] = [], keeping: Bool = true,
                offersKeeping: Bool = false, saving: Bool = false, saveFailure: String? = nil,
                filesReason: String? = nil, offersFolder: Bool = false, openingFolder: Bool = false, folderOpened: Bool = false, folderFailure: String? = nil,
                reading: Int = 0, catalogueRevision: Int = 0, intention: Intention? = nil, intentions: Int = 0) {
        self.facts = facts; self.section = section; self.templates = templates; self.keeping = keeping
        self.offersKeeping = offersKeeping; self.saving = saving; self.saveFailure = saveFailure
        self.filesReason = filesReason; self.offersFolder = offersFolder; self.openingFolder = openingFolder
        self.folderOpened = folderOpened; self.folderFailure = folderFailure
        self.catalogueRevision = catalogueRevision; self.reading = reading; self.intention = intention; self.intentions = intentions
    }
}
public enum NotesMenuEvent: Equatable, Sendable {
    case factsChanged(NotesMenuState.Facts?)
    case opened
    case catalogue(Int, [NotesMenuState.Template], folderReason: String? = nil)
    case openFolder, folderOpened, folderFailed(String)
    case choose(String)
    case toggleKeeping
    case keepingChanged(Bool)
    case keepingSaved(Bool)
    case keepingFailed(String)
}
public enum NotesMenuEffect: Equatable, Sendable {
    case catalogue(Int)
    case saveKeeping(Bool)
    case openFolder
}
public struct NotesMenuReducer: Sendable {
    private let section: @Sendable (Bool) -> String
    private let noUsableFiles: @Sendable () -> String
    public init(section: @escaping @Sendable (Bool) -> String, noUsableFiles: @escaping @Sendable () -> String) {
        self.section = section; self.noUsableFiles = noUsableFiles
    }
    public func reduce(_ state: NotesMenuState, _ event: NotesMenuEvent) -> (NotesMenuState, NotesMenuEffect?) {
        var state = state
        switch event {
        case let .factsChanged(facts):
            guard facts != state.facts else { return (state, nil) }
            state.facts = facts
            state.section = facts.map { section($0.hasNotes) } ?? ""
            state.offersKeeping = facts?.hasNotes == true
            for index in state.templates.indices { state.templates[index].enabled = state.templates[index].usable && facts != nil && facts?.busy == false }
        case .opened:
            guard let facts = state.facts else { return (state, nil) }
            state.section = section(facts.hasNotes)
            state.reading += 1
            return (state, .catalogue(state.reading))
        case let .catalogue(revision, templates, folderReason):
            guard revision == state.reading else { return (state, nil) }
            state.catalogueRevision = revision
            let hasUsableFiles = templates.contains { $0.isFile && $0.usable }
            state.filesReason = folderReason ?? (hasUsableFiles ? nil : noUsableFiles())
            state.offersFolder = state.filesReason != nil || templates.contains { !$0.usable }
            state.templates = templates.map { template in
                var template = template
                template.enabled = template.usable && state.facts != nil && state.facts?.busy == false
                return template
            }
        case .openFolder:
            guard state.offersFolder, !state.openingFolder else { return (state, nil) }
            state.openingFolder = true; state.folderOpened = false; state.folderFailure = nil
            return (state, .openFolder)
        case .folderOpened:
            state.openingFolder = false; state.folderOpened = true; state.folderFailure = nil
        case let .folderFailed(reason):
            state.openingFolder = false; state.folderOpened = false; state.folderFailure = reason
        case let .choose(id):
            guard let facts = state.facts, !facts.busy,
                  state.templates.contains(where: { $0.id == id && $0.enabled }) else { return (state, nil) }
            state.intention = .init(call: facts.call, template: id)
            state.intentions += 1
        case .toggleKeeping:
            guard state.offersKeeping, !state.saving else { return (state, nil) }
            state.saving = true; state.saveFailure = nil
            return (state, .saveKeeping(!state.keeping))
        case let .keepingChanged(keeping): state.keeping = keeping
        case let .keepingSaved(keeping):
            state.keeping = keeping; state.saving = false; state.saveFailure = nil
        case let .keepingFailed(reason): state.saving = false; state.saveFailure = reason
        }
        return (state, nil)
    }
}
public struct NotesMenuEffectHandler: Sendable {
    private let catalogue: @Sendable () async -> NotesMenuState.Catalogue
    private let save: @Sendable (Bool) async throws -> Void
    private let openFolder: @Sendable () async throws -> Void
    public init(catalogue: @escaping @Sendable () async -> NotesMenuState.Catalogue,
                save: @escaping @Sendable (Bool) async throws -> Void,
                openFolder: @escaping @Sendable () async throws -> Void) {
        self.catalogue = catalogue; self.save = save; self.openFolder = openFolder
    }
    public func handle(_ effect: NotesMenuEffect) async -> NotesMenuEvent {
        switch effect {
        case let .catalogue(revision):
            let result = await catalogue()
            return .catalogue(revision, result.templates, folderReason: result.folderReason)
        case .openFolder:
            do { try await openFolder(); return .folderOpened }
            catch { return .folderFailed(error.localizedDescription) }
        case let .saveKeeping(keeping):
            do { try await save(keeping); return .keepingSaved(keeping) }
            catch { return .keepingFailed(error.localizedDescription) }
        }
    }
}
