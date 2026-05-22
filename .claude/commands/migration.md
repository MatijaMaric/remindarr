Generate a safe Drizzle migration for remindarr (Cloudflare D1 + Bun SQLite).

**Usage**: `/migration <table> <column> <type> <default>`

Example: `/migration users notification_mode text "email"`

**Safety check first — REJECT if:**

- `<table>` is `users`, `titles`, or `providers` AND the change is anything other than `ADD COLUMN`
- The column is `NOT NULL` without a `DEFAULT` (would fail on existing rows)

**Steps:**

1. List `server/db/migrations/` and find the highest-numbered file (e.g., `0042_...sql`)
2. Generate the next file as `<N+1>_add_<column>_to_<table>.sql`:
   ```sql
   ALTER TABLE <table> ADD COLUMN <column> <type> NOT NULL DEFAULT '<default>';
   ```
3. Run `bun run db:generate` and report whether Drizzle agrees with the manual migration (schema drift = error)
4. Run `bun test server/db/migrations.test.ts` and report pass/fail
5. Print the full path of the generated file

If the request would require recreating a parent table (e.g., changing a column type on `users`), explain why it's unsafe on D1 and propose the closest safe alternative (e.g., add a new column and deprecate the old one).
