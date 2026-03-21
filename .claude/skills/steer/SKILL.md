---
name: steer
description: Add a steering directive for the autonomous coding agent. The next /next run will incorporate it.
user-invocable: true
model: haiku
effort: low
argument-hint: "<directive>"
---

# /steer — Add Steering Directive

Append a human directive to the steering file so the next `/next` run incorporates it.

## Instructions

1. Read `$ARGUMENTS` — this is the directive text
2. If no arguments provided, read `.brn/steering.md` and display current directives, then ask what they'd like to steer
3. Read `.brn/steering.md`
4. Append the directive to the `## Active` section with a timestamp:
   ```
   - <directive> _(added <today's date>)_
   ```
5. Write the updated file
6. Confirm: "Steering directive added. Next `/next` run will incorporate it."
