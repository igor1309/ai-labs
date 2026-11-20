import CryptoKit
import Foundation

public struct Heading: Codable, Equatable, Sendable {
    public var name: String
    public var required: Bool
    public init(_ name: String, required: Bool = true) { self.name = name; self.required = required }
}
public struct Template: Equatable, Sendable {
    public var name: String
    public var instructions: String
    public var headings: [[Heading]]
    public init(name: String, instructions: String, headings: [[Heading]]) {
        self.name = name; self.instructions = instructions; self.headings = headings
    }
}
public struct Entry: Equatable, Sendable {
    public var name: String
    public var file: String?
    public var reason: String?
    public init(name: String, file: String?, reason: String?) { self.name = name; self.file = file; self.reason = reason }
}
public struct Catalogue: Equatable, Sendable {
    public var entries: [Entry]
    public var folderReason: String?
    public init(entries: [Entry], folderReason: String?) { self.entries = entries; self.folderReason = folderReason }
}
public struct Failure: LocalizedError, Equatable, Sendable, CustomStringConvertible {
    public var errorDescription: String? { description }
    public var description: String
    public init(_ description: String) { self.description = description }
}

public protocol Disk: Sendable {
    /// Creates the folder exclusively; false means it already existed.
    func createFolder(_ folder: URL) throws -> Bool
    func files(_ folder: URL) throws -> [String]
    func read(_ file: URL) throws -> String
    func write(_ text: String, to file: URL) throws
}

/// Owns the editable file format and its fallback. Existing folders and files are never repaired.
public struct Files: Sendable {
    private let folder: URL
    private let disk: any Disk
    private let openFolder: @Sendable (URL) async throws -> Void
    public init(folder: URL, disk: any Disk, openFolder: @escaping @Sendable (URL) async throws -> Void) {
        self.folder = folder; self.disk = disk; self.openFolder = openFolder
    }
    public func open() async throws { try await openFolder(folder) }

    public func resolveDefault() -> Template {
        (try? resolve("Default")) ?? Self.builtInDefault
    }

    private func prepare() throws {
        let shipped = [(Self.builtInDefault, Self.earlierDefaults), (Self.shippedDaily, Self.earlierDailies)]
        if try disk.createFolder(folder) {
            for (template, _) in shipped { try disk.write(Self.encode(template), to: file(template.name)) }
            return
        }
        // A file still holding an earlier shipped text was never edited; it follows the shipped one.
        for (template, earlier) in shipped {
            guard let text = try? disk.read(file(template.name)), let current = try? Self.parse(text),
                  current.name == template.name, current.headings == template.headings,
                  earlier.contains(Self.digest(current.instructions)) else { continue }
            try disk.write(Self.encode(template), to: file(template.name))
        }
    }
    private func file(_ name: String) -> URL { folder.appendingPathComponent(name + ".md") }
    static func digest(_ instructions: String) -> String {
        SHA256.hash(data: Data(instructions.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    public func list() -> Catalogue {
        var entries: [Entry] = []
        var folderReason: String?
        do {
            try prepare()
            for file in try disk.files(folder).filter({ $0.hasSuffix(".md") }).sorted() {
                let name = String(file.dropLast(3))
                do {
                    try Self.validateName(name)
                    _ = try read(file, name: name)
                    entries.append(Entry(name: name, file: file, reason: nil))
                } catch { entries.append(Entry(name: name, file: file, reason: String(describing: error))) }
            }
        } catch { folderReason = String(describing: error) }
        if !entries.contains(where: { $0.name == "Default" && $0.reason == nil }) {
            entries.append(Entry(name: "Default", file: nil, reason: nil))
        }
        return Catalogue(entries: entries, folderReason: folderReason)
    }
    public func resolve(_ name: String) throws -> Template {
        try Self.validateName(name)
        do {
            try prepare()
            return try read(name + ".md", name: name)
        } catch {
            if name == "Default" { return Self.builtInDefault }
            throw Failure("\(name): \(error)")
        }
    }
    private static func validateName(_ name: String) throws {
        guard !name.isEmpty, !name.contains("/"), !name.contains("\\"), name != ".", name != ".." else { throw Failure("Invalid template name: \(name)") }
    }
    private func read(_ file: String, name: String) throws -> Template {
        let template = try Self.parse(disk.read(folder.appendingPathComponent(file)))
        guard template.name == name else { throw Failure("Metadata name must match filename: \(name)") }
        return template
    }

    private struct Metadata: Codable {
        var name: String
        var headings: [[Heading]]
        init(name: String, headings: [[Heading]]) { self.name = name; self.headings = headings }
        private enum CodingKeys: String, CodingKey { case name, headings }
        init(from decoder: any Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            name = try values.decode(String.self, forKey: .name)
            headings = try values.decodeIfPresent([[Heading]].self, forKey: .headings) ?? []
        }
    }
    public static func parse(_ text: String) throws -> Template {
        let lines = text.components(separatedBy: .newlines)
        guard lines.first == "---", let end = lines.dropFirst().firstIndex(of: "---") else { throw Failure("Metadata must be delimited by ---") }
        let metadata: Metadata
        do { metadata = try JSONDecoder().decode(Metadata.self, from: Data(lines[1..<end].joined(separator: "\n").utf8)) }
        catch { throw Failure("Metadata is not valid JSON: \(error)") }
        guard !metadata.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure("Metadata needs a name") }
        guard !metadata.headings.isEmpty, metadata.headings.allSatisfy({ $0.contains(where: \.required) }) else { throw Failure("Metadata needs required headings in every heading set") }
        for headings in metadata.headings {
            let names = headings.map(\.name)
            guard names.allSatisfy({ !$0.isEmpty && $0 == $0.trimmingCharacters(in: .whitespacesAndNewlines) && $0.rangeOfCharacter(from: .newlines) == nil }),
                  Set(names).count == names.count else { throw Failure("Metadata headings must be nonempty, unique, single-line and have no surrounding whitespace") }
        }
        let body = lines[(end + 1)...].joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { throw Failure("Instructions are empty") }
        return Template(name: metadata.name, instructions: body, headings: metadata.headings)
    }
    public static func encode(_ template: Template) throws -> String {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let metadata = try encoder.encode(Metadata(name: template.name, headings: template.headings))
        return "---\n" + String(decoding: metadata, as: UTF8.self) + "\n---\n" + template.instructions + "\n"
    }
}
