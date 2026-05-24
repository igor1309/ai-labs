---
date: 2026-01-18
model: claude-opus-4.5
description: Implementation plan for the r/LLMDevs Weekly Digest Tool
---

# r/LLMDevs Weekly Digest Tool — Implementation Plan

## Architecture

```
GitHub Actions (cron)
        │
        ▼
┌───────────────────┐
│   Python Script   │
│                   │
│  1. Fetch Reddit  │
│  2. Classify      │
│  3. Rank          │
│  4. Summarize     │
│  5. Format        │
└───────────────────┘
        │
        ▼
   Telegram Bot
   (send message)
```

-----

## Components

### 1. Data Fetching

**Source:** Reddit JSON endpoints (no auth required)

**Endpoints:**

- `https://www.reddit.com/r/LLMDevs/top.json?t=week&limit=100` — top posts from sliding 7-day window
- `https://www.reddit.com/r/LLMDevs/comments/{post_id}.json` — comment tree for discussion depth

**Data captured per post:**

- `title`
- `selftext` (body)
- `url`
- `created_utc`
- `num_comments`
- `permalink`

### 2. Firsthand Content Classification

**Method:** LLM classification (Claude API)

**Prompt concept:**

```
Classify this Reddit post as FIRSTHAND or SECONDHAND.

FIRSTHAND: Author sharing their own work, experiment, tool, idea, or question from personal experience.
SECONDHAND: Author commenting on external news, company announcements, industry drama, or others' work.

Post title: {title}
Post body: {body}

Reply with only: FIRSTHAND or SECONDHAND
```

**Filter:** Keep only FIRSTHAND posts.

### 3. Ranking

**Score formula:**

```
score = num_comments / hours_since_posting
```

Time-normalization handles Monday vs. Friday posting bias.

**Future refinement (if needed):**

- Comment reply chain depth
- Average comment length
- Substance heuristics

### 4. Summary Generation

**Method:** LLM summary (Claude API)

**Prompt concept:**

```
Summarize this Reddit post in 2-3 sentences. Focus on:
- What was built/tried/asked
- Why it's interesting
- What discussion emerged (if notable)

Title: {title}
Body: {body}
Top comments: {top_comments}
```

### 5. Output Formatting

**Markdown template per post:**

```markdown
### {title}

{summary}

🔗 [Discussion]({reddit_link}) · 💬 {num_comments} comments
```

**Full digest:**

```markdown
# r/LLMDevs Weekly Digest
*Week of {date_range}*

---

{post_1}

---

{post_2}

...
```

### 6. Telegram Delivery

**Setup:**

- Create bot via @BotFather
- Get bot token
- Get chat ID (your user ID or a channel)

**Delivery:**

```
POST https://api.telegram.org/bot{token}/sendMessage
{
  "chat_id": "{chat_id}",
  "text": "{formatted_digest}",
  "parse_mode": "Markdown"
}
```

-----

## GitHub Actions Workflow

**Schedule:** Weekly (e.g., Saturday 9:00 AM UTC)

**Cron:** `0 9 * * 6`

**Secrets needed:**

- `ANTHROPIC_API_KEY` — for classification and summarization
- `TELEGRAM_BOT_TOKEN` — bot credentials
- `TELEGRAM_CHAT_ID` — destination

**Workflow file:** `.github/workflows/weekly-digest.yml`

```yaml
name: Weekly Digest

on:
  schedule:
    - cron: '0 9 * * 6'  # Saturday 9:00 UTC
  workflow_dispatch:  # Manual trigger for testing

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: pip install requests anthropic
      
      - name: Run digest script
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: python digest.py
```

-----

## File Structure

```
llmdevs-digest/
├── .github/
│   └── workflows/
│       └── weekly-digest.yml
├── digest.py          # Main script
├── README.md          # Setup instructions
└── docs/
    ├── spec.md        # Product specification
    └── implementation.md  # This document
```

-----

## Testing Strategy

1. **Manual trigger** — use `workflow_dispatch` to run on demand
1. **Dry run mode** — flag to skip Telegram, print to stdout
1. **Sample data** — save a week’s JSON response for offline testing

-----

## Open Implementation Questions

1. **Telegram message length** — max 4096 chars. May need to split or truncate. Alternatively, send as document or multiple messages.
1. **Rate limiting** — Reddit may block requests without a User-Agent. Set a descriptive one.
1. **Error handling** — what if Reddit is down? Retry? Fail silently? Notify?
1. **LLM costs** — ~100 posts × 2 calls each = 200 API calls/week. Minimal but worth tracking.
1. **Caching** — store post IDs already processed to avoid re-summarizing if re-run?

-----

## MVP Scope

**In scope:**

- Fetch week’s posts
- Classify firsthand/secondhand
- Rank by time-normalized comments
- Generate summaries
- Send via Telegram

**Out of scope (for now):**

- Personalization
- Feedback mechanisms
- Web interface
- Historical archives
- Multiple subreddits