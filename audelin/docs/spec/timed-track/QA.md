# Timed track — QA

Driven through a fake of its own pieces interface: hand-made pieces with
their times, samples and rates. No row needs audio hardware.

## S-1 Pieces in order are read as they came

Three pieces back to back come out with the same samples, in order.
Evidence: Missing.

## S-2 Sound keeps its time after a quiet start

The first piece is stamped 3 s after the start; the track opens with 3 s
of zeros, then the piece. Evidence: Missing.

## S-3 Sound keeps its time after a quiet stretch

Two pieces 2 s apart come out with 2 s of zeros between them. Evidence:
Missing.

## S-4 A new rate keeps the time

A 48 kHz piece then a 24 kHz piece: the second starts at its stamped time,
counted at its own rate. Evidence: Missing.

## S-5 The end of the pieces ends the track

The pieces end; the track ends after the last sample. Evidence: Missing.

## S-6 A failure of the pieces is told

The pieces fail after one; the track gives that piece, then the failure.
Evidence: Missing.
