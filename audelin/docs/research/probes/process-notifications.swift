// Do Core Audio's process-list and per-process running-output notifications fire on this Mac?
import Foundation
import CoreAudio

let t0 = Date()
func now() -> String { String(format: "%5.2f", Date().timeIntervalSince(t0)) }
let sys = AudioObjectID(kAudioObjectSystemObject)
let q = DispatchQueue(label: "probe")

func processes() -> [AudioObjectID] {
    var a = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyProcessObjectList, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(sys, &a, 0, nil, &size)
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / 4)
    AudioObjectGetPropertyData(sys, &a, 0, nil, &size, &ids)
    return ids
}
func pid(_ o: AudioObjectID) -> pid_t {
    var a = AudioObjectPropertyAddress(mSelector: kAudioProcessPropertyPID, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var p: pid_t = 0; var s = UInt32(4); AudioObjectGetPropertyData(o, &a, 0, nil, &s, &p); return p
}
func flag(_ o: AudioObjectID, _ sel: AudioObjectPropertySelector) -> UInt32 {
    var a = AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var v: UInt32 = 0; var s = UInt32(4); AudioObjectGetPropertyData(o, &a, 0, nil, &s, &v); return v
}

var watched = Set<AudioObjectID>()
var players = Set<pid_t>()
func watch(_ o: AudioObjectID) {
    guard !watched.contains(o) else { return }
    watched.insert(o)
    var a = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertySelectorWildcard, mScope: kAudioObjectPropertyScopeWildcard, mElement: kAudioObjectPropertyElementWildcard)
    let st = AudioObjectAddPropertyListenerBlock(o, &a, q) { n, addrs in
        let p = pid(o)
        guard players.contains(p) else { return }
        for i in 0..<Int(n) {
            let sel = addrs[i].mSelector
            let c = [24, 16, 8, 0].map { Character(UnicodeScalar(UInt8((sel >> $0) & 0xff))) }
            print("\(now()) afplay \(p) property '\(String(c))' changed; running-output \(flag(o, kAudioProcessPropertyIsRunningOutput))")
        }
    }
    if st != 0 { print("listener status \(st) on \(o)") }
}
var la = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyProcessObjectList, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
AudioObjectAddPropertyListenerBlock(sys, &la, q) { _, _ in
    let ids = processes()
    let mine = ids.filter { players.contains(pid($0)) }
    print("\(now()) process list changed: \(ids.count) processes, afplay present: \(!mine.isEmpty), running-output \(mine.map { flag($0, kAudioProcessPropertyIsRunningOutput) })")
    ids.forEach(watch)
}
q.sync { processes().forEach(watch) }

func play(_ seconds: Double) -> Process {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
    p.arguments = ["-v", "0", "-t", String(seconds), "/tmp/tap-probe/tone.wav"]
    try! p.run()
    q.sync { _ = players.insert(p.processIdentifier) }
    print("\(now()) started afplay \(p.processIdentifier) (volume 0, \(seconds) s)")
    return p
}
let a = play(2); a.waitUntilExit(); print("\(now()) afplay exited")
Thread.sleep(forTimeInterval: 1.5)
let b = play(2); Thread.sleep(forTimeInterval: 0.8)
func sample() { q.sync { let m = processes().filter { players.contains(pid($0)) }; print("\(now()) sample running-output \(m.map { flag($0, kAudioProcessPropertyIsRunningOutput) })") } }
sample()
kill(b.processIdentifier, SIGSTOP); print("\(now()) SIGSTOP"); Thread.sleep(forTimeInterval: 0.7); sample(); Thread.sleep(forTimeInterval: 0.8); sample()
kill(b.processIdentifier, SIGCONT); print("\(now()) SIGCONT"); b.waitUntilExit(); print("\(now()) afplay exited")
Thread.sleep(forTimeInterval: 1.0)
