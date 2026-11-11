import CallsListUI
import Foundation
import Testing
@testable import Composer

struct CallsListFormatTests {
    private let format = CallsListFormat(timeZone: TimeZone(identifier: "Asia/Tokyo")!, text: .init(language: .russian))
    private func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

    @Test(arguments: [
        ("2026-11-11T00:00:00+09:00", "Сегодня"),
        ("2026-11-10T23:59:00+09:00", "Вчера"),
        ("2026-11-09T12:00:00+09:00", "Понедельник, 9 ноября"),
        ("2026-11-05T12:00:00+09:00", "Четверг, 5 ноября"),
        ("2026-11-04T12:00:00+09:00", "4 ноября"),
        ("2026-01-01T00:00:00+09:00", "1 января"),
        ("2025-12-31T23:59:00+09:00", "31 декабря 2025"),
    ])
    func dayTitleCountsCalendarDaysInTheCallsTimeZone(start: String, expected: String) {
        #expect(format.day(date(start), now: date("2026-11-11T18:00:00+09:00")) == expected)
    }

    @Test func timesAndStampsUseTheCallsTimeZone() {
        let start = date("2026-10-24T05:25:00Z")
        #expect(format.time(start) == "14:25")
        #expect(format.stamp(start) == "2026.10.24-1425")
    }

    @Test(arguments: [(nil, "—"), (.infinity, "—"), (-1, "—"), (0, "0:00"), (59.9, "0:59"), (2_820, "47:00"),
                      (3_599, "59:59"), (3_600, "1:00:00"), (4_360, "1:12:40")] as [(Double?, String)])
    func durationIsMinutesAndSecondsOrHoursFromAnHour(seconds: Double?, expected: String) {
        #expect(format.duration(seconds) == expected)
    }

    @Test(arguments: [(1, "1 звонок"), (2, "2 звонка"), (4, "4 звонка"), (5, "5 звонков"), (11, "11 звонков"),
                      (12, "12 звонков"), (21, "21 звонок"), (22, "22 звонка"), (111, "111 звонков")])
    func countAgreesWithTheNumber(calls: Int, expected: String) {
        #expect(format.count(calls) == expected)
    }
}
