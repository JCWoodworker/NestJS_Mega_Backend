# IAM

## Email allowlist + user lock

Global gate on Nest sign-up / sign-in / Google / refresh:

- Table `auth_allowed_emails` — only listed emails may authenticate.
- Column `users.is_locked` — locked users get a generic `401` even if allowlisted.
- Bootstrap: if the allowlist table is empty at boot, seed from
  `AUTH_BOOTSTRAP_ALLOWED_EMAILS` (comma-separated). Set this on Heroku before first deploy
  of this feature (e.g. `jfc3303@gmail.com`) so you are not locked out.

### Admin APIs (role `admin`)

```
GET    /api/v1/authentication/allowed-emails
POST   /api/v1/authentication/allowed-emails   { "email": "...", "note?": "..." }
DELETE /api/v1/authentication/allowed-emails/:id

GET    /api/v1/users/all-users                 // includes isLocked
PATCH  /api/v1/users/:id/lock                  { "locked": true|false }
```

## TODO

* Add more social sign-ups & ins
  * Facebook
  * Google
  * Twitter
  * GitHub
  * etc
