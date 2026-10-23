# Audelin architecture

## Grounding

These rules hold for every line of Audelin's code. Re-read them before
designing, specifying or building anything.

1. **A component owns the interfaces it depends on.** It declares each
   collaborator as an interface of its own, shaped by the role that
   collaborator plays for it. It never imports another component, a concrete
   implementation or another component's interface, so it changes only for
   its own reasons.
2. **The outside world lives only in adapters.** That covers the disk and
   file formats, audio devices, the recognition model, the OS and the UI
   toolkit. A component knows none of them. Each file format has exactly
   one reader and one writer.
3. **Each component owns its types.** There is no shared domain module.
   Components with similar types keep their own, and the composition root
   translates between them.
4. **Only the composition root knows concrete pieces.** It builds every
   component and adapter and decides what answers each interface. When two
   features must coordinate, the root hands both the same answer;
   coordination is wiring, not a shared component.
5. **Cross-cutting concerns are decorators at the root.** Logging, metrics
   and retries wrap interfaces in the composition root. No component logs.
