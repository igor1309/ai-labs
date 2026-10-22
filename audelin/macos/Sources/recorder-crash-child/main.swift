import CallDomain
import Foundation
import Recorder
import RecorderTestSupport

// Recorder QA S-4: writes a known sweep into a call folder, says how far it
// got, and waits to be killed. Usage: recorder-crash-child <root> <call id> <seconds>
let arguments = CommandLine.arguments
let files = TempCallFiles(root: URL(fileURLWithPath: arguments[1]))
let call = CallID(UUID(uuidString: arguments[2])!)
let seconds = Int(arguments[3])!
let recorder = Recorder(call: call, files: files)
try recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)
for second in 0..<seconds {
    try recorder.write(Sweep.samples(from: Double(second), seconds: 1), to: .mic)
}
print("wrote \(seconds)")
fflush(stdout)
while true { sleep(60) }
