import DeviceRadios
import Root
import SystemClock
import Preferences
import SwiftUI
import UIKit

@main struct MizanBLEApp: App {
    @State private var root: AppRoot

    init() {
        let side: Side = UIDevice.current.userInterfaceIdiom == .pad ? .host : .client
        let clock = SystemClock()
        _root = State(initialValue: AppRoot(radios: deviceRadios(clock: clock), launchSide: side, clock: clock,
                                             store: Preferences.app(), log: SystemLogSink()))
    }

    var body: some Scene {
        WindowGroup { RootView(root: root) }
    }
}
