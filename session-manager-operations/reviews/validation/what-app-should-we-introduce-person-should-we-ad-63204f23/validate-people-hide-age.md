# Validation: 128 people-hide-age

Base: 5f9234f. PRD file: prds-archived/128-people-hide-age.md (found).

## 128 people-hide-age — VERIFIED

Commit: f42e601 "feat(people): hide age on person cards" (only `client/src/pages/people.tsx`, 19 deletions, 0 additions).

- AC1 (no age text in PersonCard): diff removes the `{age !== null && ...text-person-age-<id>...}` block; `grep text-person-age|years old` over people.tsx and components/person/ → no hits.
- AC2 (helper deleted, no other use, no age derivation): `grep -rn ageFromBirthday client server shared` → no hits; `grep birthday` over people.tsx and components/person/ → no hits.
- AC3 (layout otherwise unchanged): people.tsx:75-77 still has `href`, `aria-label={`Open ${person.name}`}`, `data-testid={`card-person-${person.id}`}`; avatar and name div untouched in diff.
- Gate (re-run after `npm ci`): `npm run check` exit 0; `npm test` exit 0 (server node:test 229/229 pass).

## Combined diff review

`git diff 5f9234f..HEAD --stat`: 1 file, 19 deletions. Pure removal; no new inputs, secrets, paths or duplicated helpers. Self-review only (no new logic to run /code-review or /security-review against).

## Findings

- Critical: none
- Important: none
- Minor: none
