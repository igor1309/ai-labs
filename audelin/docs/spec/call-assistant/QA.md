# Call assistant QA

Driven on a real call recorded by Audelin between two people, with a thread
on this repository and a second thread open on it. The script has distinct
triggers, each used once: questions Q1–Q3 the repository answers (where call
notes are saved; the CLI's name; the calls folder), claims C1–C3 against a
recorded decision (the app changes for the assistant; hints go to every
thread; there is a recap), a code word said only in the first minute, and two
minutes of routine talk. Evidence is the thread's messages with their times,
against the call's transcript times and the thread's outbound requests, read
back after the call.

## S-1 Asking shows where speech goes before following
Drive: ask; record when the disclosure shows and when the first speech is sent; compare the named provider with the thread's configured one.
Evidence: Missing.

## S-2 With no call it waits, and joins the call that starts
Drive: ask with no call recording; read that it waits; start the call; read the joined message.
Evidence: Missing.

## S-4 Joining mid-call takes in what was said
Drive: say the code word, start following after two minutes, ask for it; the answer names it.
Evidence: Missing.

## S-5 A question answered in the project gets a hint
Drive: ask Q1 aloud; a hint after it gives the right answer and cites the file that holds it.
Evidence: Missing.

## S-6 A claim against a decision gets a hint
Drive: say C1; a correction after it cites ADR-003.
Evidence: Missing.

## S-7 Routine talk stays silent
Drive: routine talk, then Q2; the only message after the talk began answers Q2.
Evidence: Missing.

## S-8 The start of a long call is remembered
Drive: a call of at least 45 minutes; near its end, type a question about the code word; the answer names it.
Evidence: Missing.

## S-9 The call ending stops following
Drive: end the call; read the stop line and no recap; start a new call, say Q1; no message in either thread.
Evidence: Missing.

## S-10 Stopping during a call
Drive: ask to stop; read the stop line; say C2; no message comes.
Evidence: Missing.

## S-11 Stopping a wait
Drive: ask with no call recording, ask to stop; read the stop line; start a call, say Q1; no message comes.
Evidence: Missing.

## S-12 The call's text not coming is said once
Drive: record with live text off and follow for two minutes; then, on a followed call with text, switch live text off. Each time exactly one message says the text is not coming.
Evidence: Missing.

## S-15 A hint for a question that fails is said
Drive: take the model offline, say Q2; read the failure; restore it, say Q3; get its hint.
Evidence: Missing.

## S-16 A hint for a claim that fails is said
Drive: take the model offline, say C3; read the failure; restore it, say C2; get its correction.
Evidence: Missing.

## S-17 An answer that fails is said
Drive: take the model offline, type a question; read the failure; restore it, ask again; get an answer.
Evidence: Missing.
