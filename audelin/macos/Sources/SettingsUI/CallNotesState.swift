/// Presentation values for Call notes. The Settings machine maps its
/// domain choices into these fields, disclosures and action availability.
public extension SettingsState {

    enum Tab: String, CaseIterable, Sendable {
        case general, recording, callNotes
    }

    enum CallNotes: Equatable, Sendable {
        case loading(String)
        case loadFailed(NotesBanner, NotesAction)
        case loaded(NotesDraft)
    }

    struct NotesDraft: Equatable, Sendable {
        public var automatic: Bool
        public var identifySpeakers: Bool
        public var runtimes: [NotesRuntime]
        public var disclosure: String
        public var status: String
        public var statusTone: NotesTone
        public var banner: NotesBanner?
        public var validate: NotesAction
        public var save: NotesAction

        public init(automatic: Bool, identifySpeakers: Bool, runtimes: [NotesRuntime], disclosure: String,
                    status: String, statusTone: NotesTone = .secondary, banner: NotesBanner? = nil,
                    validate: NotesAction, save: NotesAction) {
            self.automatic = automatic
            self.identifySpeakers = identifySpeakers
            self.runtimes = runtimes
            self.disclosure = disclosure
            self.status = status
            self.statusTone = statusTone
            self.banner = banner
            self.validate = validate
            self.save = save
        }
    }

    struct NotesRuntime: Equatable, Identifiable, Sendable {
        public enum Slot: String, CaseIterable, Sendable { case primary, fallback }
        public enum Kind: String, CaseIterable, Sendable { case unconfigured, claudeCLI, compatibleAPI }
        public struct Option: Equatable, Identifiable, Sendable {
            public var id: Kind
            public var title: String
            public init(id: Kind, title: String) { self.id = id; self.title = title }
        }

        public var id: Slot
        public var title: String
        public var kind: Kind
        public var options: [Option]
        public var fields: [NotesField]
        public var disclosure: String

        public init(id: Slot, title: String, kind: Kind, options: [Option], fields: [NotesField], disclosure: String) {
            self.id = id
            self.title = title
            self.kind = kind
            self.options = options
            self.fields = fields
            self.disclosure = disclosure
        }
    }

    struct NotesField: Equatable, Identifiable, Sendable {
        /// A credential reference is only a variable name, never its value.
        public enum ID: String, CaseIterable, Sendable { case model, executable, endpoint, credentialVariable }
        public var id: ID
        public var label: String
        public var value: String
        public var placeholder: String
        public var isInvalid: Bool
        public var isEnabled: Bool

        public init(id: ID, label: String, value: String, placeholder: String = "",
                    isInvalid: Bool = false, isEnabled: Bool = true) {
            self.id = id
            self.label = label
            self.value = value
            self.placeholder = placeholder
            self.isInvalid = isInvalid
            self.isEnabled = isEnabled
        }
    }

    enum NotesTone: Equatable, Sendable { case secondary, success, error }

    struct NotesBanner: Equatable, Sendable {
        public var title: String
        public var detail: String
        public init(title: String, detail: String) { self.title = title; self.detail = detail }
    }

    struct NotesAction: Equatable, Sendable {
        public enum ID: String, Sendable { case validate, save, retrySave, retryLoad }
        public var id: ID
        public var title: String
        public var isEnabled: Bool
        public init(id: ID, title: String, isEnabled: Bool = true) {
            self.id = id
            self.title = title
            self.isEnabled = isEnabled
        }
    }
}
