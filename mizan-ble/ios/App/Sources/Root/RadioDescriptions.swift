extension HostBluetoothState: LogDescribable {
    public var logDescription: String {
        switch self {
        case .unknown: "unknown"
        case .resetting: "resetting"
        case .unsupported: "unsupported"
        case .unauthorized: "unauthorized"
        case .poweredOff: "poweredOff"
        case .poweredOn: "poweredOn"
        }
    }
}

extension HostRadioFailure: LogDescribable {
    public var logDescription: String {
        switch self {
        case .system: "system"
        case .messageTooLarge(let maximum, let actual): "messageTooLarge maximum=\(maximum) actual=\(actual)"
        }
    }
}

extension HostRadioEvent: LogDescribable {
    public var logDescription: String {
        switch self {
        case .bluetoothState(let state): "bluetoothState \(state.logDescription)"
        case .onAir: "onAir"
        case .couldNotGoOnAir(_, let failure): "couldNotGoOnAir \(failure.logDescription)"
        case .clientKey(_, _, let bytes): "clientKey bytes=\(bytes.count)"
        case .decision(_, let bytes): "decision bytes=\(bytes.count)"
        case .clientLost: "clientLost"
        }
    }
}

extension ClientBluetoothState: LogDescribable {
    public var logDescription: String {
        switch self {
        case .unknown: "unknown"
        case .resetting: "resetting"
        case .unsupported: "unsupported"
        case .notAllowed: "notAllowed"
        case .off: "off"
        case .on: "on"
        }
    }
}

extension ClientRadioFailure: LogDescribable {
    public var logDescription: String {
        switch self {
        case .noService: "noService"
        case .missingCharacteristic: "missingCharacteristic"
        case .notificationsDisabled: "notificationsDisabled"
        case .unavailableHost: "unavailableHost"
        case .notConnected: "notConnected"
        case .tooLarge(let maximum): "tooLarge maximum=\(maximum)"
        case .bluetooth(let state): "bluetooth \(state.logDescription)"
        case .att: "att"
        case .transport: "transport"
        case .disconnected: "disconnected"
        }
    }
}

extension ClientWriteTarget: LogDescribable {
    public var logDescription: String {
        switch self {
        case .key: "key"
        case .message: "message"
        }
    }
}

extension ClientRadioEvent: LogDescribable {
    public var logDescription: String {
        switch self {
        case .bluetooth(let state): "bluetooth \(state.logDescription)"
        case .reading: "reading"
        case .connected(_, let bytes, let maximum): "connected bytes=\(bytes.count) largestWrite=\(maximum)"
        case .couldNotConnect(_, let failure): "couldNotConnect \(failure.logDescription)"
        case .writeAnswered(let target, let failure): "writeAnswered \(target.logDescription) \(failure?.logDescription ?? "succeeded")"
        case .message(_, let bytes): "message bytes=\(bytes.count)"
        case .dropped: "dropped"
        }
    }
}
