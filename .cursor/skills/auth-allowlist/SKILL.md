---
name: auth-allowlist
description: >-
  Add, remove, or list Nest IAM auth_allowed_emails for nestjs_mega_backend
  (preprod/prod). Use when the user wants to allowlist emails, revoke login
  access, manage AUTH allowlist, or says add/remove allowed emails for sign-in.
---

# Auth email allowlist

Manage who can sign up / sign in / Google / refresh on this Nest mega-backend.

## Hosts

| Env | Base |
|-----|------|
| preprod | `https://nestjs-mega-backend-preprod-420ae4c0c109.herokuapp.com/api/v1` |
| prod | `https://nestjs-mega-backend-prod-893a099fba68.herokuapp.com/api/v1` |

Default to **preprod** unless the user says prod.

## Auth

Admin JWT required (`role: admin`).

1. Prefer an access token the user pastes, or sign in (do **not** echo passwords/tokens back in full):

```bash
curl -sS -X POST "$BASE/authentication/sign-in" \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin>","password":"<pw>","signUpOrIn":"signin"}'
```

Token path: `authData.tokens.accessToken`.

2. Export for subsequent calls: `TOKEN=...` and `BASE=...`.

## Operations

Parse the user message for **add** / **remove** / **list** and one or more emails (normalize lowercase).

### List

```bash
curl -sS "$BASE/authentication/allowed-emails" \
  -H "Authorization: Bearer $TOKEN"
```

### Add (one or many)

For each email:

```bash
curl -sS -X POST "$BASE/authentication/allowed-emails" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","note":"agent"}'
```

- `409` = already on list (treat as success / skip).
- Report each email: added | already present | failed.

### Remove

1. `GET` the list, match emails (case-insensitive).
2. `DELETE` by numeric `id`:

```bash
curl -sS -X DELETE "$BASE/authentication/allowed-emails/<id>" \
  -H "Authorization: Bearer $TOKEN"
```

- Missing email → report not found, continue others.
- Never delete the last remaining allowlist row without explicit user confirmation (lockout risk).

## Lock user (optional, if asked)

```bash
# list users
curl -sS "$BASE/users/all-users" -H "Authorization: Bearer $TOKEN"

curl -sS -X PATCH "$BASE/users/<uuid>/lock" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"locked":true}'
```

Lock ≠ remove from allowlist. Locked users get `401` even if still allowlisted.

## Bootstrap (empty table / first deploy)

If the table is empty at app boot, Nest seeds from Heroku config:

```bash
heroku config:set AUTH_BOOTSTRAP_ALLOWED_EMAILS=a@x.com,b@y.com -a nestjs-mega-backend-preprod
```

Only runs when the table is **empty**. Prefer the HTTP APIs for day-to-day add/remove.

## Response to user

Short summary table: email → action → result. No full JWTs or passwords in the reply.
