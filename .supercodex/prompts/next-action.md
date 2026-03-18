# Next Action Prompt Template

Use this template to synthesize the next headless action from file-backed state.

Required inputs:

- current structured state
- eligible unit
- safety class
- acceptance criteria
- relevant contracts and decisions
- files likely in scope
- retry context if applicable

Expected output:

- selected unit
- selected runtime
- selected role
- reasoning summary
- dispatch packet reference

Phase 0 note:

- This is a scaffold template only. It is not wired to an executor yet.
