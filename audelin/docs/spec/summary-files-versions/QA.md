# Summary files, versions — QA

The adapter is tested for real in a temporary calls folder; disk failures
through a fake of its disk binding.

## S-1 Rotation keeps the old Current

Drive: write a pair A/B, publish C with rotation; read back Previous B and
Current C, and that A's text is gone. Evidence: Missing.

## S-2 Rotation of a first pair

Drive: write Current A, publish B with rotation; read back A and B.
Evidence: Missing.

## S-3 Replacement keeps only the new notes

Drive: pair A/B, publish C with replacement; read back Current C and no
Previous. Evidence: Missing.

## S-4 Attribution is read back

Drive: publish made with Daily; read back the name and date. Evidence: Missing.

## S-5 Attribution survives the template file

Drive: as S-4, then delete a temp Daily template file; read back Daily.
Evidence: Missing.

## S-6 Older notes read as Default

Drive: copy a recorded pre-template call fixture; read back Current, Default,
and the file bytes unchanged. Evidence: Missing.

## S-7 A failed publication keeps the pair

Drive: fake disk fails the commit's rename; read back the pair A/B.
Evidence: Missing.

## S-8 A discarded attempt keeps the pair

Drive: claim then discard an attempt; read back the pair A/B and no
attempt record. Evidence: Missing.

## S-9 A reader during publication

Drive: gate the fake disk between writes of a rotation; read at the gate;
read back the old pair whole. Evidence: Missing.

## S-10 Recovery after an interrupted publication

Drive: stop a publication at each gated step, build a new adapter on the
folder; read back a whole pair and the attempt's matching outcome. Evidence: Missing.
