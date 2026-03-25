# Directory Rename Migration Pattern

## Approach
When renaming a major directory in the codebase:
1. Move the directory preserving all subdirectory structure
2. Update all references systematically: tsconfig.json includes, package.json scripts, build tool paths
3. Run full test suite to verify no broken imports
4. Keep changes minimal - avoid refactoring during migration

## Example
```bash
# Move directory
mv trello/ src/

# Update tsconfig.json
"include": ["src/**/*.ts", "src/**/*.tsx"]

# Update package.json scripts
"dev": "cd src && bun run build.ts"

# Verify with tests
bun test
```

## When to Use
- Major directory restructuring
- Package renaming that affects directory names
- Migrating legacy folder structures

## Confidence
verified - Successfully used for trello/ → src/ migration with 320 passing tests