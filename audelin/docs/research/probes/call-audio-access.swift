// Does a muted process tap on our own process hear a quiet tone we play, and does it
// go to exact zeros when System Audio Recording is denied? Plays nothing audible.
// Run: swift call-audio-access.swift. From a shell it measures the terminal's permission.
import AVFAudio
import CoreAudio
import Foundation

let t0 = Date()
func now() -> Double { Date().timeIntervalSince(t0) }
func log(_ s: String) { print(String(format: "%6.3f  ", now()) + s) }

// Prime the engine with digital silence so Core Audio lists our process object.
let engine = AVAudioEngine()
let player = AVAudioPlayerNode()
let rate = engine.outputNode.outputFormat(forBus: 0).sampleRate
let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
engine.attach(player)
engine.connect(player, to: engine.mainMixerNode, format: format)
let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rate))!
silence.frameLength = silence.frameCapacity
do { try engine.start() } catch { log("engine start failed: \(error)"); exit(2) }
player.scheduleBuffer(silence, at: nil, options: .loops)
player.play()
Thread.sleep(forTimeInterval: 0.3)

var output = AudioObjectID(0)
var addr = AudioObjectPropertyAddress(
    mSelector: kAudioHardwarePropertyDefaultOutputDevice, mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain)
var size = UInt32(MemoryLayout<AudioObjectID>.size)
AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &output)
log("default output device \(output)")

var pid = getpid()
var processObject = AudioObjectID(0)
addr.mSelector = kAudioHardwarePropertyTranslatePIDToProcessObject
size = UInt32(MemoryLayout<AudioObjectID>.size)
var status = AudioObjectGetPropertyData(
    AudioObjectID(kAudioObjectSystemObject), &addr, UInt32(MemoryLayout<pid_t>.size), &pid, &size, &processObject)
log("own process object: status \(status) id \(processObject)")
guard status == noErr, processObject != 0 else { exit(3) }

let description = CATapDescription(stereoMixdownOfProcesses: [processObject])
description.uuid = UUID()
description.muteBehavior = .muted
description.isPrivate = true
var tap = AudioObjectID(0)
status = AudioHardwareCreateProcessTap(description, &tap)
log("create muted tap: status \(status) id \(tap)")

var tapFormat = AudioStreamBasicDescription()
addr.mSelector = kAudioTapPropertyFormat
size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
status = AudioObjectGetPropertyData(tap, &addr, 0, nil, &size, &tapFormat)
log("tap format: status \(status) rate \(tapFormat.mSampleRate) channels \(tapFormat.mChannelsPerFrame) bits \(tapFormat.mBitsPerChannel) flags \(tapFormat.mFormatFlags)")

let aggregate: [String: Any] = [
    kAudioAggregateDeviceNameKey: "call-audio-access-probe",
    kAudioAggregateDeviceUIDKey: "call-audio-access-probe-\(UUID().uuidString)",
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceTapAutoStartKey: false,
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString]],
]
var device = AudioObjectID(0)
status = AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &device)
log("create aggregate: status \(status) id \(device)")

let lock = NSLock()
var callbacks = 0, samples = 0, nonzero = 0, nonfinite = 0
var peak: Float = 0
var listening = false
var ioproc: AudioDeviceIOProcID?
status = AudioDeviceCreateIOProcIDWithBlock(&ioproc, device, nil) { _, input, _, _, _ in
    lock.lock(); defer { lock.unlock() }
    guard listening else { return }
    callbacks += 1
    for buffer in UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input)) {
        guard let data = buffer.mData else { continue }
        let count = Int(buffer.mDataByteSize) / 4
        let values = data.assumingMemoryBound(to: Float.self)
        for i in 0..<count {
            let v = values[i]
            samples += 1
            if !v.isFinite { nonfinite += 1 } else if v != 0 { nonzero += 1; peak = max(peak, abs(v)) }
        }
    }
}
log("ioproc: status \(status)")
status = AudioDeviceStart(device, ioproc)
log("start capture: status \(status)")

// Phase 1: 300 ms of our own digital silence: expect zeros either way.
Thread.sleep(forTimeInterval: 0.2)
lock.lock(); listening = true; lock.unlock()
Thread.sleep(forTimeInterval: 0.3)
lock.lock(); let silentPhase = (callbacks, samples, nonzero); callbacks = 0; samples = 0; nonzero = 0; peak = 0; lock.unlock()
log("silence phase: callbacks \(silentPhase.0) samples \(silentPhase.1) nonzero \(silentPhase.2)")

// Phase 2: a 1 kHz tone at -60 dBFS peak for 200 ms, 10 ms ramps, same phase both channels.
let tone = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rate * 0.2))!
tone.frameLength = tone.frameCapacity
let frames = Int(tone.frameLength), ramp = Int(rate * 0.01)
for i in 0..<frames {
    let gain = Float(min(1, Double(min(i, frames - 1 - i)) / Double(ramp)))
    let v = 0.001 * gain * Float(sin(2 * .pi * 1000 * Double(i) / rate))
    tone.floatChannelData![0][i] = v
    tone.floatChannelData![1][i] = v
}
player.scheduleBuffer(tone, at: nil, options: .interrupts)
Thread.sleep(forTimeInterval: 0.5)
lock.lock(); listening = false; let tonePhase = (callbacks, samples, nonzero, nonfinite, peak); lock.unlock()
log("tone phase: callbacks \(tonePhase.0) samples \(tonePhase.1) nonzero \(tonePhase.2) nonfinite \(tonePhase.3) peak \(tonePhase.4)")

player.stop()
engine.stop()
log("cleanup: stop \(AudioDeviceStop(device, ioproc)) ioproc \(AudioDeviceDestroyIOProcID(device, ioproc!)) aggregate \(AudioHardwareDestroyAggregateDevice(device)) tap \(AudioHardwareDestroyProcessTap(tap))")

let result = tonePhase.0 == 0 ? "refused (no capture callbacks)" : tonePhase.2 > 0 ? "heard" : "silent"
log("result: \(result)")
