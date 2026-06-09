---
date: 2026-06-09
author: Igor Malyarov
model: gpt-5.5-thinking
title: Create a concise README
version: 0.0.1
---

# Create a concise README.

## Goal:
Explain why this design exists, not how to implement it.

## Style:

* clarity over verbosity;
* no filler;
* no repeated ideas;
* no generic architecture preaching;
* if a sentence can be removed without reducing comprehension, remove it.

## Content:

* explain the problem;
* explain the architecture shape;
* define the roles;
* define the boundaries;
* include executable spec only if it helps clarify expected behavior.

## Review:
Run adversarial review before finalizing.

Classify findings as:

* FAIL: incorrect boundary, contradiction, missing essential contract;
* WARN: unclear wording, avoidable ambiguity, unnecessary detail;
* PASS: acceptable.

Fix all FAIL and WARN items.

## Output:
Return the final README as a markdown file for download.
Do not include review notes unless they changed the final document.