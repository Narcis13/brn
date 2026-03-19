# S03 Research

- Completion order is not a safe queue order once workers finish concurrently.
- Serialized integration should follow the main queue order so convergence stays deterministic.
- Milestone drift must block integration even when cherry-pick mechanics would otherwise succeed.
