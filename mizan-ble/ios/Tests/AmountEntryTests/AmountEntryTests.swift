import AmountEntry
import Testing

typealias Entry = AmountEntry
private typealias Key = Entry.Key

struct AmountEntryTests {
    @Test func typingAnAmount() {
        var state = Entry.State(bluetooth: .available)
        let rows: [(Key, String, Bool)] = [
            (.digit(.one), "1", true),
            (.digit(.two), "12", true),
            (.digit(.four), "124", true),
            (.decimalPoint, "124.", true),
            (.digit(.five), "124.5", true),
        ]
        for (key, amount, canLock) in rows {
            state = send(.key(key), to: state)
            #expect(state.amount == amount)
            #expect(state.canLock == canLock)
            #expect(state.bluetooth == .available)
        }
    }

    @Test(arguments: Entry.Digit.allCases)
    func thirdDecimalIsIgnored(_ digit: Entry.Digit) {
        let before = enter("124.50", bluetooth: .available)
        let after = send(.key(.digit(digit)), to: before)
        #expect(after.amount == "124.50")
        #expect(after == before)
        #expect(after.canLock)
    }

    @Test(arguments: Entry.Digit.allCases)
    func seventhWholeDigitIsIgnored(_ digit: Entry.Digit) {
        let before = enter("999999", bluetooth: .available)
        let after = send(.key(.digit(digit)), to: before)
        #expect(after.amount == "999999")
        #expect(after == before)
        #expect(after.canLock)
    }

    @Test func secondDecimalPointIsIgnored() {
        for amount in ["12.", "12.3", "12.30"] {
            let before = enter(amount, bluetooth: .available)
            let after = send(.key(.decimalPoint), to: before)
            #expect(after.amount == amount)
            #expect(after == before)
            #expect(after.canLock)
        }
    }

    @Test(arguments: Entry.Digit.allCases)
    func leadingZeroIsReplaced(_ digit: Entry.Digit) {
        let before = enter("0", bluetooth: .available)
        let after = send(.key(.digit(digit)), to: before)
        #expect(after.amount == digit.rawValue)
        #expect(after.canLock == (digit != .zero))
    }

    @Test func zeroCannotBeLocked() {
        for amount in ["0", "0.", "0.0", "0.00"] {
            let state = enter(amount, bluetooth: .available)
            #expect(state.amount == amount)
            #expect(!state.canLock)
        }
    }

    @Test func deleteRemovesTheLastKey() {
        var state = enter("124.5", bluetooth: .available)
        for (amount, canLock) in [
            ("124.", true), ("124", true), ("12", true), ("1", true), ("", false), ("", false),
        ] {
            state = send(.key(.delete), to: state)
            #expect(state.amount == amount)
            #expect(state.canLock == canLock)
        }
    }

    @Test func deleteUndoesALeadingDecimalPointInOnePress() {
        let state = send(.key(.delete), to: enter(".", bluetooth: .available))
        #expect(state.amount == "")
    }

    @Test func bluetoothUnavailableReportsTheReasonAndPreventsLocking() {
        var state = enter("124.5", bluetooth: .available)
        for reason in ["off", "unauthorized", "unsupported"] {
            state = send(.bluetoothChanged(.unavailable(reason: reason)), to: state)
            #expect(state.amount == "124.5")
            #expect(state.bluetooth == .unavailable(reason: reason))
            #expect(!state.canLock)
        }
    }

    @Test func emptyAmountCannotBeLocked() {
        let state = Entry.State(bluetooth: .available)
        #expect(state.amount.isEmpty)
        #expect(!state.canLock)
    }

    @Test func decimalPointStartsAFraction() {
        let state = enter(".05", bluetooth: .available)
        #expect(state.amount == ".05")
        #expect(state.canLock)
    }

    @Test func sixWholeDigitsCanStillHaveTwoDecimals() {
        let state = enter("999999.99", bluetooth: .available)
        #expect(state.amount == "999999.99")
        #expect(state.canLock)
    }

    @Test func deleteMakesRoomForAnotherDigit() {
        for (amount, expected) in [("123456", "123457"), ("123.45", "123.47")] {
            var state = enter(amount, bluetooth: .available)
            state = send(.key(.delete), to: state)
            state = send(.key(.digit(.seven)), to: state)
            #expect(state.amount == expected)
            #expect(state.canLock)
        }
    }

    @Test func bluetoothRecoveryReevaluatesTheCurrentAmount() {
        for (amount, canLock) in [("124.5", true), ("0.00", false), ("", false)] {
            var state = enter(amount, bluetooth: .unavailable(reason: "off"))
            #expect(state.amount == amount)
            #expect(state.bluetooth == .unavailable(reason: "off"))
            #expect(!state.canLock)
            state = send(.bluetoothChanged(.available), to: state)
            #expect(state.amount == amount)
            #expect(state.bluetooth == .available)
            #expect(state.canLock == canLock)
        }
    }

    @Test func clearStartsANewAmountAndPreservesBluetooth() {
        for bluetooth: Entry.Bluetooth in [.available, .unavailable(reason: "off")] {
            var state = enter("124.5", bluetooth: bluetooth)
            state = send(.clear, to: state)
            #expect(state.amount.isEmpty)
            #expect(state.bluetooth == bluetooth)
            #expect(!state.canLock)
            state = send(.key(.digit(.seven)), to: state)
            #expect(state.amount == "7")
            #expect(state.bluetooth == bluetooth)
            #expect(state.canLock == (bluetooth == .available))
        }
    }
}

private func enter(_ amount: String, bluetooth: Entry.Bluetooth) -> Entry.State {
    var state = Entry.State(bluetooth: bluetooth)
    for character in amount {
        let key: Key = character == "."
            ? .decimalPoint : .digit(Entry.Digit(rawValue: String(character))!)
        state = send(.key(key), to: state)
    }
    return state
}

private func send(_ event: Entry.Event, to state: Entry.State) -> Entry.State {
    let (next, effect): (Entry.State, Never?) = Entry.reduce(state, event)
    #expect(effect == nil)
    return next
}
