---
title: Strict TDD Protocol for Coding Agent
date: 2025-10-06
model: GPT-5
---

# Strict TDD Protocol

## 1. Red — Write Tests First
- Write one or more tests before any production code.  
- Make sure both test and production code compile.  
- Run tests and confirm they fail (red).  
- If not red, find the reason and ask for clarification if unclear.

## 2. Green — Minimal Implementation
- Implement the smallest possible change in production code to make tests pass.  
- Run tests and confirm they pass (green).

## 3. Commit
- Commit after tests pass.  
- Message should describe what behavior was implemented or fixed.

## 4. Refactor
- Improve readability and structure of both test and production code.  
- Extract helpers if needed.  
- Ensure all tests stay green.  
- Amend or commit again.

## 5. Loop
- Repeat for every new behavior or case.  
- Never skip red or refactor on red.