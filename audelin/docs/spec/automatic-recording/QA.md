# Automatic recording — QA

A Core, driven through fakes of its own interfaces: calls that start and
end on cue, a setting, and a session that records and can refuse to start.
Every row reads what the Core tells its client and checks the fake session
agrees, so telling right while recording wrong fails, and the reverse.

## S-1 A call starts a recording

Setting on; a call starts; the client is told the call is recorded, and the
session records. Evidence: Missing.

## S-2 With the setting off a call starts nothing

Setting off, nothing recorded; a call starts; the client is told nothing is
recorded, and the session was not started. Evidence: Missing.

## S-3 A call's end stops the recording it started

The call that started a recording ends; the client is told it stopped, and
the session stopped. Evidence: Missing.

## S-4 A recording started by hand outlasts the call

Setting off; a call starts; a hand start; the call ends; the client is told
it is still recording, and the session was not stopped. Evidence: Missing.

## S-5 A call during a hand-started recording starts nothing new

A hand start, then a call starts; the client is told of the one recording,
and the session was started once. Evidence: Missing.

## S-6 The setting switched off mid-call keeps the recording

A call starts a recording; the setting goes off; the client is told it is
recording; the call ends, and it is told stopped. Evidence: Missing.

## S-7 A recording that cannot start is told

The session refuses; a call starts; the client is told the call is not
recorded. Evidence: Missing.

## S-8 Starting by hand records

A hand start with no call; the client is told it is recording, and the
session records. Evidence: Missing.

## S-9 Stopping by hand stops

A call starts a recording; a hand stop; the client is told it stopped, the
session stopped, and nothing starts while that call goes on. Evidence:
Missing.

## S-10 The next call records after a hand stop

A hand stop, the call ends, a second call starts; the client is told the
call is recorded, and the session records. Evidence: Missing.

## S-11 A hand start after a hand stop records the same call

A hand stop, the call goes on, a hand start; the client is told it is
recording, and the session records. Evidence: Missing.

## S-12 Stopping a hand-started recording by hand stops it

A hand start with no call, then a hand stop; the client is told it stopped,
and the session stopped. Evidence: Missing.
