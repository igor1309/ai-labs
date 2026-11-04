/// Production elapsed-time and written-later span rendering.
public enum ReadingFormatting {

    private static func seconds(_ value: Double) -> Int {

        guard value.isFinite, value > 0 else { return 0 }
        return Int(min(value.rounded(.down), Double(Int.max / 2)))
    }

    private static func padded(_ value: Int) -> String {

        value < 10 ? "0\(value)" : String(value)
    }

    public static func lineTime(_ value: Double) -> String {

        let seconds = seconds(value)
        return "\(padded(seconds / 60)):\(padded(seconds % 60))"
    }

    public static func recordingTime(_ value: Double) -> String {

        let seconds = seconds(value)
        return "\(padded(seconds / 3600)):\(padded(seconds / 60 % 60)):\(padded(seconds % 60))"
    }

    public static func span(_ start: String, _ end: String) -> String {

        "\(start)–\(end)"
    }
}
