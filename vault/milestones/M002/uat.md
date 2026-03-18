# M002 UAT

1. Run `pnpm cli runtime list` and confirm both runtime registry entries are present.
2. Run `pnpm cli runtime probe` and confirm probe output records availability, path, and version when the executables exist.
3. Create a valid dispatch packet JSON file from `.supercodex/prompts/dispatch.json`.
4. Run `pnpm cli runtime dispatch --runtime codex --packet <path>` and confirm the result validates and includes `raw_ref`.
5. Run `pnpm cli runtime dispatch --runtime claude --packet <path>` and confirm the same packet shape works there too.
6. Run `pnpm cli runtime collect --run-id <id>` and confirm the normalized result can be reconstructed from disk.
