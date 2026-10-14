# LAB-121 question 2

## Who asked

The judge of `code_review` workflow run `20261007T132418Z-3af25c`, item
5#1 ("Whether an export must preserve empty directories"), ruled `owner`.

## Question

Question: Does 'copies each named run's directory' require directory structure, including empty directories, to be preserved, or only file contents? Options: (a) Keep the file-content reading as implemented, and optionally record the decision in the goal and docs. (b) Adopt the directory-tree reading: extend the ExportRead and ExportStage contracts to carry directories, and update the application, the filesystem adapter, the fakes and the command tests.
