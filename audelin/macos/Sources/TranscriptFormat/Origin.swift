import Foundation

extension TranscriptFormat {

    /// What made the words and speakers, separately for every original call.
    public struct Origin: Sendable, Equatable, Codable {
        public let calls: [OriginalCall]
        public let mergedBy: Release?
        /// Time of row zero, which may differ from both the folder minute and the first recording's start.
        public let timelineStart: Date?

        public init(calls: [OriginalCall], mergedBy: Release? = nil, timelineStart: Date? = nil) {
            self.calls = calls; self.mergedBy = mergedBy; self.timelineStart = timelineStart
        }
    }

    public struct Release: Sendable, Equatable, Codable {
        public let version: String
        public let build: String
        public init(version: String, build: String) { self.version = version; self.build = build }
    }

    public struct OriginalCall: Sendable, Equatable, Codable {
        public let start: Date
        /// Nil explicitly tells an unknown origin, including calls recorded before origins.
        public let origin: CallOrigin?
        public init(start: Date, origin: CallOrigin?) { self.start = start; self.origin = origin }

        private enum CodingKeys: String, CodingKey { case start, origin }
        public func encode(to encoder: any Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode(start, forKey: .start)
            try values.encode(origin, forKey: .origin)
        }
    }

    public struct CallOrigin: Sendable, Equatable, Codable {
        public let hearing: Release
        public let mine: String
        public let theirs: String
        public let split: Split?
        public let cleaning: Cleaning?

        public init(hearing: Release, mine: String, theirs: String, split: Split? = nil, cleaning: Cleaning? = nil) {
            self.hearing = hearing; self.mine = mine; self.theirs = theirs; self.split = split; self.cleaning = cleaning
        }
    }

    /// The diarizer is told only for a split whose result was kept.
    public enum Split: Sendable, Equatable, Codable {
        case done(diarizer: String, release: Release)
        case nothingKept(release: Release)
        case skipped(release: Release)
    }

    public struct Cleaning: Sendable, Equatable, Codable {
        public enum Outcome: String, Sendable, Codable { case done, nothingKept, skipped }
        public let outcome: Outcome
        public let release: Release
        public init(outcome: Outcome, release: Release) { self.outcome = outcome; self.release = release }
    }

    private struct OriginBlock: Codable {
        let schemaVersion: Int
        let origin: Origin
    }

    static func frontMatter(_ origin: Origin?) throws -> Data {
        guard let origin else { return Data() }
        // JSON flow syntax is a YAML subset: one codec quotes every scalar and keeps
        // control characters and delimiter-like model names inside their values.
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .secondsSince1970
        let bytes = try encoder.encode(OriginBlock(schemaVersion: 1, origin: origin))
        var yaml = ""
        for scalar in String(decoding: bytes, as: UTF8.self).unicodeScalars {
            // YAML forbids these literal controls or treats them as line breaks;
            // JSON allows them, so use escapes to preserve the scalar in both.
            switch scalar.value {
            case 0x7F...0x9F, 0x2028, 0x2029, 0xFFFE, 0xFFFF:
                yaml += String(format: "\\u%04x", scalar.value)
            default: yaml.unicodeScalars.append(scalar)
            }
        }
        return Data(("---\n" + yaml + "\n---\n\n").utf8)
    }

    static func frontMatter(_ markdown: String) -> (body: String, origin: Origin?) {
        let normalized = markdown.replacingOccurrences(of: "\r\n", with: "\n")
        guard normalized.hasPrefix("---\n") else { return (normalized, nil) }
        let rest = normalized.dropFirst(4)
        let header = rest.range(of: "# Transcript\n", options: .anchored)
            ?? rest.range(of: "\n# Transcript\n")
        // The block closes before the header; a rule inside the transcript never closes it.
        let searched = rest[..<(header?.upperBound ?? rest.endIndex)]
        guard let end = searched.range(of: "\n---\n") else {
            // A broken block must not turn metadata into transcript or note entries.
            return (header.map { String(rest[$0.lowerBound...]) } ?? "", nil)
        }
        let body = String(rest[end.upperBound...])
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        guard let block = try? decoder.decode(OriginBlock.self, from: Data(rest[..<end.lowerBound].utf8)),
              block.schemaVersion == 1 else { return (body, nil) }
        return (body, block.origin)
    }
}
