import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isConnectionError, one, q, tx } from './db.js';
import { checkPassword, clearThrottle, endSession, makeUser, requireOwner, requireUser, sessionUser, setPassword, startSession, throttle } from './auth.js';
import { balanceOf, createTxn, currencyCodes, customerId, deleteTxn, getState, listTxns, report, seedAccounts } from './ledger.js';
import { bad, isDate, str, toMinor, today } from './util.js';

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
const needCurrency = async (code) => { if (!(await currencyCodes()).includes(code)) throw bad('Choose the currency'); };

api.post('/txns', async (req, res) => res.json(await tx((db) => createTxn(db, req.body, req.user))));
api.delete('/txns/:id', async (req, res) => { await tx((db) => deleteTxn(db, id(req))); ok(res); });

api.post('/accounts', async (req, res) => {
  const b = req.body, provider = str(b.provider, 40);
  if (!provider) throw bad('Enter the account name');
  if (!['virtual', 'cash', 'bank'].includes(b.kind)) throw bad('Choose the account type');
  await needCurrency(b.currency);
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

// Two people can share a name, never a phone number. Numbers are compared on their
// last 9 digits, so 0991 234 567 and +243 991 234 567 count as the same phone.
const phoneKey = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : d; };
async function saveCustomer(b, customerId) {
  const name = str(b.name, 80), phone = str(b.phone, 40), key = phoneKey(phone);
  if (!name) throw bad('Enter the customer name');
  return tx(async (db) => {
    await db.q('lock table customers in share row exclusive mode'); // two saves at once cannot both take the same number
    if (key) {
      const taken = (await db.q("select id, name, phone from customers where phone <> '' and id <> $1", [customerId || 0])).find((c) => phoneKey(c.phone) === key);
      if (taken) throw bad(`This phone number already belongs to ${taken.name}`);
    }
    if (!customerId) return (await db.one('insert into customers(name, phone, note) values($1,$2,$3) returning id', [name, phone, str(b.note, 300)])).id;
    const rows = await db.q('update customers set name=$1, phone=$2, note=$3 where id=$4 returning id', [name, phone, str(b.note, 300), customerId]);
    if (!rows.length) throw bad('Customer not found', 404);
    return customerId;
  });
}
api.post('/customers', async (req, res) => res.json({ ok: true, id: await saveCustomer(req.body) }));
api.put('/customers/:id', async (req, res) => res.json({ ok: true, id: await saveCustomer(req.body, id(req)) }));
api.delete('/customers/:id', async (req, res) => {
  if (await one('select 1 from txns where customer_id=$1 limit 1', [id(req)]) || await one('select 1 from rentals where customer_id=$1 limit 1', [id(req)])) {
    throw bad('This customer has records and cannot be deleted');
  }
  await q('delete from customers where id=$1', [id(req)]);
  ok(res);
});

const RENTAL_TYPES = ['car', 'apartment', 'house', 'shop', 'land', 'other'];
/** Checks a rental form and returns clean values. */
async function rentalFields(b) {
  const property = str(b.property, 80);
  if (!property) throw bad('Enter the name');
  if (!RENTAL_TYPES.includes(b.type)) throw bad('Choose the type of rental');
  if (!['day', 'week', 'month'].includes(b.period_unit)) throw bad('Choose how the rent is charged');
  if (!isDate(b.start_date)) throw bad('Choose the start date');
  const end = b.end_date ? b.end_date : null;
  if (end && (!isDate(end) || end < b.start_date)) throw bad('The end date must be after the start date');
  // details: the attributes of the type, e.g. { plate: 'CGO 1234 AB' }
  const details = {};
  for (const [k, v] of Object.entries(b.details && typeof b.details === 'object' ? b.details : {}).slice(0, 12)) {
    if (/^[a-z_]{1,30}$/.test(k) && str(v, 120)) details[k] = str(v, 120);
  }
  return { property, type: b.type, unit: b.period_unit, start: b.start_date, end, details: JSON.stringify(details), rate: toMinor(b.rate, 'Price'), note: str(b.note, 300) };
}
api.post('/rentals', async (req, res) => {
  const f = await rentalFields(req.body);
  await needCurrency(req.body.currency);
  await tx(async (db) => {
    await db.q('insert into rentals(property, type, details, customer_id, rate, period_unit, currency, start_date, end_date, note) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [f.property, f.type, f.details, await customerId(db, req.body, true), f.rate, f.unit, req.body.currency, f.start, f.end, f.note]);
  });
  ok(res);
});
api.put('/rentals/:id', async (req, res) => {
  const f = await rentalFields(req.body); // the tenant and the currency stay as they are: payments already refer to them
  const rows = await q('update rentals set property=$1, type=$2, details=$3, rate=$4, period_unit=$5, start_date=$6, end_date=$7, note=$8 where id=$9 returning id',
    [f.property, f.type, f.details, f.rate, f.unit, f.start, f.end, f.note, id(req)]);
  if (!rows.length) throw bad('Rental not found', 404);
  ok(res);
});
// End a rental today (rent stops counting), or re-open it.
api.put('/rentals/:id/active', async (req, res) => {
  const active = !!req.body.active, day = isDate(req.body.today) ? req.body.today : today();
  const rows = await q(
    `update rentals set active=$1, end_date = case when $1 then null when end_date is not null and end_date < $2::date then end_date else $2::date end where id=$3 returning id`,
    [active, day, id(req)]);
  if (!rows.length) throw bad('Rental not found', 404);
  ok(res);
});

/* Currencies: USD is the base; others can be added (e.g. UGX for Uganda). */
api.post('/currencies', async (req, res) => {
  const code = str(req.body.code, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw bad('The currency code is 3 letters, e.g. UGX');
  await tx(async (db) => {
    if (await db.one('select 1 from currencies where code=$1', [code])) throw bad(`${code} already exists`);
    await db.q('insert into currencies(code, name) values($1,$2)', [code, str(req.body.name, 40)]);
    if (req.body.with_accounts) {
      for (const [provider, kind] of [['Cash', 'cash'], ['Bank', 'bank']]) {
        await db.q('insert into accounts(provider, kind, currency) values($1,$2,$3)', [provider, kind, code]);
      }
    }
  });
  ok(res);
});

/* Rates only pre-fill the forms; they never change operations already recorded. */

// Reference (cost) rate of a currency: 1 USD = ? of it. Exchange profit is measured against it.
api.put('/settings', async (req, res) => {
  const r = Number(req.body.ref_rate), currency = req.body.currency;
  await needCurrency(currency);
  if (currency === 'USD') throw bad('USD is the base currency');
  if (!Number.isFinite(r) || r <= 0) throw bad('Enter a valid rate');
  await q('insert into settings(key, value) values($1, $2) on conflict(key) do update set value = excluded.value', ['ref_rate_' + currency, String(r)]);
  ok(res);
});

// My rate for one direction: 1 unit of what I give = ? of what I receive.
api.put('/rates/exchange', async (req, res) => {
  const { from_currency: from, to_currency: to } = req.body, rate = Number(req.body.rate);
  await needCurrency(from); await needCurrency(to);
  if (from === to) throw bad('Choose two different currencies');
  if (!Number.isFinite(rate) || rate <= 0) throw bad('Enter a valid rate');
  await q(`insert into exchange_rates(from_currency, to_currency, rate) values($1,$2,$3)
           on conflict(from_currency, to_currency) do update set rate = excluded.rate, updated_at = now()`, [from, to, rate]);
  ok(res);
});

// Replace the whole price list of one operation + network + currency in one go.
api.put('/rates/fees', async (req, res) => {
  const b = req.body, provider = str(b.provider, 40);
  if (!['deposit', 'withdraw'].includes(b.kind)) throw bad('Choose deposit or withdrawal');
  await needCurrency(b.currency);
  if (!Array.isArray(b.rows) || b.rows.length > 100) throw bad('Invalid price list');
  const rows = b.rows.map((r, i) => {
    const line = `Line ${i + 1}: `;
    const min = toMinor(r.from || 0, line + '“From”', true);
    const max = r.to === '' || r.to == null ? null : toMinor(r.to, line + '“To”');
    if (max != null && max < min) throw bad(line + '“To” must be bigger than “From”');
    const value = Number(r.value), percent = r.type === 'percent';
    if (r.value === '' || r.value == null || !Number.isFinite(value) || value < 0) throw bad(line + 'enter the price');
    if (percent && value > 100) throw bad(line + 'percent cannot be more than 100');
    return { min, max, fee: percent ? 0 : Math.round(value * 100), percent: percent ? value : 0 };
  }).sort((x, y) => x.min - y.min);
  rows.forEach((r, i) => {
    if (i > 0 && (rows[i - 1].max == null || r.min <= rows[i - 1].max)) throw bad(`Two ranges overlap around ${r.min / 100}. Each amount must fall in one range only.`);
  });
  await tx(async (db) => {
    await db.q('delete from transfer_fees where kind=$1 and provider=$2 and currency=$3', [b.kind, provider, b.currency]);
    for (const r of rows) {
      await db.q('insert into transfer_fees(kind, provider, currency, min_amount, max_amount, fee, percent) values($1,$2,$3,$4,$5,$6,$7)',
        [b.kind, provider, b.currency, r.min, r.max, r.fee, r.percent]);
    }
  });
  ok(res);
});

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
  if (isConnectionError(err) && !err.status) {
    console.error('Cannot reach the database:', err.message);
    return res.status(503).json({ error: 'Cannot reach the database. Check the internet connection and try again.' });
  }
  const status = err.status || err.statusCode;
  if (!status || status >= 500) console.error(err);
  res.status(status && status < 500 ? status : 500).json({ error: status && status < 500 ? err.message : 'Something went wrong on the server' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`ETS AMANI API → http://localhost:${port}`));
