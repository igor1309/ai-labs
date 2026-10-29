import Foundation
import Root
import ScriptedRadio
import SwiftUI
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
        _root = State(initialValue: AppRoot(radios: scriptedRadios(settingsPath: path, log: log), launchSide: side, log: log))
    }

    var body: some Scene {
        WindowGroup { RootView(root: root) }
    }
}
