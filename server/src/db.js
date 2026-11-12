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
  keepAlive: true,
  // Supabase requires TLS; a local Postgres does not.
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
});

// A connection that drops while idle must not stop the server; the pool opens a new one.
pool.on('error', (e) => console.error('Database connection lost:', e.message));

/** True when the database could not be reached (internet down, project paused…), as opposed to a real error. */
export const isConnectionError = (e) =>
  /timeout|terminated|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH/i.test(`${e?.code} ${e?.message} ${e?.cause?.message}`);

/** Opens a connection, trying up to 3 times: a weak internet link often fails once and works the next time. */
async function connect() {
  for (let attempt = 1; ; attempt++) {
    try { return await pool.connect(); }
    catch (e) { if (attempt >= 3 || !isConnectionError(e)) throw e; }
  }
}

const wrap = (client) => ({
  q: (text, params) => client.query(text, params).then((r) => r.rows),
  one: (text, params) => client.query(text, params).then((r) => r.rows[0] ?? null),
});

/** Run one query on a fresh connection from the pool. */
async function run(text, params) {
  const client = await connect();
  try { return (await client.query(text, params)).rows; }
  finally { client.release(); }
}
export const q = run;
export const one = (text, params) => run(text, params).then((rows) => rows[0] ?? null);

/** Run fn inside one database transaction: everything is saved, or nothing is. */
export async function tx(fn) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {}); // the connection itself may be gone
    throw e;
  } finally {
    client.release();
  }
}
