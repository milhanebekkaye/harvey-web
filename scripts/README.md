# Scripts

## apply-discussion-migrations.sql

Use this **if `prisma migrate` fails** (e.g. P1011 TLS certificate error with Supabase).

This is the **recommended workaround** when Prisma CLI cannot connect (e.g. Supabase pooler TLS issues).

### Steps

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy the contents of `apply-discussion-migrations.sql` and run it
3. Optionally, mark migrations as applied so Prisma's history stays in sync:

   ```bash
   npx prisma migrate resolve --applied "20260207175000_add_discussion_type_and_taskid" --schema=src/prisma/schema.prisma
   npx prisma migrate resolve --applied "20260207180000_migrate_discussion_types_to_onboarding" --schema=src/prisma/schema.prisma
   ```

4. Regenerate Prisma client: `npm run prisma:generate`

---

## If Prisma migrate still fails after adding DIRECT_URL

1. **Use the direct connection** (not pooler): In Supabase Dashboard → Settings → Database, copy the **Direct connection** URI (host `db.xxx.supabase.co`, port 5432).
2. Add to `.env`:
   ```
   DIRECT_URL="postgresql://postgres.[PROJECT]:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?sslmode=require"
   ```
3. If TLS errors persist, run `scripts/apply-discussion-migrations.sql` in Supabase SQL Editor — the app includes fallbacks for missing columns.
