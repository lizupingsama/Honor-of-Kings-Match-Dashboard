---
name: push-both-remotes
description: Ensure this repository is pushed to both GitHub and Gitee. Use when the user asks to push, commit and push, publish a branch, or sync Git changes in this project.
---

# Push Both Remotes

## Instructions

When pushing Git changes in this repository:

1. Confirm the current remotes with `git remote -v`.
2. Treat `github` as the GitHub remote and `origin` as the Gitee remote.
3. Stage and commit only the user-requested changes. Do not include unrelated files.
4. Push the current branch to both remotes:

```powershell
git push github HEAD
git push origin HEAD
```

5. If either push fails, report which remote failed and why. Do not use force push unless the user explicitly requests it.
