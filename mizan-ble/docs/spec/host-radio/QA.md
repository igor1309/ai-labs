# Host radio — QA

The binding over `CBPeripheralManager` is thin; the translation is driven
through a fake of the binding that plays the delegate calls and records
what was asked of it. Proven for real by the user spec on a real iPad.

## S-1 Bluetooth state is told

The fake reports powered off: the radio's event reads off. Evidence: Missing.

## S-2 Serving and advertising

Serve and advertise MIZAN-7F3A: the fake holds the service with the session's value and the name; the event reads advertising started. Evidence: Missing.

## S-3 Advertising fails

The fake fails to advertise: the event reads could not go on air, with that error. Evidence: Missing.

## S-4 Serving fails

The fake fails to add the service: the event reads could not go on air, with that error. Evidence: Missing.

## S-5 The client's key arrives

A subscribed central writes 33 bytes to Client key: the event reads its key; the fake answered success. Evidence: Missing.

## S-6 A second central is refused

A second central writes to To host: no event; the fake answered with an error. Evidence: Missing.

## S-7 A decision arrives

The owner writes 41 bytes to To host: the event reads those bytes. Evidence: Missing.

## S-8 A message to the owner only

Owner and a second central subscribed, send: the fake's update names the owner only. Evidence: Missing.

## S-9 A message held for the queue

The fake's queue full, two sends, then ready to update: the fake updated the owner with both, in order; no failure event. Evidence: Missing.

## S-10 A message too large

Largest update 20, send 41 bytes: the event reads failed; the fake was asked for nothing. Evidence: Missing.

## S-11 The client leaves

The owner unsubscribes: the event reads client lost. Evidence: Missing.

## S-12 Retiring a session

A message queued, retire, serve a new session: the fake removed the service and never sent the message; a new central's key is read. Evidence: Missing.

## S-13 Finishing a session

A message queued, finish: the fake sent the message, then removed the service. Evidence: Missing.

## S-14 Serving while a session finishes

A message queued, finish, serve a new session: the fake sent the message before it added the new service and advertised. Evidence: Missing.

## S-15 Retiring a session that waits

A message queued, finish, serve a new session, retire the new one before it is served: the fake sent the message and never added the new service. Evidence: Missing.
