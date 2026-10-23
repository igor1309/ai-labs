// Does a Core Audio process tap deliver samples while the tapped process plays silence,
// or while it renders nothing at all (stopped)? Taps only an afplay child, muted.
import Foundation
import CoreAudio
import AVFAudio

let rate = 48_000.0
let url = URL(fileURLWithPath: "/tmp/tap-probe/tone.wav")
// 0-2 s tone, 2-4 s digital silence, 4-10 s tone
do {
    let fmt = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
    let file = try AVAudioFile(forWriting: url, settings: fmt.settings)
    let n = AVAudioFrameCount(rate * 10)
    let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: n)!
    buf.frameLength = n
    for i in 0..<Int(n) {
        let t = Double(i) / rate
        buf.floatChannelData![0][i] = (t >= 2 && t < 4) ? 0 : Float(0.3 * sin(2 * .pi * 440 * t))
    }
    try file.write(from: buf)
}

let player = Process()
player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
player.arguments = [url.path]
try player.run()
let t0 = Date()
func now() -> Double { Date().timeIntervalSince(t0) }
Thread.sleep(forTimeInterval: 0.3)

var pid = player.processIdentifier
var procObj = AudioObjectID(0)
var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
var size = UInt32(MemoryLayout<AudioObjectID>.size)
var st = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, UInt32(MemoryLayout<pid_t>.size), &pid, &size, &procObj)
print("translate pid \(pid): status \(st) obj \(procObj)")

let desc = CATapDescription(stereoMixdownOfProcesses: [procObj])
desc.uuid = UUID()
desc.muteBehavior = .muted
desc.isPrivate = true
var tap = AudioObjectID(0)
st = AudioHardwareCreateProcessTap(desc, &tap)
print("create tap: status \(st) id \(tap)")

let agg: [String: Any] = [
    kAudioAggregateDeviceNameKey: "tap-probe",
    kAudioAggregateDeviceUIDKey: "tap-probe-\(UUID().uuidString)",
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: desc.uuid.uuidString]],
]
var dev = AudioObjectID(0)
st = AudioHardwareCreateAggregateDevice(agg as CFDictionary, &dev)
print("create aggregate: status \(st) id \(dev)")

let lock = NSLock()
var rows: [(Double, Double, Int, Float)] = []  // wall, sampleTime, frames, peak
var ioproc: AudioDeviceIOProcID?
st = AudioDeviceCreateIOProcIDWithBlock(&ioproc, dev, nil) { _, input, inTime, _, _ in
    let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
    var peak: Float = 0
    var frames = 0
    for b in abl {
        guard let d = b.mData else { continue }
        let c = Int(b.mDataByteSize) / 4
        frames = c / Int(max(b.mNumberChannels, 1))
        let p = d.assumingMemoryBound(to: Float.self)
        for i in 0..<c { peak = max(peak, abs(p[i])) }
    }
    lock.lock(); rows.append((now(), inTime.pointee.mSampleTime, frames, peak)); lock.unlock()
}
print("ioproc: status \(st)")
st = AudioDeviceStart(dev, ioproc)
print("start: status \(st)")

// stop the player's rendering 6.0-8.0 s (process alive, renders nothing)
Thread.sleep(forTimeInterval: 6.0 - now())
kill(pid, SIGSTOP); print(String(format: "SIGSTOP at %.2f", now()))
Thread.sleep(forTimeInterval: 2.0)
kill(pid, SIGCONT); print(String(format: "SIGCONT at %.2f", now()))
player.waitUntilExit()
print(String(format: "afplay exited at %.2f", now()))
Thread.sleep(forTimeInterval: 2.0)   // process gone
AudioDeviceStop(dev, ioproc)
AudioDeviceDestroyIOProcID(dev, ioproc!)
AudioHardwareDestroyAggregateDevice(dev)
AudioHardwareDestroyProcessTap(tap)

// summarise per 0.5 s of wall time
lock.lock(); let all = rows; lock.unlock()
print("callbacks \(all.count)")
var bucket = -1
var cb = 0, fr = 0, pk: Float = 0, firstST = 0.0, lastST = 0.0
func flush() { if bucket >= 0 { print(String(format: "%5.1f-%4.1f s  callbacks %3d  frames %6d  sampleTime %9.0f..%9.0f  peak %.3f", Double(bucket)/2, Double(bucket+1)/2, cb, fr, firstST, lastST, pk)) } }
for r in all {
    let b = Int(r.0 * 2)
    if b != bucket { flush(); bucket = b; cb = 0; fr = 0; pk = 0; firstST = r.1 }
    cb += 1; fr += r.2; pk = max(pk, r.3); lastST = r.1
}
flush()
