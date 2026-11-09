import Foundation
import Preferences
import Root
import ScriptedRadio
import SwiftUI
import SystemClock
import UIKit

@main struct MizanBLERehearsalApp: App {
    @State private var root: AppRoot

    init() {
        let arguments = ProcessInfo.processInfo.arguments
        let path: String
        if let flag = arguments.firstIndex(of: "-scriptedRadio"), arguments.indices.contains(flag + 1) {
            path = arguments[flag + 1]
        } else {
            path = URL.documentsDirectory.appending(path: "scripted-radio.json").path
        }
        let side: Side = UIDevice.current.userInterfaceIdiom == .pad ? .host : .client
        let log = SystemLogSink()
        let clock = SystemClock()
        _root = State(initialValue: AppRoot(
            radios: scriptedRadios(settingsPath: path, clock: clock, log: log), launchSide: side, clock: clock,
            store: Preferences.app(), log: log
        ))
    }

    var body: some Scene {
        WindowGroup { RootView(root: root) }
    }
}
