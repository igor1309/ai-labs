import Foundation

public enum FolioDocumentError: Error, Equatable, Sendable {
    case emptyDocument
    case unreadableFile
    case unsupportedExtension(String)
    case unsupportedTextEncoding
}

public struct FolioDocument: Equatable, Sendable {
    public let fileName: String
    public let text: String

    public init(fileName: String, text: String) throws {

        let trimmedFileName = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.isSupportedFileName(trimmedFileName) else {
            throw FolioDocumentError.unsupportedExtension((trimmedFileName as NSString).pathExtension)
        }
        guard text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            throw FolioDocumentError.emptyDocument
        }

        self.fileName = trimmedFileName
        self.text = text
    }

    public static func isSupportedFileName(_ fileName: String) -> Bool {

        switch (fileName as NSString).pathExtension.lowercased() {
        case "markdown", "md", "txt":
            true
        default:
            false
        }
    }
}

public enum FolioDocumentLoader {

    public static func load(data: Data?, fileName: String) throws -> FolioDocument {

        guard let data else {
            throw FolioDocumentError.unreadableFile
        }
        guard let text = String(data: data, encoding: .utf8) else {
            throw FolioDocumentError.unsupportedTextEncoding
        }

        return try FolioDocument(fileName: fileName, text: text)
    }
}
