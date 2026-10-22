# Call watch — QA

A Core, driven through a fake of its own interface: a list of processes
using the microphone, each with a bundle id, changed on cue, and a fake
clock. Every row reads what call watch tells its client.

## S-1 Zoom on the microphone is a call

`us.zoom.xos` appears; a call in Zoom is told. Evidence: Missing.

## S-2 Telemost on the microphone is a call

`ru.yandex.desktop.telemost` appears; a call in Telemost is told. Evidence:
Missing.

## S-3 A browser on the microphone is a call

Each browser family's prefix in turn, with a helper's bundle id under it
(`com.google.Chrome.helper`, `com.apple.WebKit.GPU`, …), appears alone; a
call in that browser is told for every one. Evidence: Missing.

## S-4 Another app on the microphone is not a call

`com.apple.VoiceMemos` appears and stays 60 s; no call is told. Evidence:
Missing.

## S-5 A call ends 30 s after the microphone

Zoom leaves the list; at 29 s of fake clock the call is on, at 30 s it is
told ended. Evidence: Missing.

## S-6 A short silence does not end the call

Zoom leaves for 10 s and comes back; at 60 s the same call is on, and no
end or second start was told. Evidence: Missing.

## S-7 A second call app does not start a second call

Chrome joins Zoom; no second start is told, and the call is in Zoom.
Evidence: Missing.

## S-8 A call goes on while any call app is on the microphone

Zoom leaves and Chrome stays; at 60 s the call is on, and no end is told.
Evidence: Missing.

## S-9 A call ends 30 s after the last call app leaves

Zoom leaves at 0 s, Chrome at 20 s; at 49 s the call is on, and at 50 s it
is told ended. Evidence: Missing.
