---
date: 2026-01-15
---

## Tools

### Alfred Workflow
[Alfred workflow for quickly switching between Claude Code accounts](https://github.com/rvnikita/claude-account-switcher-alfred)

Bummer: Alfred Powerpack is £34 (v5) / £59 (lifetime) per license. But CLI is free.

Interesting:
- Account Storage Structure with configs & credentials.

#### Cheat Sheet

# Add current account
~/scripts/ccswitch.sh --add-account

# List all accounts
~/scripts/ccswitch.sh --list

# Switch to next account in rotation
~/scripts/ccswitch.sh --switch

# Switch to specific account (by number or email)
~/scripts/ccswitch.sh --switch-to 2
~/scripts/ccswitch.sh --switch-to user@example.com

# Remove an account (by number or email)
~/scripts/ccswitch.sh --remove-account 2
~/scripts/ccswitch.sh --remove-account user@example.com

## AI chats

- thread in Perplexity
- thread in ChatGPT
