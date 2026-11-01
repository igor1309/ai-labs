// Is a process's microphone use (IsRunningInput) told by Core Audio notifications on this Mac?
// Reads flags only; opens no microphone itself.
import Foundation
import CoreAudio

setvbuf(stdout, nil, _IOLBF, 0)
let t0 = Date()
func now() -> String { String(format: "%6.2f", Date().timeIntervalSince(t0)) }
let sys = AudioObjectID(kAudioObjectSystemObject)
let q = DispatchQueue(label: "probe")
func addr(_ s: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: s, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}
func processes() -> [AudioObjectID] {
    var a = addr(kAudioHardwarePropertyProcessObjectList); var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(sys, &a, 0, nil, &size)
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / 4)
    AudioObjectGetPropertyData(sys, &a, 0, nil, &size, &ids); return ids
}
func flag(_ o: AudioObjectID, _ s: AudioObjectPropertySelector) -> UInt32 {
    var a = addr(s); var v: UInt32 = 0; var n = UInt32(4); AudioObjectGetPropertyData(o, &a, 0, nil, &n, &v); return v
}
func bundle(_ o: AudioObjectID) -> String {
    var a = addr(kAudioProcessPropertyBundleID); var s: Unmanaged<CFString>?; var n = UInt32(MemoryLayout<CFString?>.size)
    guard AudioObjectGetPropertyData(o, &a, 0, nil, &n, &s) == 0, let v = s?.takeRetainedValue() as String?, !v.isEmpty else {
        var pa = addr(kAudioProcessPropertyPID); var p: pid_t = 0; var pn = UInt32(4)
        AudioObjectGetPropertyData(o, &pa, 0, nil, &pn, &p); return "pid \(p)"
    }
    return v
}
func code(_ s: AudioObjectPropertySelector) -> String { String([24, 16, 8, 0].map { Character(UnicodeScalar(UInt8((s >> $0) & 0xff))) }) }

var input: [AudioObjectID: UInt32] = [:]
func watch(_ o: AudioObjectID) {
    guard input[o] == nil else { return }
    input[o] = flag(o, kAudioProcessPropertyIsRunningInput)
    if input[o] == 1 { print("\(now()) \(bundle(o)) already using the microphone") }
    var a = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertySelectorWildcard, mScope: kAudioObjectPropertyScopeWildcard, mElement: kAudioObjectPropertyElementWildcard)
    AudioObjectAddPropertyListenerBlock(o, &a, q) { n, addrs in
        let told = (0..<Int(n)).map { code(addrs[$0].mSelector) }
        let v = flag(o, kAudioProcessPropertyIsRunningInput)
        if v != input[o] {
            print("\(now()) \(bundle(o)) microphone \(input[o] ?? 9) -> \(v); told: \(told.joined(separator: ","))")
            input[o] = v
        }
    }
}
var la = addr(kAudioHardwarePropertyProcessObjectList)
AudioObjectAddPropertyListenerBlock(sys, &la, q) { _, _ in processes().forEach(watch) }
q.sync { processes().forEach(watch) }
print("\(now()) watching \(input.count) processes")
// Independent check: sample every 0.5 s and report a change the listeners missed.
var seen: [AudioObjectID: UInt32] = [:]
for _ in 0..<Int(CommandLine.arguments.count > 1 ? Double(CommandLine.arguments[1])! * 2 : 240) {
    Thread.sleep(forTimeInterval: 0.5)
    q.sync {
        for o in processes() {
            let v = flag(o, kAudioProcessPropertyIsRunningInput)
            if let s = seen[o], s != v, input[o] != v { print("\(now()) MISSED by listeners: \(bundle(o)) microphone \(s) -> \(v)") }
            seen[o] = v
        }
    }
}
print("\(now()) done")
