# Template files — QA

The adapter is tested for real on a temporary folder, never the user's
Application Support; folder opening through a fake of its workspace binding.

## S-1 First listing makes the folder

Drive: list the catalogue for a temp path that does not exist; read back the
folder's files and the listed entries. Evidence: Missing.

## S-2 An existing folder is not replenished

Drive: make the temp folder with only a Default file; list; read back that no
Daily file was written and no Daily file entry is listed. Evidence: Missing.

## S-3 An unusable file is listed with its reason

Drive: write a file without instructions; list; read back the entry's
unusable reason text. Evidence: Missing.

## S-4 An unusable file is left as it was

Drive: as S-3, then compare the file's bytes and modification date with
those written. Evidence: Missing.

## S-5 An edit is resolved

Drive: resolve Daily, rewrite its file, resolve again; read back the second
instructions equal the new file text. Evidence: Missing.

## S-6 Built-in Default without usable files

Drive: empty temp folder; resolve Default; read back the built-in
instructions and the four required headings. Evidence: Missing.

## S-7 An unusable Default file stays visible

Drive: write a broken Default file; list; read back an unusable Default
entry with its reason and a usable built-in Default. Evidence: Missing.

## S-8 A missing chosen template

Drive: list, delete Daily's file, resolve Daily; read back a missing
failure naming Daily, and no instructions. Evidence: Missing.

## S-9 A folder that cannot be read

Drive: temp folder with no read permission; list; read back the folder
reason and the built-in Default entry. Evidence: Missing.

## S-10 Opening the folder

Drive: fake workspace binding answering success; read back opened and the
path it was given. Evidence: Missing.

## S-12 A folder that cannot be opened

Drive: fake workspace binding failing; read back its reason. Evidence: Missing.

## S-11 Shipped Daily asks for a handoff

Drive: resolve the shipped Daily from a fresh folder; read back that its
instructions ask for continuation, owners, blockers, planned fixes and
meetings, agreed versus suggested, unclear owners and fixes, and topics not
discussed. Evidence: Missing.
