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

Apply these migrations in the SQL Editor (in order), plus earlier auth/RLS migrations as needed:

- `20260804140000_data_source_connectors.sql`
- `20260804180000_physical_ingest_tables.sql`
- `20260804200000_ingest_lookup_expansion.sql`
- `20260804210000_connections_and_data_sources.sql` — splits **Connections** (shared auth) from **Sources** (per-endpoint ingest)

Add secrets encryption (required) and optional LLM keys to `.env`:

```bash
CONNECTOR_SECRETS_KEY=change-me-to-a-long-random-string
# LLM for “Generate with AI” (Gemini recommended)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
# GEMINI_MODEL=gemini-2.0-flash
# Or OpenAI: LLM_PROVIDER=openai + OPENAI_API_KEY=sk-...
```

Restart `npm run dev`.

### Menu

- **Connector Type** (`/data-sources/connector-types`) — platform admin + MFA  
  - Seeded: `json_file`, `csv_file`, `rest_generic`  
  - **Generate with AI** proposes connection / source / credential schemas; review then publish  
- **Connections** (`/data-sources/connections`) — shared base URL + credentials (reusable)  
- **Sources** (`/data-sources/sources`) — path, paging, lookup, destination table; pick an existing connection  

### Ingest landing

Each source’s `destination_table` becomes `ingest.<destination_table>`.
In the Table Editor, switch the schema dropdown from `public` to **`ingest`**.

### URL lookup expansion (REST sources)

On a source, enable **Expand URL from ingest table**, set a path like
`/teams/{team_id}/players`, pick a prior ingest table, and map each `{var}` to a column.
A run issues one request per distinct value set (capped; test mode uses up to 3) and unions rows into the destination.
Credentials still come from the linked **connection**.

### Pipeline (Filter + Transform)

Apply `20260805120000_data_source_pipeline.sql`.

Each Source has a canvas: **Retrieve → (Filter | Transform)* → Ingest**.

- Drag **Filter** / **Transform** onto the canvas and link left-to-right
- **Filter**: keep flat fields + AND rules (`eq`, `neq`, `contains`, `not_contains`)
- **Transform**: ordered field actions (does not drop rows)
  - Trim (`start` / `end` / `both` / `remove_spaces` — UI “All spaces” strips every space)
  - Case value transform (`camel`, `pascal`, `snake`, `kebab`, `lower`, `upper`) + optional rename
  - Join fields, split → array, array → string, regex replace
  - Rename / copy / drop, cast, default/fill null
  - **v1.1:** template (`{field}` / `${field}`), conditional set, value map, date format
  - Paste sample JSON or **Load from parent** (first object after upstream operators)
- Canvas **Auto layout** aligns nodes by chain depth; default zoom is 75%
- **Test** never writes; returns retrieved vs kept counts (+ step samples)
- **Run** writes pipeline output to `ingest.<destination>`

### Dashboards (v1)

Apply `20260805200000_dashboards.sql`.

- **View Dashboards** (`/dashboards`) — org members see dashboards by visibility (`public` / `role` / `private`); Org Admin & Platform Admin see all
- **Configure Dashboards** (`/dashboards/configure`) — Org Admin / Platform (aal2): create, edit widgets, joins, aggregates
- Widgets query ingest destinations via `dashboard_run_query` (sum/count/min/max, multi-table inner joins, optional series split)
- Clicking chart categories applies a cross-filter to other widgets on the same dashboard

### Merge sources (multi-input)

Apply `20260805140000_ingest_read_rows.sql` (RPC `ingest_read_rows` for last-ingest reads).

Create via **Add** → template **Merge**. Canvas: **Fetch ×2+ → Merge → (Filter | Transform)* → Ingest**.

- Each **Fetch** picks an existing source
- Default load mode: **Last ingest table** (`ingest.<child_destination>`)
- Optional: **Refresh now** (re-runs the child source when the merge runs)
- Fetch inputs load in parallel (`Promise.all`) so refresh work is non-blocking across branches
- **Merge** is an inner join on configured key pairs (exactly two inbound edges; chain Merges for 3+)
- Output fields are prefixed (`a_`, `b_` by default) to avoid collisions
- Cycles (A merges B merges A) are rejected
