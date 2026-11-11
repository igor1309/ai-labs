public extension SettingsState {

    /// The General tab: the language and appearance pickers.
    struct General: Equatable, Sendable {

        public enum Language: String, CaseIterable, Sendable { case system, russian, english }
        public enum Appearance: String, CaseIterable, Sendable { case system, light, dark }

        public var language: Segmented<Language>
        public var appearance: Segmented<Appearance>

        public init(language: Segmented<Language>, appearance: Segmented<Appearance>) {

            self.language = language
            self.appearance = appearance
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
