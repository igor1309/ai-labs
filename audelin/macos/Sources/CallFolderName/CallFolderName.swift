import Foundation

/// The name of a call's folder: `<id>` or `<id> <title>`, where the id is a
/// local-time timestamp and, for a name already taken, a number from 2.
public struct CallFolderName: Equatable, Sendable {

    public let id: String
    public let title: String
    public let start: Date

    /// Reads only names this format can make, with a valid local timestamp.
    public init?(_ name: String, timeZone: TimeZone) {

        guard let range = name.range(of: #"^\d{4}\.\d{2}\.\d{2}-\d{4}(?:-[2-9][0-9]*|-1[0-9]+)?(?= |$)"#, options: .regularExpression) else { return nil }
        let id = String(name[range])
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy.MM.dd-HHmm"
        formatter.isLenient = false
        let timestamp = String(id.prefix(15))
        guard let start = formatter.date(from: timestamp), formatter.string(from: start) == timestamp else { return nil }
        let suffix = name[range.upperBound...]
        self.id = id
        self.title = suffix.isEmpty ? "" : String(suffix.dropFirst())
        self.start = start
    }

    /// The id for a call made at `date`; number 1 is the bare timestamp.
    public static func id(at date: Date, number: Int = 1, timeZone: TimeZone) -> String {

        // Digits from a fixed calendar, so the user's locale and calendar never reach the name.
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let base = String(format: "%04d.%02d.%02d-%02d%02d",
                          parts.year ?? 0, parts.month ?? 0, parts.day ?? 0, parts.hour ?? 0, parts.minute ?? 0)
        return number == 1 ? base : "\(base)-\(number)"
    }

    /// The whole name. `/` and `:` cannot be in a folder name; no title or an empty one leaves the bare id.
    public static func name(id: String, title: String?) -> String {

        let title = (title ?? "").replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        return title.isEmpty ? id : id + " " + title
    }
}
