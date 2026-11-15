# Call detail, templates — QA

Each row is a reducer test paired with its effect test, through fake
notes, catalogue, keep and folder ports; intentions are read from the
machine's output.

## S-1 Make section without notes

Reducer: no notes + menu opened → effect read catalogue; answered → make
section, no keep item. Effect: read catalogue delivers the fake catalogue.
Evidence: Missing.

## S-2 Make again with notes

As S-1 with notes → make-again section, keep item on. Evidence: Missing.

## S-3 Choosing a template

Reducer: template chosen Daily → intention (call, Daily, generate), no
effect. Effect: none. Read back the output's one value. Evidence: Missing.

## S-4 Choosing the shown notes' template

As S-3 with Default on notes made with Default. Evidence: Missing.

## S-5 An unusable template

Reducer: catalogue answered with Daily unusable → Daily disabled, reason,
folder action. Effect: as S-1. Evidence: Missing.

## S-6 Default without usable files

As S-5 with every file unusable → built-in Default enabled. Evidence: Missing.

## S-10 Toggling keep

Reducer: keep toggled → saving, effect save off; answered → off. Effect:
fake keep port records off and delivers saved. Evidence: Missing.

## S-11 A failed keep save

As S-10 with the fake failing → on with reason. Evidence: Missing.

## S-14 Opening the folder

Reducer: open folder → effect open folder; answered failure → reason.
Effect: fake folder port delivers its outcome. Evidence: Missing.

## S-15 A repaired template on reopening

Reducer: Daily unusable, menu opened again → effect read catalogue;
answered usable → Daily enabled. Effect: the fake answers the fixed
catalogue. Evidence: Missing.

## S-16 The catalogue cannot be read

Reducer: catalogue failed → built-in Default enabled with the reason.
Effect: the fake fails the read. Evidence: Missing.

## S-17 Cancelling making notes again

Reducer: progress + cancel chosen → intention (call, cancel), no effect.
Effect: none. Read back the output's one value. Evidence: Missing.
