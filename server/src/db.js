import net from 'node:net';
import pg from 'pg';

// Node gives each address only 250 ms to answer before trying the next one.
// On a slow or distant internet link that is too short and every attempt
// fails with ETIMEDOUT, so allow 10 seconds.
net.setDefaultAutoSelectFamilyAttemptTimeout(10_000);

// Postgres returns bigint / numeric / date as strings by default.
// Amounts are whole cents well below 2^53, so plain numbers are safe.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(1082, (v) => v); // date → 'YYYY-MM-DD'

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and paste your Supabase connection string.');
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: url,
  max: 10,
  connectionTimeoutMillis: 30_000,
  // Supabase requires TLS; a local Postgres does not.
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
});

const wrap = (client) => ({
  q: (text, params) => client.query(text, params).then((r) => r.rows),
  one: (text, params) => client.query(text, params).then((r) => r.rows[0] ?? null),
});

export const { q, one } = wrap(pool);

/** Run fn inside one database transaction: everything is saved, or nothing is. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
