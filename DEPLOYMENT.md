# Vercel and Supabase deployment

The app is prepared for two Vercel projects backed by Supabase. It does not need Render. No production credentials are stored in the repository.

## 1. Push the repository to GitHub

Commit the workspace root, including `package-lock.json`, `prisma/`, `server/`, and `web/`. Do not commit `.env` or any Supabase service-role key.

## 2. Prepare Supabase

Create a Supabase project and configure:

- A PostgreSQL database.
- A **public** Storage bucket named `entron-public` for card backgrounds, generated cards, and QR images.
- A **private** Storage bucket named `entron-private` for guest-list source spreadsheets.

Allow uploads up to 20 MB in the public bucket and 10 MB in the private bucket. The API creates single-use signed upload authorizations. Keep the private bucket private; do not expose the service-role key or private bucket contents to the browser.

For database connections, use the Supabase transaction pooler connection string for `DATABASE_URL`. Use the direct database connection string (or Supabase session pooler when direct IPv6 access is unavailable) for `DIRECT_URL`. Preserve the SSL parameters included in the Supabase connection strings.

## 3. Create two Vercel projects

Import the same GitHub repository twice. For both projects, set **Include source files outside the Root Directory** so npm workspaces and the shared Prisma schema are available.

### API project

- Root Directory: `server`
- Framework preset: Express (or Other if Express is not detected)
- The checked-in `server/vercel.json` configures install, Prisma generation, build, and the function duration.
- Configure these environment variables for Production and any Preview environments that will use the API:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase transaction-pooler URI |
| `DIRECT_URL` | Supabase direct/session connection URI |
| `JWT_SECRET` | Unique random secret, at least 32 characters |
| `JWT_REFRESH_SECRET` | A different unique random secret, at least 32 characters |
| `SERVER_ORIGIN` | The deployed web origin, e.g. `https://your-web-domain.vercel.app` |
| `CORS_ORIGINS` | Comma-separated exact web origins; do not include trailing slashes |
| `STORAGE_TYPE` | `supabase` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key; API project only |
| `SUPABASE_PUBLIC_BUCKET` | `entron-public` |
| `SUPABASE_PRIVATE_BUCKET` | `entron-private` |

Set the optional messaging/payment variables only when those providers are configured. They are not required to deploy.

### Web project

- Root Directory: `web`
- Framework preset: Next.js
- Configure these environment variables for Production and any Preview environments:

| Variable | Value |
| --- | --- |
| `BACKEND_URL` | The deployed API origin, e.g. `https://your-api-domain.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |

The web project must never receive `SUPABASE_SERVICE_ROLE_KEY`.

For Vercel preview deployments, add each web origin that should call the API to the API project's `CORS_ORIGINS`, then redeploy the API. Origins are matched exactly.

## 4. Apply the database migrations

Before using the app, apply the checked-in migrations to the Supabase database. From a trusted local machine with the production `DIRECT_URL` available in its environment, run:

```powershell
npx prisma migrate deploy
```

Do not use `prisma migrate dev` against production. Vercel builds generate the Prisma client but intentionally do not run database migrations.

If this is a new database, create the initial admin account once with private `SEED_ADMIN_PHONE` and `SEED_ADMIN_PASSWORD` values, then run `npm run db:seed` from the workspace root. The seed script no longer creates a default-password account.

## 5. Verify the deployments

- Open `https://your-api-domain.vercel.app/api/v1/health` and confirm it returns a healthy response.
- Open the web deployment, sign in, and verify event, guest, and card-design workflows.
- Test guest-list preview/import, template upload, card generation, QR display, and ZIP export.
- Keep any real NextSMS or payment-provider credentials unset until those services are intentionally configured.

Local development continues to use filesystem uploads by default (`STORAGE_TYPE=local`). The deployment uses direct signed uploads to Supabase Storage; the browser receives only short-lived upload authorization. Existing files in a local `uploads/` directory are not copied automatically to Supabase, so migrate any existing card/template/QR assets before pointing an existing production database at Supabase Storage.
