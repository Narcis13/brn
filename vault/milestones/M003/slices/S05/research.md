# S05 Research

- Start with a single-step conductor command before adding background loops or long-running workers.
- Keep the CLI shape close to existing `runtime` commands so operator mental overhead stays low.
- Persist the same artifacts for dry-run and live-run paths where possible so debugging does not depend on re-execution.
