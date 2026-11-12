// Applies the SQL files in supabase/migrations that have not been applied yet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, tx } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

await q('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())');
await q('alter table _migrations enable row level security');
const done = new Set((await q('select name from _migrations')).map((r) => r.name));

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue;
  await tx(async (db) => {
    await db.q(fs.readFileSync(path.join(dir, file), 'utf8'));
    await db.q('insert into _migrations(name) values($1)', [file]);
  });
  console.log('applied', file);
}
console.log('Database is up to date.');
await pool.end();
