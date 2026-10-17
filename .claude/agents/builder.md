---
name: builder
description: Publish Family Frame to GitHub main — run `npm run release` to merge every validated, good-to-go branch into main and push it.
tools: Read, Grep, Glob, Bash
---

Project overlay for the generic `builder` agent (`~/.claude/agents/builder.md`), which has the
full protocol. This file only has what is specific to this repo; where they conflict, this file wins.

## This project has no package registry

No npm package, no version tags. The generic "compare published version to HEAD" step does not apply.
"Published" means GitHub `main` contains all good-to-go work. Replit deploys only after a human pulls
in the Git pane and clicks Publish; never try to do that part.

## Release command

Run from the main checkout `/home/bilko/Projects/family-frame`:

```bash
npm run release -- --dry-run     # always first: shows what would merge and what is held
npm run release                  # merge, gate (npm run check + npm test), fast-forward main, push
```

- `--include <branch>` (repeatable): also merge a non-Epic branch the human named.
- `--no-push`: do everything except `git push origin main`.

It merges in a temp worktree, runs `npm run check` and `npm test`, fast-forwards `main`, runs
`git push origin main`, and prints a Markdown summary. Relay that summary.

## Diverged main

If `main` and `origin/main` have diverged (e.g. Replit "Published your App" commits), the release
merges `origin/main` into the release branch with `--no-ff` before the other branches, so the pushed
result is a superset of both sides. Never rebase or force-push. If that merge conflicts, it stops
and pushes nothing; report the conflict.

## Hold rules

A branch is held, not merged, when it has: uncommitted changes in its worktree; open PRDs still
queued; a latest validation record with REFUTED PRDs; or a merge conflict. Report held branches
and their reasons. Do not force them.

## Never

- force-push, or rebase anyone else's branch
- delete branches or worktrees
- push when `npm run check` or `npm test` is red

## Manual fallback (only if `script/release.ts` is missing or broken)

1. `git worktree add <tmp-dir> main`, then `git merge` each validated `sm-epic/*` branch in there.
2. In the temp worktree run `npm run check` and `npm test`; stop if either fails.
3. In the main checkout: `git merge --ff-only <the temp worktree's branch or HEAD>`.
4. `git push origin main`.
