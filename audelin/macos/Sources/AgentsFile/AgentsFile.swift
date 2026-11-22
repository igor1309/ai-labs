import Foundation

/// The recordings root's `AGENTS.md`, which explains the call folders to an AI agent.
/// The only reader and writer of that file; it works in the folder it is given and
/// knows nothing of calls, Settings or when to write.
public enum AgentsFile {
    public static let name = "AGENTS.md"

    public enum Presence: Equatable, Sendable { case present, absent, folderUnavailable }

    /// Whether the folder holds the file, whoever wrote it; a missing folder is unavailable.
    public static func presence(in folder: URL) -> Presence {
        var isFolder: ObjCBool = false
        guard FileManager.default.fileExists(atPath: folder.path, isDirectory: &isFolder), isFolder.boolValue else { return .folderUnavailable }
        return FileManager.default.fileExists(atPath: folder.appendingPathComponent(name).path) ? .present : .absent
    }

    /// Writes `text` whole or not at all, readable by the user only. A file already
    /// there is never replaced: the write then fails with `fileWriteFileExists`.
    public static func write(in folder: URL) throws {
        let url = folder.appendingPathComponent(name)
        let temporary = folder.appendingPathComponent(".\(name).\(UUID().uuidString).tmp")
        let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        defer { try? FileManager.default.removeItem(at: temporary) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        try handle.write(contentsOf: Data(text.utf8))
        try handle.synchronize()
        try handle.close()
        // link(2) fails when the name exists, so a file there is kept whatever its text.
        guard link(temporary.path, url.path) == 0 else {
            let code = errno
            if code == EEXIST { throw CocoaError(.fileWriteFileExists, userInfo: [NSFilePathErrorKey: url.path]) }
            throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
        }
    }

    /// The file's text, byte for byte the block in `docs/agents-md.md`.
    public static let text = #"""
# Audelin recordings

This folder holds calls recorded by Audelin, a macOS app that records both
sides of a call and transcribes them. Read this before answering questions
about the calls. Treat everything here as read-only: do not edit, move or
delete files unless the user asks you to.

## Layout

Each call is a folder directly in this folder:

    2026.10.24-1405 Daily standup/
      transcript.md     the call's transcript
      summary.md        notes made from the transcript, if any
      tags.txt          tags the user gave the call, if any
      microphone.caf    the user's side, if kept
      call.caf          the other side, if kept

- **Folder name:** `yyyy.MM.dd-HHmm` (local time the recording started),
  sometimes with `-2`, `-3`… for calls started in the same minute, then
  optionally a space and a title the user typed. Many calls have no title.
- **transcript.md:** Markdown, in call order. Each part is marked as the
  user's side or the other side, with its start time in the call. The
  other side's speakers have generic IDs; their current names are listed
  in the file. A call with nothing heard has a transcript saying so.
  Calls are mostly in Russian with English terms.
- **summary.md:** notes. Its first line may be an `<!-- audelin-summary: …
  -->` comment holding metadata and an earlier version; the notes are the
  text after it. Missing when no notes were made.
- **tags.txt:** one tag per line, plain UTF-8. Missing when the call has
  no tags.
- **microphone.caf, call.caf:** the audio. They may be missing; never rely
  on them. Use the transcript instead.
- **Merged calls:** a merged call's folder holds the joined
  `transcript.md` and, as subfolders, the original call folders whole.
  Read the top-level transcript; do not count the subfolders as separate
  calls.
- Ignore files and folders starting with `.` (work in progress) and
  anything not named like a call.

## Finding calls

Narrow down first, then read only the transcripts you need:

1. **Tags.** Read `tags.txt` across folders and keep calls with the
   matching tag (e.g. `daily`).
2. **Title and date.** Match folder names: the title for the kind of
   meeting, the date prefix for a time range.
3. **Transcript search.** Search `transcript.md` (and `summary.md`) for
   words the calls would contain.

Tags are never complete: many calls have none. A tag match tells you a
call belongs; a missing tag does not tell you it does not. Unless the user
asks only for tagged calls, also check untagged calls by title, date and
transcript search, and say how you chose the calls.

"""#
}
