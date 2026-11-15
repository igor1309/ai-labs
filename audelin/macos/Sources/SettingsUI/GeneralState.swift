public extension SettingsState {

    /// The General tab: the language and appearance pickers, and the AGENTS.md offer.
    struct General: Equatable, Sendable {

        /// Offers to write AGENTS.md while the recordings root has none.
        public struct Agents: Equatable, Sendable {

            /// The hint line, or why the last write failed, in the hint's own style.
            public var hint: String

            public init(hint: String) {

                self.hint = hint
            }
        }

        public enum Language: String, CaseIterable, Sendable { case system, russian, english }
        public enum Appearance: String, CaseIterable, Sendable { case system, light, dark }

        public var language: Segmented<Language>
        public var appearance: Segmented<Appearance>
        /// No row when nil.
        public var agents: Agents?

        public init(language: Segmented<Language>, appearance: Segmented<Appearance>, agents: Agents? = nil) {

            self.language = language
            self.appearance = appearance
            self.agents = agents
        }

        /// Nothing to pick yet.
        public static let empty = General(language: .init(segments: [], selected: .system, hint: ""),
                                          appearance: .init(segments: [], selected: .system, hint: ""))
    }

    /// A row-wide segmented control with a grey line under it.
    struct Segmented<ID: Hashable & Sendable>: Equatable, Sendable {

        public struct Segment: Equatable, Sendable {

            public let id: ID
            public var title: String
            public var isEnabled: Bool

            public init(id: ID, title: String, isEnabled: Bool = true) {

                self.id = id
                self.title = title
                self.isEnabled = isEnabled
            }
        }

        public var segments: [Segment]
        public var selected: ID
        public var hint: String

        public init(segments: [Segment], selected: ID, hint: String) {

            self.segments = segments
            self.selected = selected
            self.hint = hint
        }
    }
}
