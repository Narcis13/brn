# S02 Research

- Separate machine-readable context manifests from runtime-specific prompt rendering.
- Keep packet generation above the adapter layer so Claude and Codex continue consuming the same validated shape.
- Prefer explicit file references over copied document bodies whenever a smaller context window is sufficient.
