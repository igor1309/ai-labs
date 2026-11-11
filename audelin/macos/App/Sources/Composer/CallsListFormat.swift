import CallsListUI
import Foundation

/// The calls list's words for dates and durations, in the list's language.
struct CallsListFormat {
    let calendar: Calendar
    let text: CallsListText

    init(timeZone: TimeZone, text: CallsListText) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = text.locale
        self.calendar = calendar
        self.text = text
    }

    /// A day's header: today, yesterday, the weekday and date within the last
    /// seven days, the date before that, with the year only when it is not this one.
    func day(_ date: Date, now: Date) -> String {
        let year = calendar.component(.year, from: date)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        switch days {
        case 0: return text(.today)
        case 1: return text(.yesterday)
        case 2..<7: return formatted(date, .weekdayDate)
        default: return formatted(date, year == calendar.component(.year, from: now) ? .dayMonth : .dayMonthYear)
        }
    }

    private func formatted(_ date: Date, _ pattern: CallsListPhrase) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = calendar.locale
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = text(pattern)
        let value = formatter.string(from: date)
        return value.prefix(1).uppercased() + value.dropFirst()
    }

    /// The start time, HH:mm.
    func time(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour!, parts.minute!)
    }

    /// A day header's call count in the language's plural form: 1 звонок, 2 звонка, 5 звонков.
    func count(_ calls: Int) -> String {
        let (last, lastTwo) = (calls % 10, calls % 100)
        let phrase: CallsListPhrase = last == 1 && lastTwo != 11 ? .callsOne
            : (2...4).contains(last) && !(12...14).contains(lastTwo) ? .callsFew : .callsMany
        return text(text.language == .english ? (calls == 1 ? .callsOne : .callsMany) : phrase, calls)
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
