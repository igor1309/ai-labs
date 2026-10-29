import DesignSystem
import ModeSwitchUI
import Observation
import Settings

public typealias Side = DesignSystem.Side

public struct AppModeState: Equatable, Sendable, LogDescribable {
    public var side: Side
    public var isAtRest: Bool
    public var logDescription: String { "\(side.logName) \(isAtRest ? "atRest" : "busy")" }
}

@MainActor @Observable public final class AppRoot {
    public let radios: RadioPair
    public private(set) var state: AppModeState
    private let modeLog: ModeLog
    private(set) var host: HostMode?
    private(set) var client: ClientMode?
    private let clock: any ClockPort
    private let settings: Settings
    private let log: any LogSink
    private var bluetooth: HostBluetoothState = .unknown
    private var clientBluetooth: ClientBluetoothState = .unknown
    @ObservationIgnored private var clientRadioTask: Task<Void, Never>?
    @ObservationIgnored private var radioTask: Task<Void, Never>?

    public var isAtRest: Bool { host?.isAtRest ?? client?.isAtRest ?? true }

    public var modeSwitchState: ModeSwitchState { .init(side: state.side, isEnabled: isAtRest) }

    public init(radios: RadioPair, launchSide: Side, clock: any ClockPort, store: any SettingsStore, log: any LogSink) {
        self.radios = .init(host: LoggedHostRadio(radios.host, log: log), client: LoggedClientRadio(radios.client, log: log))
        state = .init(side: launchSide, isAtRest: true)
        modeLog = ModeLog(sink: log)
        self.clock = clock
        self.settings = Settings(store: store)
        self.log = log
        buildMode()
        let source = self.radios.host.events
        radioTask = Task.immediate { [weak self] in
            for await event in source {
                guard !Task.isCancelled else { return }
                self?.receive(event)
            }
        }
        let clientSource = self.radios.client.events
        clientRadioTask = Task.immediate { [weak self] in
            for await event in clientSource {
                guard !Task.isCancelled else { return }
                if case .bluetooth(let value) = event { self?.clientBluetooth = value }
                self?.client?.receive(event)
            }
        }
    }

    public func choose(_ side: Side) {
        guard isAtRest, state.side != side else { return }
        tearDownMode()
        state = .init(side: side, isAtRest: true)
        buildMode()
    }

    deinit { radioTask?.cancel(); clientRadioTask?.cancel() }

    private func receive(_ event: HostRadioEvent) {
        if case .bluetoothState(let value) = event { bluetooth = value }
        host?.receive(event)
    }

    private func tearDownMode() {
        client?.stop()
        client = nil
        host?.stop()
        host = nil
        modeLog.tornDown(state.side)
    }
    private func buildMode() {
        modeLog.built(state.side)
        if state.side == .host {
            host = HostMode(radio: radios.host, clock: clock, settings: settings, bluetooth: bluetooth, log: log,
                            restChanged: { [weak self] in self?.updateRest() })
        } else {
            client = ClientMode(radio: radios.client, clock: clock, settings: settings, bluetooth: clientBluetooth, log: log,
                                restChanged: { [weak self] in self?.updateRest() })
        }
    }
    private func updateRest() {
        guard state.isAtRest != isAtRest else { return }
        state.isAtRest = isAtRest
        modeLog.state(state)
    }
}

private struct ModeLog {
    let sink: any LogSink
    func built(_ side: Side) { sink.write(.init(category: .mode, message: "\(side.logName) built")) }
    func tornDown(_ side: Side) { sink.write(.init(category: .mode, message: "\(side.logName) tornDown")) }
    func state(_ state: AppModeState) { sink.write(.init(category: .mode, message: state.logDescription)) }
}

private extension Side {
    var logName: String {
        switch self {
        case .host: "host"
        case .client: "client"
        }
    }
}
