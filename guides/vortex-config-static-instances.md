---
date: 2026-01-13
model: gpt-5.2
description: "Rules for static config instances and factories"
---

# Config Static Instances

## Preview-only rules
- Do not add static preview instances to config definitions; keep them in preview views or preview apps only.
- Define preview helpers as `static` on the config type via a local extension (`Self`), not as free functions.
- Preview helpers should be `private` by default; only widen visibility within the module when a different file in the same module must call them.
- Static preview configs must be module-local (internal/private), never public or shared across modules.
- If a preview needs shared defaults, wrap them in the preview view file (extension) and keep them local.
- Follow existing `preview` naming conventions; avoid new names like `transGranPreview` unless the component already uses a specific variant.
- If a config type already provides `preview(...)` in its module, reuse it instead of re-implementing or wrapping it.
- When overriding a `preview(...)`, keep the same parameter list, default values, and design comments to preserve intent.

## Production + injection rules
- Production config factories (for example `SelectorViewConfig.prod` in `Vortex/Vortex/CompositionRoot/Configs`) are allowed only in the main app CompositionRoot config layer as canonical app defaults.
- Feature modules must receive configs via injection from CompositionRoot; no hidden defaults or preview fallbacks in shared UI/config types.
- Reuse between modules comes from caller-supplied configs, not shared preview instances.
