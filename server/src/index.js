import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, q, tx } from './db.js';
import { checkPassword, clearThrottle, endSession, makeUser, requireOwner, requireUser, sessionUser, setPassword, startSession, throttle } from './auth.js';
import { balanceOf, createTxn, customerId, deleteTxn, getState, listTxns, report, seedAccounts } from './ledger.js';
import { CURRENCIES, bad, isDate, isMonth, str, toMinor, today } from './util.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  next();
});

const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Block cross-site form posts: anything that changes data must be JSON sent by our own page.
  if (req.method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) throw bad('Invalid request');
  req.body ||= {};
  next();
});

/* ---------- public: first-time setup and sign in ---------- */
api.get('/me', async (req, res) => {
  const u = await sessionUser(req);
  res.json({ setup: !(await one('select 1 from users limit 1')), user: u && { username: u.username, role: u.role } });
});
api.post('/setup', async (req, res) => {
  await tx(async (db) => {
    await db.q('lock table users in exclusive mode');
    if (await db.one('select 1 from users limit 1')) throw bad('Already set up', 403);
    await makeUser(db, req.body.username, req.body.password, 'owner');
    await seedAccounts(db);
  });
  res.json({ ok: true });
});
api.post('/login', async (req, res) => {
  throttle(req.ip);
  const u = await one('select * from users where username=$1', [str(req.body.username, 40).toLowerCase()]);
  if (!u || !(await checkPassword(u, req.body.password))) throw bad('Wrong username or password', 401);
  clearThrottle(req.ip);
  await startSession(req, res, u.id);
  res.json({ ok: true });
});

/* ---------- signed in: read ---------- */
api.use(requireUser);
api.post('/logout', async (req, res) => { await endSession(req, res); res.json({ ok: true }); });
api.post('/password', async (req, res) => {
  const u = await one('select * from users where id=$1', [req.user.id]);
  if (!(await checkPassword(u, req.body.current))) throw bad('Current password is wrong');
  await setPassword(u.id, req.body.password);
  await q('delete from sessions where user_id=$1 and token<>$2', [u.id, req.user.token]);
  res.json({ ok: true });
});
api.get('/state', async (req, res) => res.json(await getState(req.user, isDate(req.query.today) ? req.query.today : today())));
api.get('/txns', async (req, res) => res.json(await listTxns(req.query)));
api.get('/report', async (req, res) => {
  res.json(await report(isDate(req.query.from) ? req.query.from : today(), isDate(req.query.to) ? req.query.to : today()));
});

/* ---------- owner only: everything that changes data ---------- */
api.use(requireOwner);
const id = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n) || n < 1) throw bad('Not found', 404); return n; };
const ok = (res) => res.json({ ok: true });

api.post('/txns', async (req, res) => res.json(await tx((db) => createTxn(db, req.body, req.user))));
api.delete('/txns/:id', async (req, res) => { await tx((db) => deleteTxn(db, id(req))); ok(res); });

api.post('/accounts', async (req, res) => {
  const b = req.body, provider = str(b.provider, 40);
  if (!provider) throw bad('Enter the account name');
  if (!['virtual', 'cash', 'bank'].includes(b.kind)) throw bad('Choose the account type');
  if (!CURRENCIES.includes(b.currency)) throw bad('Choose the currency');
  await q('insert into accounts(provider, label, kind, currency, on_dashboard) values($1,$2,$3,$4,$5)', [provider, str(b.label, 40), b.kind, b.currency, !!b.on_dashboard]);
  ok(res);
});
api.put('/accounts/:id', async (req, res) => {
  const b = req.body, provider = str(b.provider, 40);
  if (!provider) throw bad('Enter the account name');
  await tx(async (db) => {
    await db.q('select 1 from accounts where id=$1 for update', [id(req)]);
    if (b.archived && (await balanceOf(db, id(req))) !== 0) throw bad('Only an account with zero balance can be closed');
    await db.q('update accounts set provider=$1, label=$2, on_dashboard=$3, archived=$4 where id=$5', [provider, str(b.label, 40), !!b.on_dashboard, !!b.archived, id(req)]);
  });
  ok(res);
});

const customerFields = (b) => { const name = str(b.name, 80); if (!name) throw bad('Enter the customer name'); return [name, str(b.phone, 40), str(b.note, 300)]; };
api.post('/customers', async (req, res) => { await q('insert into customers(name, phone, note) values($1,$2,$3)', customerFields(req.body)); ok(res); });
api.put('/customers/:id', async (req, res) => { await q('update customers set name=$1, phone=$2, note=$3 where id=$4', [...customerFields(req.body), id(req)]); ok(res); });
api.delete('/customers/:id', async (req, res) => {
  if (await one('select 1 from txns where customer_id=$1 limit 1', [id(req)]) || await one('select 1 from rentals where customer_id=$1 limit 1', [id(req)])) {
    throw bad('This customer has records and cannot be deleted');
  }
  await q('delete from customers where id=$1', [id(req)]);
  ok(res);
});

api.post('/rentals', async (req, res) => {
  const b = req.body, property = str(b.property, 80);
  if (!property) throw bad('Enter the property name');
  if (!CURRENCIES.includes(b.currency)) throw bad('Choose the currency');
  if (!isMonth(b.start_month)) throw bad('Choose the first month of rent');
  const monthly = toMinor(b.monthly, 'Monthly rent');
  await tx(async (db) => {
    await db.q('insert into rentals(property, customer_id, monthly, currency, start_month, note) values($1,$2,$3,$4,$5,$6)',
      [property, await customerId(db, b, true), monthly, b.currency, b.start_month, str(b.note, 300)]);
  });
  ok(res);
});
api.put('/rentals/:id', async (req, res) => {
  const active = !!req.body.active;
  const rows = await q('update rentals set active=$1, end_month=$2 where id=$3 returning id',
    [active, active ? null : (isMonth(req.body.end_month) ? req.body.end_month : today().slice(0, 7)), id(req)]);
  if (!rows.length) throw bad('Rental not found', 404);
  ok(res);
});

api.put('/settings', async (req, res) => {
  const r = Number(req.body.ref_rate);
  if (!Number.isFinite(r) || r <= 0) throw bad('Enter a valid rate');
  await q("insert into settings(key, value) values('ref_rate', $1) on conflict(key) do update set value = excluded.value", [String(r)]);
  ok(res);
});

/* Rates only pre-fill the forms; they never change operations already recorded. */
api.put('/rates/exchange', async (req, res) => {
  const { from_currency: from, to_currency: to } = req.body, rate = Number(req.body.rate);
  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to) || from === to) throw bad('Choose two different currencies');
  if (!Number.isFinite(rate) || rate <= 0) throw bad('Enter a valid rate');
  await q(`insert into exchange_rates(from_currency, to_currency, rate) values($1,$2,$3)
           on conflict(from_currency, to_currency) do update set rate = excluded.rate, updated_at = now()`, [from, to, rate]);
  ok(res);
});
api.delete('/rates/exchange/:id', async (req, res) => { await q('delete from exchange_rates where id=$1', [id(req)]); ok(res); });

async function saveFee(req, feeId) {
  const b = req.body;
  if (!['deposit', 'withdraw'].includes(b.kind)) throw bad('Choose deposit or withdrawal');
  if (!CURRENCIES.includes(b.currency)) throw bad('Choose the currency');
  const provider = str(b.provider, 40);
  const min = toMinor(b.min_amount || 0, 'From amount', true);
  const max = b.max_amount === '' || b.max_amount == null ? null : toMinor(b.max_amount, 'To amount');
  if (max != null && max < min) throw bad('“To amount” must be bigger than “From amount”');
  const value = Number(b.value);
  if (!Number.isFinite(value) || value < 0) throw bad('Enter the price');
  const percent = b.fee_type === 'percent';
  if (percent && value > 100) throw bad('Percent cannot be more than 100');
  await tx(async (db) => {
    await db.q('lock table transfer_fees in exclusive mode');
    const clash = await db.one(
      `select 1 from transfer_fees where kind=$1 and provider=$2 and currency=$3 and id <> $4
       and min_amount <= coalesce($6, 9223372036854775807) and $5 <= coalesce(max_amount, 9223372036854775807)`,
      [b.kind, provider, b.currency, feeId || 0, min, max]);
    if (clash) throw bad('This range overlaps another price for the same network and currency');
    const args = [b.kind, provider, b.currency, min, max, percent ? 0 : Math.round(value * 100), percent ? value : 0];
    if (feeId) {
      const rows = await db.q('update transfer_fees set kind=$1, provider=$2, currency=$3, min_amount=$4, max_amount=$5, fee=$6, percent=$7 where id=$8 returning id', [...args, feeId]);
      if (!rows.length) throw bad('Not found', 404);
    } else {
      await db.q('insert into transfer_fees(kind, provider, currency, min_amount, max_amount, fee, percent) values($1,$2,$3,$4,$5,$6,$7)', args);
    }
  });
}
api.post('/rates/fees', async (req, res) => { await saveFee(req); ok(res); });
api.put('/rates/fees/:id', async (req, res) => { await saveFee(req, id(req)); ok(res); });
api.delete('/rates/fees/:id', async (req, res) => { await q('delete from transfer_fees where id=$1', [id(req)]); ok(res); });

api.post('/users', async (req, res) => {
  await tx((db) => makeUser(db, req.body.username, req.body.password, req.body.role === 'owner' ? 'owner' : 'viewer'));
  ok(res);
});
api.delete('/users/:id', async (req, res) => {
  if (id(req) === req.user.id) throw bad('You cannot delete your own account');
  await q('delete from users where id=$1', [id(req)]);
  ok(res);
});

api.use(() => { throw bad('Not found', 404); });
app.use('/api', api);

/* ---------- the built React app ---------- */
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*any}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode;
  if (!status || status >= 500) console.error(err);
  res.status(status && status < 500 ? status : 500).json({ error: status && status < 500 ? err.message : 'Something went wrong on the server' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`ETS AMANI API → http://localhost:${port}`));
