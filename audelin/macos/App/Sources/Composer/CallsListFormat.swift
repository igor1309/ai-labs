import Foundation

/// The calls list's words for dates and durations, in the list's language.
struct CallsListFormat {
    let calendar: Calendar

    init(timeZone: TimeZone) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "ru_RU")
        self.calendar = calendar
    }

    private static let weekdays = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]
    private static let months = ["января", "февраля", "марта", "апреля", "мая", "июня",
                                 "июля", "августа", "сентября", "октября", "ноября", "декабря"]

    /// A day's header: Сегодня, Вчера, the weekday and date within the last
    /// seven days, the date before that, with the year only when it is not this one.
    func day(_ date: Date, now: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day, .weekday], from: date)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        let dayMonth = "\(parts.day!) \(Self.months[parts.month! - 1])"
        switch days {
        case 0: return "Сегодня"
        case 1: return "Вчера"
        case 2..<7: return "\(Self.weekdays[parts.weekday! - 1]), \(dayMonth)"
        default:
            return parts.year == calendar.component(.year, from: now) ? dayMonth : "\(dayMonth) \(parts.year!)"
        }
    }

    /// The start time, HH:mm.
    func time(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour!, parts.minute!)
    }

    /// A day header's call count: 1 звонок, 2 звонка, 5 звонков.
    func count(_ calls: Int) -> String {
        let (last, lastTwo) = (calls % 10, calls % 100)
        let word = last == 1 && lastTwo != 11 ? "звонок" : (2...4).contains(last) && !(12...14).contains(lastTwo) ? "звонка" : "звонков"
        return "\(calls) \(word)"
    }

    /// The folder's start stamp, yyyy.MM.dd-HHmm, the title of an untitled call.
    func stamp(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return String(format: "%04d.%02d.%02d-%02d%02d", parts.year!, parts.month!, parts.day!, parts.hour!, parts.minute!)
    }

    /// The length as m:ss, or h:mm:ss from an hour; — when it is not known.
    func duration(_ seconds: TimeInterval?) -> String {
        guard let seconds, seconds.isFinite, seconds >= 0 else { return "—" }
        let total = Int(min(seconds, Double(Int.max / 2)))
        let (hours, minutes, rest) = (total / 3600, total / 60 % 60, total % 60)
        return hours > 0 ? String(format: "%d:%02d:%02d", hours, minutes, rest) : String(format: "%d:%02d", minutes, rest)
    }
}
