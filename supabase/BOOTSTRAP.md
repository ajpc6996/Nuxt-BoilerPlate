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

### Org & user management (UI)

| Who | Where | Can do |
|-----|--------|--------|
| **Platform admin** | **Platform → Organizations** | Create orgs (you become Admin member), MFA mode, set active org |
| **Platform or Org Admin** | **Administration → Users / Roles** | Invite/create users, assign roles, membership status, custom roles — **active org only** |

Org admins **cannot** create organizations.

Apply `20260804190000_org_admin_member_select.sql` so org admins can list other members in their org.

### Create / promote platform admin

Create your user (Authentication → Users, or sign in once), then in **SQL Editor**:

```sql
update public.profiles
set is_platform_admin = true
where email = 'you@example.com';
```

### Org switcher empty but SQL shows membership

Apply `supabase/migrations/20260804160000_fix_membership_rls_select.sql` in the SQL Editor.
Old RLS called `private.*` helpers; without schema grants the browser gets permission errors and shows no org.

### First organization + Admin membership

If the org switcher is empty, also run (same email):

```sql
-- Fix RLS helpers (required once; also in 20260804150000 / 20260804160000 migrations)
grant usage on schema private to authenticated;
grant execute on function private.jwt_aal() to authenticated;
grant execute on function private.is_aal2() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- Create org + make yourself a member with Admin
insert into public.organizations (name, slug, mfa_mode, created_by)
select 'Default Org', 'default-org', 'optional', id
from public.profiles
where email = 'you@example.com'
on conflict (slug) do nothing;

with me as (select id from public.profiles where email = 'you@example.com'),
     org as (select id from public.organizations where slug = 'default-org')
insert into public.organization_members (organization_id, user_id, status)
select org.id, me.id, 'active' from org, me
on conflict (organization_id, user_id) do update set status = 'active';

with me as (select id from public.profiles where email = 'you@example.com'),
     org as (select id from public.organizations where slug = 'default-org'),
     admin_role as (
       select r.id from public.roles r
       join org on org.id = r.organization_id
       where r.name = 'Admin'
     )
insert into public.user_roles (organization_id, user_id, role_id)
select org.id, me.id, admin_role.id from org, me, admin_role
on conflict (user_id, role_id) do nothing;
```

Then sign out / sign in. Or as platform admin: **Platform → Organizations → Create**, then **Set active**.

## 4. MFA

Enable TOTP under Authentication settings. Enroll under **My User → Security**, then open **Platform** (`/platform`).

## 5. Data source connectors

Apply migration `supabase/migrations/20260804140000_data_source_connectors.sql` in the SQL Editor (or CLI).

Add a secrets encryption key to `.env` (any long random string):

```bash
CONNECTOR_SECRETS_KEY=change-me-to-a-long-random-string
```

Restart `npm run dev`.

- **Connector Type** (`/data-sources/connector-types`) — platform admin + MFA  
- **Connections** (`/data-sources/connections`) — platform or org admin + MFA  

Seeded types: `json_file`, `csv_file`, `rest_generic`.

**Ingest landing:** each connection’s `destination_table` becomes a real table
`ingest.<destination_table>` (apply `20260804180000_physical_ingest_tables.sql`).
In the Table Editor, switch the schema dropdown from `public` to **`ingest`**.

**URL lookup expansion (REST):** apply `20260804200000_ingest_lookup_expansion.sql`.
On a REST connection, enable **Expand URL from ingest table**, set a path like
`/teams/{team_id}/players`, pick a prior ingest table, and map each `{var}` to a column.
A run issues one request per distinct value set (capped; test mode uses up to 3) and unions rows into the destination.