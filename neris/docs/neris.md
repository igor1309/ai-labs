# Neris

```
/neris
├─ packages/
│  └─ swift-neris/
│     ├─ core/                    # NerisCore
│     ├─ provider-api/            # common LLM provider abstractions
│     ├─ tools-api/               # tools / skills / agent-facing protocols
│     ├─ runtime/                 # optional later; loop / execution runtime
│     ├─ providers/
│     │  ├─ openai-provider/
│     │  └─ neyrokey-provider/    # if shared code is possible
│     └─ support/                 # shared utilities, types, infra-light code
│
├─ apps/
│  ├─ neris-cli/                  # primary CLI
│  ├─ openai-neris-cli/           # OpenAI-oriented CLI app
│  └─ nk-neris-cli/               # NeyroKey-oriented CLI app
│
├─ docs/
│  ├─ brand/
│  └─ architecture/
│
└─ examples/
```

Or

```
/neris
├─ packages/
│  └─ swift-neris/
│     ├─ core/
│     ├─ api/
│     │  ├─ provider-api/
│     │  └─ tools-api/
│     ├─ providers/
│     └─ support/
├─ apps/
│  ├─ neris-cli/
│  ├─ openai-neris-cli/
│  └─ nk-neris-cli/
└─ docs/
```

## Minimal starting version

```
/neris
├─ packages/
│  └─ swift-neris/
│     ├─ core/
│     ├─ provider-api/
│     ├─ tools-api/
│     └─ providers/
├─ apps/
│  └─ neris-cli/
└─ docs/
```

---

## Config

User-settable, separated from code.

Includes:
	•	LLM provider base URL
	•	model cohorts/params: low/mid/high
	•	API keys

## Prompts

Separate, version-controlled.

Includes:
	•	system prompts
	•	other prompt templates

Principle
	•	strict separation of code and config
	•	config is user-editable
	•	prompts are not embedded in code

---

Updated shape

```
/neris
├─ packages/
│  └─ swift-neris/
│     ├─ core/
│     ├─ provider-api/
│     ├─ tools-api/
│     ├─ providers/
│     └─ support/
│
├─ apps/
│  ├─ neris-cli/
│  ├─ openai-neris-cli/
│  └─ nk-neris-cli/
│
├─ config/
│  ├─ providers/
│  │  ├─ openai.toml
│  │  ├─ nk.toml
│  │  └─ default.toml
│  ├─ cohorts.toml
│  └─ profiles/
│
├─ prompts/
│  ├─ system/
│  ├─ tasks/
│  └─ agents/
│
└─ docs/
```

---

or stricter separation for even more explicit non-code assets:

```
/neris
├─ apps/
├─ packages/
├─ resources/
│  ├─ config/
│  └─ prompts/
└─ docs/
```

---

Minimal updated version

```
/neris
├─ packages/
│  └─ swift-neris/
│     ├─ core/
│     ├─ provider-api/
│     └─ tools-api/
├─ apps/
│  └─ neris-cli/
├─ config/
│  ├─ cohorts.toml
│  └─ providers/
├─ prompts/
│  ├─ system/
│  └─ tasks/
└─ docs/
```