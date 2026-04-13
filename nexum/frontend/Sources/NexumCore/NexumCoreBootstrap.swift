#if canImport(IMRxObservation)
import IMRxObservation
#endif

public enum NexumCoreBootstrap {

    public static let observationRuntime = "IMRxObservation"

    public static func message() -> String {

        return "NexumCore ready"
    }
}
