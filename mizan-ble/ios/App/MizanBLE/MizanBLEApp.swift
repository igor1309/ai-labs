import DeviceRadios
import Root
import SwiftUI
import UIKit

@main struct MizanBLEApp: App {
    @State private var root: AppRoot

    init() {
        let side: Side = UIDevice.current.userInterfaceIdiom == .pad ? .host : .client
        _root = State(initialValue: AppRoot(radios: deviceRadios(), launchSide: side, log: SystemLogSink()))
    }

    var body: some Scene {
        WindowGroup { RootView(root: root) }
    }
}
