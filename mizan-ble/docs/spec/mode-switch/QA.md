# Mode switch — QA

Driven by view tests of the shell with fake mode screens, and a device
idiom the test sets.

## S-1 Launch on an iPad

iPad idiom: the host screen shows, Host chosen. Evidence: Missing.

## S-2 Launch on an iPhone

iPhone idiom: the client screen shows, Client chosen. Evidence: Missing.

## S-3 Switching at rest

At rest, tap Client: the client screen shows. Evidence: Missing.

## S-4 No switch while a payment is under way

Not at rest: the switch is disabled and a tap changes nothing. Evidence: Missing.

## S-5 Switching after a failed handshake

Client failed to connect, tap Host: the host screen shows an empty amount. Evidence: Missing.

## S-6 Switching after a payment

Client payment ended, tap Host: the host screen shows an empty amount. Evidence: Missing.

## S-7 Switching back on an iPhone

The iPhone switch-role rehearsal launches as client, chooses Host, types
with the keypad's right column and chooses Client again. The payer's start
screen is visible again and the log names both mode builds.
Evidence: Missing.
