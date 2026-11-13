import Foundation

/// The rehearsal keeps its window frames and divider in its own defaults domain,
/// apart from Audelin's. Clearing that domain before any window is made starts
/// each run with the default layout, whatever an earlier run left.
public func startWithDefaultLayout(_ defaults: UserDefaults = .standard,
                                   domain: String = Bundle.main.bundleIdentifier ?? ProcessInfo.processInfo.processName) {
    defaults.removePersistentDomain(forName: domain)
}
