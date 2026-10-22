import Foundation

/// A call folder's name, `yyyy.MM.dd-HHmm <title>`: the start in local time
/// keeps folders in time order, and the rest is the call's title.
public enum CallFolderName {
    /// A free name for a call that started at `start`, given the names
    /// already `taken` in the calls folder.
    public static func make(start: Date, title: String, taken: Set<String>, timeZone: TimeZone = .current) -> String {
        let base = formatter(timeZone).string(from: start) + " " + title.replacingOccurrences(of: "/", with: "-")
        guard taken.contains(base) else { return base }
        var suffix = 2
        while taken.contains("\(base) \(suffix)") { suffix += 1 }
        return "\(base) \(suffix)"
    }

    /// The start and title a name holds; a name renamed without its start
    /// has none.
    public static func read(_ name: String, timeZone: TimeZone = .current) -> (start: Date?, title: String) {
        let stamp = name.prefix(stampLength)
        guard stamp.count == stampLength,
              name.dropFirst(stampLength).first == " ",
              let start = formatter(timeZone).date(from: String(stamp))
        else { return (nil, name) }
        return (start, String(name.dropFirst(stampLength + 1)))
    }

    private static let stampLength = "yyyy.MM.dd-HHmm".count

    private static func formatter(_ timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy.MM.dd-HHmm"
        return formatter
    }
}
