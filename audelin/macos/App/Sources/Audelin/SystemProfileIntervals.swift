import Composer
import os

extension ProfileIntervals {
    static var systemIntervals: Self {
        let log = OSLog(subsystem: "dev.igor1309.audelin", category: .pointsOfInterest)
        return Self { name in
            let id = OSSignpostID(log: log)
            os_signpost(.begin, log: log, name: name, signpostID: id)
            return { os_signpost(.end, log: log, name: name, signpostID: id) }
        }
    }
}
