# CSE Shared Passphrase Auth

A minimal authentication system for CSE internal tools. It gates access behind a shared passphrase without requiring user accounts, OAuth, or a database.

## How It Works

1. A staff member visits any protected page.
2. The server middleware checks for a valid `cse_auth` cookie.
3. If missing or expired, the user is redirected to `/login`.
4. The user enters the shared passphrase. The server verifies it against the `AUTH_PASSPHRASE` environment variable.
5. On success, the server creates an HMAC-signed token (`timestamp.signature`) and sets it as an httpOnly cookie valid for 7 days.
6. On subsequent requests, the middleware verifies the cookie's HMAC signature using `AUTH_SECRET` and checks that the timestamp hasn't expired.

## Security Properties

- **Signed cookies**: The token is `{timestamp}.{HMAC-SHA256(timestamp, AUTH_SECRET)}`. It can't be forged without knowing the secret, and `crypto.timingSafeEqual` prevents timing attacks.
- **httpOnly + Secure + SameSite=Lax**: The cookie isn't accessible to JavaScript and is only sent over HTTPS (except localhost).
- **Server-side only**: `AUTH_SECRET` and `AUTH_PASSPHRASE` are in Nuxt's private `runtimeConfig` — they are never sent to the browser.

## Rotating Access

| Action | How | Effect |
|--------|-----|--------|
| Invalidate all sessions | Change `AUTH_SECRET` in Vercel | All existing cookies fail verification immediately |
| Change the passphrase | Change `AUTH_PASSPHRASE` in Vercel | Existing sessions remain valid; new logins require the new passphrase |
| Revoke everything | Change both env vars | All sessions invalidated and new passphrase required |

## Files

```
server/
  utils/auth.ts              Token creation and verification (HMAC + expiry)
  middleware/auth.ts          Runs on every request — redirects to /login if unauthenticated
  api/auth/login.post.ts     POST endpoint — validates passphrase, sets cookie
  api/auth/logout.post.ts    POST endpoint — clears cookie
pages/
  login.vue                  Login form
```

## Reusing in Another Nuxt App

1. Copy the four `server/` files into the new project (same paths).
2. Add the runtime config to `nuxt.config.ts`:
   ```ts
   runtimeConfig: {
     authSecret: process.env.AUTH_SECRET || '',
     authPassphrase: process.env.AUTH_PASSPHRASE || '',
   }
   ```
3. Copy `pages/login.vue` (adjust branding as needed).
4. Set `AUTH_SECRET` and `AUTH_PASSPHRASE` in the new project's Vercel environment variables.

The two apps can share the same `AUTH_SECRET` and `AUTH_PASSPHRASE` (so one passphrase works everywhere) or use different values (independent access control).

## Limitations

- **No per-user identity**: Everyone shares the same passphrase. You can't revoke one person without rotating the passphrase for everyone.
- **No audit trail**: There's no record of who logged in, only that someone with the passphrase did.
- **Cookie expiry is clock-based**: The 7-day window is calculated from the token's timestamp. Changing server clocks or large clock skew could cause issues (unlikely in practice on Vercel).

If per-user revocation or audit logging becomes necessary, the next step would be issuing unique invite codes per staff member, stored in a lightweight database.
