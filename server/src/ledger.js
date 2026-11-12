// The heart of the system: every operation moves money between accounts,
// and money can never leave an account that does not hold it.
import { q } from './db.js';
import { accName, bad, fmt, isDate, isMonth, periodsDue, str, toMinor, today } from './util.js';

const SEED = [
  ['Airtel Money', '', 'virtual'], ['M-Pesa', 'Org Account', 'virtual'], ['M-Pesa', 'Float Account', 'virtual'],
  ['Orange Money', '', 'virtual'], ['Cash', '', 'cash'], ['Bank', '', 'bank'],
];
/** The currency codes in use, USD first. */
export const currencyCodes = async (db = { q }) => (await db.q('select code from currencies order by position')).map((r) => r.code);

export async function seedAccounts(db) {
  const currencies = await currencyCodes(db);
  for (const [provider, label, kind] of SEED) {
    for (const currency of currencies) {
      await db.q('insert into accounts(provider, label, kind, currency) values($1,$2,$3,$4)', [provider, label, kind, currency]);
    }
  }
}

export const balanceOf = async (db, id) => (await db.one('select coalesce(sum(amount), 0) b from entries where account_id=$1', [id])).b;

async function account(db, id) {
  // "for update" makes two operations on the same account wait for each other,
  // so two people can never spend the same money at the same moment.
  const a = Number(id) ? await db.one('select * from accounts where id=$1 for update', [Number(id)]) : null;
  if (!a || a.archived) throw bad('Please choose an account');
  return a;
}

export async function customerId(db, b, required) {
  const name = str(b.new_customer, 80);
  if (name) return (await db.one('insert into customers(name) values($1) returning id', [name])).id;
  if (b.customer_id) {
    if (!(await db.one('select 1 from customers where id=$1', [Number(b.customer_id)]))) throw bad('Customer not found');
    return Number(b.customer_id);
  }
  if (required) throw bad('Please choose a customer or type a new name');
  return null;
}

/** Record one operation. `db` must be a transaction. */
export async function createTxn(db, b, user) {
  const type = str(b.type, 30);
  const t = {
    date: isDate(b.date) ? b.date : today(), type, currency: null, amount: 0, to_currency: null, to_amount: null,
    rate: null, ref_rate: null, customer_id: null, rental_id: null, period: null,
    category: str(b.category, 60), note: str(b.note, 300), debt_delta: 0, pnl: 0, pnl_currency: null,
  };
  const entries = [];
  const move = (acc, amt) => { if (amt !== 0) entries.push({ acc, amt }); };

  if (type === 'capital_in' || type === 'capital_out') {
    const a = await account(db, b.account_id), amt = toMinor(b.amount);
    t.currency = a.currency; t.amount = amt;
    move(a, type === 'capital_in' ? amt : -amt);

  } else if (type === 'transfer' || type === 'move') {
    const from = await account(db, b.from_account_id), to = await account(db, b.to_account_id);
    if (from.id === to.id) throw bad('Choose two different accounts');
    if (from.currency !== to.currency) throw bad('Both accounts must be in the same currency. Use Exchange to change currency.');
    const amt = toMinor(b.amount), fee = toMinor(b.fee || 0, type === 'transfer' ? 'Commission' : 'Fee', true);
    t.currency = from.currency; t.amount = amt; t.pnl_currency = from.currency;
    if (type === 'transfer') { // customer service: the commission is earned on top
      t.customer_id = await customerId(db, b, false);
      t.category = ['deposit', 'withdraw'].includes(b.mode) ? b.mode : '';
      move(from, -amt); move(to, amt + fee); t.pnl = fee;
    } else { // own money moved between own accounts: the fee is a cost
      move(from, -(amt + fee)); move(to, amt); t.pnl = -fee;
    }

  } else if (type === 'exchange') {
    const from = await account(db, b.from_account_id), to = await account(db, b.to_account_id);
    if (from.currency === to.currency) throw bad('Exchange needs two different currencies');
    const amt = toMinor(b.amount), rate = Number(b.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw bad('Enter the exchange rate');
    const usdOut = from.currency === 'USD', usdIn = to.currency === 'USD';
    const got = Math.round(amt * rate); // rate: 1 unit given = ? units received
    if (got <= 0) throw bad('Amount is too small for this rate');
    t.customer_id = await customerId(db, b, false);
    Object.assign(t, { currency: from.currency, amount: amt, to_currency: to.currency, to_amount: got, rate });
    const ref = Number(b.ref_rate);
    if (Number.isFinite(ref) && ref > 0 && (usdOut || usdIn)) {
      t.ref_rate = ref;
      t.pnl_currency = usdOut ? to.currency : from.currency;
      t.pnl = usdOut ? got - Math.round(amt * ref) : Math.round(got * ref) - amt;
    }
    move(from, -amt); move(to, got);

  } else if (['loan_given', 'loan_repaid', 'borrowed', 'borrow_repaid'].includes(type)) {
    const a = await account(db, b.account_id), amt = toMinor(b.amount);
    t.customer_id = await customerId(db, b, true);
    t.currency = a.currency; t.amount = amt;
    const out = type === 'loan_given' || type === 'borrow_repaid';
    move(a, out ? -amt : amt);
    t.debt_delta = out ? amt : -amt;

  } else if (type === 'rent_payment') {
    const r = Number(b.rental_id) ? await db.one('select * from rentals where id=$1', [Number(b.rental_id)]) : null;
    if (!r) throw bad('Please choose a rental');
    const a = await account(db, b.account_id), amt = toMinor(b.amount);
    if (a.currency !== r.currency) throw bad(`This rent is in ${r.currency}; choose a ${r.currency} account`);
    // Monthly rents are paid for a given month; daily and weekly ones are simply paid on a date.
    if (r.period_unit === 'month' && !isMonth(b.period)) throw bad('Choose the month this payment is for');
    b.period = r.period_unit === 'month' ? b.period : null;
    Object.assign(t, { currency: a.currency, amount: amt, rental_id: r.id, customer_id: r.customer_id, period: b.period, pnl: amt, pnl_currency: a.currency });
    move(a, amt);

  } else if (type === 'expense' || type === 'income') {
    const a = await account(db, b.account_id), amt = toMinor(b.amount);
    if (!t.category) throw bad('Enter a category (e.g. Salary, Transport, Airtime)');
    const sign = type === 'income' ? 1 : -1;
    Object.assign(t, { currency: a.currency, amount: amt, pnl: sign * amt, pnl_currency: a.currency });
    move(a, sign * amt);

  } else throw bad('Unknown operation');

  // The golden rule.
  for (const e of entries) {
    if (e.amt < 0) {
      const have = await balanceOf(db, e.acc.id);
      if (-e.amt > have) {
        throw bad(`Not enough money in ${accName(e.acc)}. Available: ${fmt(have)} ${e.acc.currency}, needed: ${fmt(-e.amt)} ${e.acc.currency}.`);
      }
    }
  }

  const { id } = await db.one(
    `insert into txns(date, type, currency, amount, to_currency, to_amount, rate, ref_rate, customer_id, rental_id, period, category, note, debt_delta, pnl, pnl_currency, user_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
    [t.date, t.type, t.currency, t.amount, t.to_currency, t.to_amount, t.rate, t.ref_rate, t.customer_id, t.rental_id, t.period, t.category, t.note, t.debt_delta, t.pnl, t.pnl_currency, user.id]);
  for (const e of entries) await db.q('insert into entries(txn_id, account_id, amount) values($1,$2,$3)', [id, e.acc.id, e.amt]);
  return { id };
}

/** Delete an operation and reverse its effect, unless that money was already used. */
export async function deleteTxn(db, id) {
  const ents = await db.q('select account_id from entries where txn_id=$1', [id]);
  for (const e of ents) await db.q('select 1 from accounts where id=$1 for update', [e.account_id]);
  const gone = await db.q('delete from txns where id=$1 returning id', [id]);
  if (!gone.length) throw bad('Record not found', 404);
  for (const e of ents) {
    if ((await balanceOf(db, e.account_id)) < 0) {
      const a = await db.one('select * from accounts where id=$1', [e.account_id]);
      throw bad(`Cannot delete: ${accName(a)} would go below zero, because that money was already used in later operations.`);
    }
  }
}

export async function listTxns(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace('?', '$' + args.length)); };
  if (isDate(p.from)) add('t.date >= ?', p.from);
  if (isDate(p.to)) add('t.date <= ?', p.to);
  if (p.types) add('t.type = any(?)', String(p.types).split(',').slice(0, 20));
  if (Number(p.customer)) add('t.customer_id = ?', Number(p.customer));
  if (Number(p.rental)) add('t.rental_id = ?', Number(p.rental));
  if (Number(p.account)) add('t.id in (select txn_id from entries where account_id = ?)', Number(p.account));
  const limit = Math.min(Math.max(Number(p.limit) || 300, 1), 5000);
  const rows = await q(
    `select t.*, c.name customer_name, u.username "user" from txns t
     left join customers c on c.id = t.customer_id left join users u on u.id = t.user_id
     ${where.length ? 'where ' + where.join(' and ') : ''} order by t.date desc, t.id desc limit ${limit}`, args);
  const byId = new Map(rows.map((r) => [r.id, Object.assign(r, { entries: [] })]));
  if (rows.length) {
    for (const e of await q('select txn_id, account_id, amount from entries where txn_id = any($1) order by id', [[...byId.keys()]])) {
      byId.get(e.txn_id).entries.push({ account_id: e.account_id, amount: e.amount });
    }
  }
  return rows;
}

/** Everything the screens need: balances, who owes whom, rent status, today's result. */
export async function getState(user, day) {
  const bal = new Map((await q('select account_id, sum(amount) b from entries group by account_id')).map((r) => [r.account_id, r.b]));
  const accounts = (await q('select * from accounts order by kind desc, id')).map((a) => ({ ...a, balance: bal.get(a.id) || 0 }));

  const customers = (await q('select * from customers order by lower(name)')).map((c) => ({ ...c, balances: {} }));
  const cById = new Map(customers.map((c) => [c.id, c]));
  for (const d of await q('select customer_id, currency, sum(debt_delta) d from txns where debt_delta <> 0 group by customer_id, currency')) {
    if (d.d !== 0 && cById.has(d.customer_id)) cById.get(d.customer_id).balances[d.currency] = d.d;
  }

  const paid = new Map((await q("select rental_id, sum(amount) s from txns where type='rent_payment' group by rental_id")).map((r) => [r.rental_id, r.s]));
  const rentals = (await q('select r.*, c.name customer_name from rentals r join customers c on c.id = r.customer_id order by r.active desc, lower(r.property)')).map((r) => {
    // Rent stops counting at the end date (planned return, or the day the rental was ended).
    const last = r.end_date && r.end_date < day ? r.end_date : day;
    const periods = periodsDue(r.period_unit, r.start_date, last), expected = periods * r.rate, p = paid.get(r.id) || 0;
    return { ...r, periods_due: periods, expected, paid: p, outstanding: expected - p, finished: !r.active || (!!r.end_date && r.end_date < day) };
  });

  const state = {
    user: { username: user.username, role: user.role }, currencies: await currencyCodes(), accounts, customers, rentals,
    // reference (cost) rates: { CDF: 2800 } means 1 USD = 2800 CDF
    settings: { ref_rates: Object.fromEntries((await q("select key, value from settings where key like 'ref_rate_%'")).map((r) => [r.key.slice(9), Number(r.value)])) },
    today: { date: day, pnl: await q('select type, pnl_currency currency, sum(pnl) total from txns where date=$1 and pnl <> 0 group by type, pnl_currency', [day]) },
    recent: await listTxns({ limit: 10 }),
    rates: {
      exchange: await q('select * from exchange_rates order by from_currency, to_currency'),
      fees: await q('select * from transfer_fees order by kind desc, provider, currency, min_amount'),
    },
  };
  if (user.role === 'owner') state.users = await q('select id, username, role, created_at from users order by id');
  return state;
}

export async function report(from, to) {
  return {
    from, to,
    pnl: await q('select type, pnl_currency currency, sum(pnl) total, count(*)::int n from txns where date between $1 and $2 and pnl <> 0 group by type, pnl_currency', [from, to]),
    volume: await q('select type, currency, sum(amount) total, count(*)::int n from txns where date between $1 and $2 group by type, currency', [from, to]),
  };
}
