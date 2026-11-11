import Foundation

/// The language Settings shows its text in.
public enum SettingsLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of Settings text; its raw value is the key in the strings tables.
public enum SettingsPhrase: String, CaseIterable, Sendable {

    /// Takes the call count and the total size.
    case moveTitle = "move.title"
    /// Takes the call count, the total size and the destination path.
    case moveBody = "move.body"
    /// Takes the moved and total call counts, then the moved and total sizes.
    case moveDetail = "move.detail"
    /// Takes the moved and total call counts.
    case moveMoved = "move.moved"
    case moveCounting = "move.counting"
    case windowTitle = "window.title"
    case pickerFailed = "folder.pickerFailed"
    /// Takes the earlier failure, then the refresh's reason.
    case refreshFailed = "calls.refreshFailed"
    /// Takes the call id.
    case callNotFound = "calls.notFound"
    /// Takes the call id.
    case callAmbiguous = "calls.ambiguous"
    case callInvalidTitle = "calls.invalidTitle"
    /// Takes the folder name and the system's reason.
    case callTrashFailed = "calls.trashFailed"
    case callSizeMismatch = "calls.sizeMismatch"
    case moveRefreshing = "move.refreshing"
    case generalTab = "tab.general"
    case languageRow = "general.languageRow"
    case appearanceRow = "general.appearanceRow"
    case languageSystem = "general.languageSystem"
    case appearanceSystem = "general.appearanceSystem"
    case appearanceLight = "general.appearanceLight"
    case appearanceDark = "general.appearanceDark"
    case appearanceHint = "general.appearanceHint"
    case appearanceHintLight = "general.appearanceHintLight"
    case appearanceHintDark = "general.appearanceHintDark"
    /// System gives the macOS language, which Audelin has.
    case languageHintSystem = "general.languageHintSystem"
    /// Takes the macOS language's name, which Audelin does not have.
    case languageHintFallback = "general.languageHintFallback"
    /// Takes the macOS language's name, while another language is chosen.
    case languageHintForced = "general.languageHintForced"
    case recordingTab = "tab.recording"
    case callNotesTab = "tab.callNotes"
    case recordingRow = "row.recording"
    case folderRow = "row.folder"
    case engineRow = "row.engine"
    case audioRow = "row.audio"
    case explainRow = "row.explain"
    case chunkRow = "row.chunk"
    case recordsCalls = "recording.automatic"
    case recordsCallsNote = "recording.automaticNote"
    case liveText = "recording.liveText"
    case liveTextNote = "recording.liveTextNote"
    case changeFolder = "folder.change"
    case folderIdle = "folder.idle"
    case folderPartlyHere = "folder.partlyHere"
    case retry = "folder.retry"
    case cancel = "folder.cancel"
    case folderRecording = "folder.recording"
    case pickerFailedReason = "folder.pickerFailedReason"
    case audioNote = "audio.note"
    case explainNote = "explain.note"
    case chunkSeconds = "chunk.seconds"
    case chunkNote = "chunk.note"
    case confirmMove = "move.confirm"
    case localRecognition = "engine.localNote"
    case notesLoading = "notes.loading"
    case notesEditing = "notes.editing"
    case notesValidating = "notes.validating"
    case notesSaving = "notes.saving"
    case notesSaved = "notes.saved"
    case notesLoadFailedMessage = "notes.loadFailedMessage"
    case notesSaveFailedMessage = "notes.saveFailedMessage"
    case notesLoadFailed = "notes.loadFailed"
    case notesSaveFailed = "notes.saveFailed"
    case notesRetry = "notes.retry"
    case notesValidate = "notes.validate"
    case notesSave = "notes.save"
    case runtimeClaudeCLI = "runtime.claudeCLI"
    case runtimeLoopback = "runtime.loopback"
    case runtimeRemote = "runtime.remote"
    case runtimeConfiguredAPI = "runtime.configuredAPI"
    case runtimeNoFallback = "runtime.noFallback"
    case notesDisclosure = "notes.disclosure"
    case notesDisclosureFallback = "notes.disclosureFallback"
    case findAutomatically = "field.findAutomatically"
    case variableName = "field.variableName"
    case primaryService = "runtime.primary"
    case fallbackService = "runtime.fallback"
    case fallbackNeedsSetup = "runtime.fallbackNeedsSetup"
    case compatibleAPI = "runtime.compatibleAPI"
    case notUsed = "runtime.unconfigured"
    case modelField = "field.model"
    case executableField = "field.executable"
    case endpointField = "field.endpoint"
    case credentialField = "field.credentialVariable"
    case issueAuthentication = "issue.authentication"
    case issueUnavailable = "issue.unavailable"
    case issueModel = "issue.model"
    case issueExecutable = "issue.executable"
    case issueEndpoint = "issue.endpoint"
    case issueCredential = "issue.credentialVariable"
    case issueFormat = "issue.format"
    case notesAutomatic = "notes.automatic"
    case notesAutomaticNote = "notes.automaticNote"
    case notesSpeakers = "notes.speakers"
    case notesDetails = "notes.details"
    case notesDetailData = "notes.detailData"
    case notesDetailCost = "notes.detailCost"
    case notesDetailCostBody = "notes.detailCostBody"
    case notesDetailCheck = "notes.detailCheck"
    case notesDetailCheckBody = "notes.detailCheckBody"
    case notesDetailClaudeBody = "notes.detailClaudeBody"
    case notesDetailKey = "notes.detailKey"
    case notesDetailKeyBody = "notes.detailKeyBody"
    case notesOptional = "notes.optional"
    case notesService = "notes.service"
    case notesFallbackNote = "notes.fallbackNote"
}

/// Looks up Settings text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
/// Formats fill in their arguments with the language's plural rules.
public struct SettingsText: Equatable, Sendable {

    public let language: SettingsLanguage

    public init(language: SettingsLanguage) {

        self.language = language
    }

    public var locale: Locale { Locale(identifier: language.rawValue) }

    public func callAsFunction(_ phrase: SettingsPhrase, _ arguments: any CVarArg...) -> String {

        let format = self(phrase.rawValue)
        return arguments.isEmpty ? format : String(format: format, locale: locale, arguments: arguments)
    }

    /// A byte count as a file size in the language.
    public func size(_ bytes: Int64) -> String {

        bytes.formatted(.byteCount(style: .file).locale(locale))
    }

    func callAsFunction(_ key: String) -> String {

        let russian = Self.table(.russian)?.localizedString(forKey: key, value: key, table: nil) ?? key
        guard language != .russian else { return russian }
        return Self.table(language)?.localizedString(forKey: key, value: russian, table: nil) ?? russian
    }

    private static func table(_ language: SettingsLanguage) -> Bundle? {

        resources.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    private static let resources = settingsBundle(mainBundleURL: Bundle.main.bundleURL)
}

func settingsBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // and tests use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_SettingsUI", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}
