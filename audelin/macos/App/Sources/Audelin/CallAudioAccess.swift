import CallAudioAccess
import CallAudioProbe
import Composer
import Foundation

func makeCallAudioAccess() async -> AccessPolicy {
    let environment = OutputEnvironment()
    let probe = CallAudioProbe()
    let model = CallAudioAccessModel(device: { await environment.device() }, now: { ProcessInfo.processInfo.systemUptime })
    await model.start(probe: {
        switch await probe.measure() {
        case .heard: .heard
        case .silent: .silent
        case .refused: .refused
        }
    }, sleep: { try await ContinuousClock().sleep(for: $0) }, changes: environment.changes)
    return await model.policy()
}

