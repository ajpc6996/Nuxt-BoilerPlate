# Supabase bootstrap for Zorro

## 1. API keys

In Dashboard → **Settings → API Keys** → **Publishable and secret API keys**, put in `.env`:

```bash
NUXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

URL must be the project root only (no `/rest/v1`). Restart `npm run dev` after changes.

## 2. Auth redirect URLs (required for password reset)

Dashboard → **Authentication → URL Configuration**:

| Setting | Local development value |
|--------|-------------------------|
| **Site URL** | `http://localhost:3000` |
| **Redirect URLs** (add both) | `http://localhost:3000/auth/reset-password` |
|  | `http://localhost:3000/auth/callback` |

Without these, reset emails open the app but Auth rejects the redirect / code exchange.

When you trigger “Reset password” from the Supabase dashboard, it uses **Site URL**. Prefer requesting reset from the app login page so `redirectTo` is set to `/auth/reset-password`.

## 3. Create / promote platform admin

Create your user (Authentication → Users, or sign in once), then in **SQL Editor**:

```sql
update public.profiles
set is_platform_admin = true
where email = 'you@example.com';
```

## 4. MFA

Enable TOTP under Authentication settings. Enroll under **My User → Security**, then open **Platform** (`/platform`).
