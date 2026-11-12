// Every operation the owner can do. FORMS open a dialog; ACTIONS run directly.
import { Signed } from './components.jsx';
import FeeList from './FeeList.jsx';
import { RENTAL_TYPES, SHOW_DEPOSIT_WITHDRAW, acc, accFull, accName, api, exchangeRate, fmtRate, live, n2, transferFee } from './lib.js';

const accOpts = (list) => list.map((a) => ({ value: a.id, label: `${accFull(a)}  —  ${n2(a.balance, a.currency)} available` }));
const curOpts = (S) => S.currencies.map((c) => ({ value: c, label: c }));
const fDate = (S) => ({ name: 'date', label: 'Date', type: 'date', value: S.today.date, required: true });
const fNote = { name: 'note', label: 'Note (optional)' };
const fCustomer = (S, id, required, label) => [
  {
    name: 'customer_id', label: label || (required ? 'Customer' : 'Customer (optional)'), type: 'select', value: id || '',
    options: [{ value: '', label: '— choose —' }, ...S.customers.map((c) => ({ value: c.id, label: c.name + (c.phone ? ' · ' + c.phone : '') }))],
  },
  { name: 'new_customer', label: '…or type a new customer name', placeholder: 'New customer' },
];
const post = (type) => (v) => api('POST', '/txns', { ...v, type });

const Avail = ({ a }) => (a ? <>Available in <b>{accFull(a)}</b>: <b>{n2(a.balance, a.currency)} {a.currency}</b></> : null);

export const FORMS = {
  transfer(S, { mode = 'other' } = {}) {
    const cashish = live(S).filter((a) => a.kind !== 'virtual'), virt = live(S).filter((a) => a.kind === 'virtual');
    const [title, intro, outList, inList] = {
      deposit: ['Customer deposit', 'The customer gives you cash, you send e-money. Virtual goes down, cash goes up.', virt, cashish],
      withdraw: ['Customer withdrawal', 'The customer sends you e-money, you give cash. Cash goes down, virtual goes up.', cashish, virt],
      other: [SHOW_DEPOSIT_WITHDRAW ? 'Other transfer' : 'Transfer', 'A customer transfer between two of your accounts in the same currency.', live(S), live(S)],
    }[mode];
    // The price list is per network: the virtual side of the transfer decides which one applies.
    const price = (v) => {
      const virtual = acc(S, mode === 'deposit' ? v.from_account_id : v.to_account_id);
      const amount = Math.round(Number(v.amount) * 100);
      return mode === 'other' || !virtual || !(amount > 0) ? null : transferFee(S, mode, virtual.provider, virtual.currency, amount);
    };
    return {
      title, intro, submit: 'Record transfer',
      fields: [fDate(S),
        { name: 'from_account_id', label: 'Money goes OUT of', type: 'select', options: accOpts(outList) },
        { name: 'to_account_id', label: 'Money comes IN to', type: 'select',
          options: (v) => { const f = acc(S, v.from_account_id); return accOpts(inList.filter((a) => f && a.currency === f.currency && a.id !== f.id)); } },
        { name: 'amount', label: 'Amount', type: 'money', required: true },
        { name: 'fee', label: 'Commission you earn', type: 'money',
          hint: mode === 'other' ? 'Added on top of the amount received. Counts as profit.' : 'Filled from your Rates page when the amount matches a price range. You can change it.',
          auto: (v) => { const fee = price(v); return fee == null ? '' : String(fee / 100); } },
        ...fCustomer(S), fNote],
      info(v) {
        const fee = price(v), f = acc(S, v.from_account_id);
        return <><Avail a={f} />{fee != null && <><br />Price from your rates: <b>{n2(fee, f.currency)} {f.currency}</b></>}</>;
      },
      onSubmit: (v) => api('POST', '/txns', { ...v, type: 'transfer', mode }),
    };
  },

  move(S) {
    return {
      title: 'Move money between my accounts', intro: 'For example cash → bank, or M-Pesa Float → Org. No profit, optional fee.', submit: 'Move money',
      fields: [fDate(S),
        { name: 'from_account_id', label: 'From', type: 'select', options: accOpts(live(S)) },
        { name: 'to_account_id', label: 'To', type: 'select',
          options: (v) => { const f = acc(S, v.from_account_id); return accOpts(live(S).filter((a) => f && a.currency === f.currency && a.id !== f.id)); } },
        { name: 'amount', label: 'Amount', type: 'money', required: true },
        { name: 'fee', label: 'Fee charged (optional)', type: 'money', hint: 'Taken from the “From” account. Counts as a loss.' }, fNote],
      info: (v) => <Avail a={acc(S, v.from_account_id)} />,
      onSubmit: post('move'),
    };
  },

  exchange(S) {
    const cash = live(S).find((a) => a.kind === 'cash');
    const pair = (v) => [acc(S, v.from_account_id), acc(S, v.to_account_id)];
    // The non-USD side decides which reference (cost) rate applies.
    const refCurrency = (v) => { const [f, t] = pair(v); return !f || !t ? null : f.currency === 'USD' ? t.currency : t.currency === 'USD' ? f.currency : null; };
    return {
      title: 'Currency exchange', intro: 'One currency goes down, the other goes up, according to the rate you type.', submit: 'Record exchange',
      fields: [fDate(S),
        { name: 'from_account_id', label: 'You GIVE from', type: 'select', value: cash?.id, options: accOpts(live(S)) },
        { name: 'to_account_id', label: 'You RECEIVE in', type: 'select', resetOn: 'from_account_id',
          options: (v) => {
            const f = acc(S, v.from_account_id); // same kind of account first (cash → cash)
            return accOpts(live(S).filter((a) => f && a.currency !== f.currency).sort((x, y) => (accName(y) === accName(f)) - (accName(x) === accName(f))));
          } },
        { name: 'amount', label: 'Amount you give', type: 'money', required: true },
        { name: 'rate', type: 'rate', required: true, placeholder: 'rate',
          label: (v) => { const [f, t] = pair(v); return f && t ? `Your rate (1 ${f.currency} = ? ${t.currency})` : 'Your rate'; },
          hint: 'Filled from your Rates page for this direction. You can change it.',
          auto: (v) => { const [f, t] = pair(v); return String((f && t && exchangeRate(S, f.currency, t.currency)) || ''); } },
        { name: 'ref_rate', type: 'rate',
          label: (v) => (refCurrency(v) ? `Reference rate (1 USD = ? ${refCurrency(v)})` : 'Reference rate'),
          hint: 'Your cost. Used only to calculate your profit on this exchange.',
          auto: (v) => String(S.settings.ref_rates[refCurrency(v)] || '') },
        ...fCustomer(S), fNote],
      info(v) {
        const [f, t] = pair(v);
        const amt = Math.round(Number(v.amount) * 100), rate = Number(v.rate), ref = Number(v.ref_rate);
        if (!f) return null;
        const ok = t && amt > 0 && rate > 0;
        const got = ok ? Math.round(amt * rate) : 0;
        const profit = f.currency === 'USD' ? got - Math.round(amt * ref) : Math.round(got * ref) - amt;
        return (
          <>
            <Avail a={f} />
            {ok && <><br />You give <b>{n2(amt, f.currency)} {f.currency}</b> and receive <b>{n2(got, t.currency)} {t.currency}</b></>}
            {ok && rate < 1 && <><br /><span className="muted">Same as 1 {t.currency} = {fmtRate(1 / rate)} {f.currency}</span></>}
            {ok && ref > 0 && refCurrency(v) && <><br />Profit on this exchange: <Signed v={profit} cur={refCurrency(v)} /></>}
          </>
        );
      },
      onSubmit: post('exchange'),
    };
  },

  debt(S, { type, customer }) {
    const [title, intro, accLabel] = {
      loan_given: ['Lend money to a customer', 'Money leaves your account. The customer now owes you.', 'Paid from'],
      loan_repaid: ['Customer pays you back', 'Money comes into your account. What the customer owes goes down.', 'Received in'],
      borrowed: ['Borrow money / keep someone’s money', 'Money comes into your account. You now owe this person.', 'Received in'],
      borrow_repaid: ['Pay back what you owe', 'Money leaves your account. What you owe goes down.', 'Paid from'],
    }[type];
    const outgoing = type === 'loan_given' || type === 'borrow_repaid';
    return {
      title, intro,
      fields: [fDate(S), ...fCustomer(S, customer, true),
        { name: 'account_id', label: accLabel, type: 'select', options: accOpts(live(S)) },
        { name: 'amount', label: 'Amount', type: 'money', required: true }, fNote],
      info(v) {
        const a = acc(S, v.account_id), cu = S.customers.find((x) => x.id === Number(v.customer_id));
        const b = cu && a ? cu.balances[a.currency] || 0 : 0;
        if (!a || (!outgoing && !cu)) return null;
        return (
          <>
            {outgoing && <Avail a={a} />}
            {outgoing && cu && <br />}
            {cu && <>{cu.name}: {b > 0 ? <>owes you <b>{n2(b, a.currency)} {a.currency}</b></> : b < 0 ? <>you owe <b>{n2(-b, a.currency)} {a.currency}</b></> : `nothing pending in ${a.currency}`}</>}
          </>
        );
      },
      onSubmit: post(type),
    };
  },

  capital(S, { type, account }) {
    const inn = type === 'capital_in';
    return {
      title: inn ? 'Add money (capital / opening balance)' : 'Take money out (owner withdrawal)',
      intro: inn ? 'Use this to enter the money you really have in cash, bank or a virtual account.' : 'Money you remove from the business for yourself.',
      fields: [fDate(S), { name: 'account_id', label: 'Account', type: 'select', value: account, options: accOpts(live(S)) },
        { name: 'amount', label: 'Amount', type: 'money', required: true }, fNote],
      info: (v) => <Avail a={acc(S, v.account_id)} />,
      onSubmit: post(type),
    };
  },

  pnl(S, { type }) {
    const inn = type === 'income';
    return {
      title: inn ? 'Record other income' : 'Record an expense',
      fields: [fDate(S),
        { name: 'category', label: 'Category', required: true, placeholder: inn ? 'e.g. Operator commission, Sale' : 'e.g. Salary, Transport, Shop rent' },
        { name: 'account_id', label: inn ? 'Received in' : 'Paid from', type: 'select', options: accOpts(live(S)) },
        { name: 'amount', label: 'Amount', type: 'money', required: true }, fNote],
      info: (v) => (inn ? null : <Avail a={acc(S, v.account_id)} />),
      onSubmit: post(type),
    };
  },

  rental(S, { id, type } = {}) {
    const r = id && S.rentals.find((x) => x.id === Number(id));
    const spec = (v) => RENTAL_TYPES[v.type] || RENTAL_TYPES.other;
    // One input per attribute of every type; only those of the chosen type are shown.
    const detailFields = Object.entries(RENTAL_TYPES).flatMap(([t, s]) => s.fields.map(([key, label]) => (
      { name: `d_${t}_${key}`, label, value: r?.type === t ? r.details[key] : '', show: (v) => v.type === t })));
    return {
      title: r ? 'Edit rental' : 'New rental', intro: 'A car, apartment, shop or anything else you rent out to someone.',
      fields: [
        { name: 'type', label: 'What do you rent out?', type: 'select', value: r?.type || type || 'apartment', options: Object.entries(RENTAL_TYPES).map(([value, s]) => ({ value, label: s.label })) },
        { name: 'property', label: 'Name', required: true, value: r?.property, placeholder: 'A short name to recognise it' },
        ...detailFields,
        ...(r ? [] : fCustomer(S, null, true, 'Tenant / renter')),
        { name: 'period_unit', label: 'Rent is charged', type: 'select', value: r?.period_unit, auto: r ? undefined : (v) => spec(v).unit,
          options: [{ value: 'day', label: 'Per day' }, { value: 'week', label: 'Per week' }, { value: 'month', label: 'Per month' }] },
        { name: 'rate', label: (v) => `Price per ${v.period_unit}`, type: 'money', required: true, value: r ? r.rate / 100 : '' },
        ...(r ? [] : [{ name: 'currency', label: 'Currency', type: 'select', options: curOpts(S) }]),
        { name: 'start_date', label: 'Start date', type: 'date', value: r?.start_date || S.today.date, required: true },
        { name: 'end_date', label: (v) => (v.type === 'car' ? 'Return date' : 'End date (optional)'), type: 'date', value: r?.end_date || '',
          hint: 'Rent stops counting after this date. Leave empty if there is no fixed end.' },
        { ...fNote, value: r?.note }],
      info(v) {
        const rate = Math.round(Number(v.rate) * 100);
        if (!(rate > 0) || !v.start_date || !v.end_date || v.end_date < v.start_date) return null;
        const days = Math.round((Date.parse(v.end_date) - Date.parse(v.start_date)) / 86400000) + 1;
        const [y1, m1] = v.start_date.split('-').map(Number), [y2, m2] = v.end_date.split('-').map(Number);
        const n = v.period_unit === 'day' ? days : v.period_unit === 'week' ? Math.ceil(days / 7) : (y2 - y1) * 12 + (m2 - m1) + 1;
        const cur = r ? r.currency : v.currency;
        return <>{n} {v.period_unit}{n > 1 ? 's' : ''} × {n2(rate, cur)} = <b>{n2(n * rate, cur)} {cur}</b> for the whole rental</>;
      },
      onSubmit(v) {
        const details = Object.fromEntries(spec(v).fields.map(([key]) => [key, v[`d_${v.type}_${key}`]]));
        return api(r ? 'PUT' : 'POST', '/rentals' + (r ? '/' + r.id : ''), { ...v, details });
      },
    };
  },

  rentPay(S, { id } = {}) {
    const list = S.rentals.filter((r) => !r.finished || r.outstanding > 0);
    if (!list.length) throw new Error('Add a rental first');
    const rental = (v) => S.rentals.find((x) => x.id === Number(v.rental_id));
    return {
      title: 'Receive rent',
      fields: [fDate(S),
        { name: 'rental_id', label: 'Rental', type: 'select', value: id, options: list.map((r) => ({ value: r.id, label: `${r.property} — ${r.customer_name}` })) },
        { name: 'period', label: 'Payment is for the month of', type: 'month', value: S.today.date.slice(0, 7), required: true, show: (v) => rental(v)?.period_unit === 'month' },
        { name: 'account_id', label: 'Received in', type: 'select', options: (v) => accOpts(live(S).filter((a) => a.currency === rental(v)?.currency)) },
        { name: 'amount', label: 'Amount', type: 'money', required: true,
          auto: (v) => { const r = rental(v); return r && r.outstanding > 0 ? String(r.outstanding / 100) : ''; } },
        fNote],
      info(v) {
        const r = rental(v);
        if (!r) return null;
        return (
          <>Rent: <b>{n2(r.rate, r.currency)} {r.currency}</b> per {r.period_unit} · {r.outstanding > 0
            ? <>still unpaid: <b className="neg">{n2(r.outstanding, r.currency)} {r.currency}</b></>
            : r.outstanding < 0 ? <>paid in advance: <b>{n2(-r.outstanding, r.currency)} {r.currency}</b></> : 'up to date'}</>
        );
      },
      onSubmit: post('rent_payment'),
    };
  },

  account(S, { id } = {}) {
    const a = id && acc(S, id);
    return {
      title: a ? 'Edit account' : 'New account',
      fields: [
        { name: 'provider', label: 'Name', required: true, value: a?.provider, placeholder: 'e.g. Africell Money, Equity Bank' },
        { name: 'label', label: 'Sub-account (optional)', value: a?.label, placeholder: 'e.g. Float, Org' },
        ...(a ? [] : [
          { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'virtual', label: 'Virtual (mobile money)' }, { value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }] },
          { name: 'currency', label: 'Currency', type: 'select', options: curOpts(S) }]),
        { name: 'on_dashboard', label: 'Show in the dashboard breakdown', type: 'check', value: a ? a.on_dashboard : false, hint: 'Totals always include every account.' },
        ...(a ? [{ name: 'archived', label: 'Close this account', type: 'check', value: a.archived, hint: 'Only possible when its balance is zero.' }] : [])],
      onSubmit: (v) => api(a ? 'PUT' : 'POST', '/accounts' + (a ? '/' + a.id : ''), v),
    };
  },

  customer(S, { id } = {}) {
    const c = id && S.customers.find((x) => x.id === Number(id));
    return {
      title: c ? 'Edit customer' : 'New customer',
      fields: [{ name: 'name', label: 'Name', required: true, value: c?.name }, { name: 'phone', label: 'Phone', value: c?.phone }, { name: 'note', label: 'Note', value: c?.note }],
      onSubmit: (v) => api(c ? 'PUT' : 'POST', '/customers' + (c ? '/' + c.id : ''), v),
    };
  },

  user() {
    return {
      title: 'New user',
      fields: [{ name: 'username', label: 'Username', required: true }, { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'role', label: 'Access', type: 'select', options: [{ value: 'viewer', label: 'View only — can see everything, change nothing' }, { value: 'owner', label: 'Owner — full access' }] }],
      onSubmit: (v) => api('POST', '/users', v),
    };
  },

  password() {
    return {
      title: 'Change my password', done: 'Password changed',
      fields: [{ name: 'current', label: 'Current password', type: 'password', required: true }, { name: 'password', label: 'New password', type: 'password', required: true }],
      onSubmit: (v) => api('POST', '/password', v),
    };
  },

  exRate(S, { from, to }) {
    return {
      title: `Rate when I give ${from} and receive ${to}`,
      intro: `How many ${to} I receive for 1 ${from}. Used to pre-fill the exchange form for this direction.`,
      fields: [{ name: 'rate', label: `1 ${from} = ? ${to}`, type: 'rate', value: exchangeRate(S, from, to) || '', required: true, placeholder: 'rate' }],
      info: (v) => (Number(v.rate) > 0 ? <>Same as 1 {to} = <b>{fmtRate(1 / Number(v.rate))} {from}</b></> : null),
      onSubmit: (v) => api('PUT', '/rates/exchange', { from_currency: from, to_currency: to, rate: v.rate }),
    };
  },

  /** Reference (cost) rate of one currency against USD. */
  rate(S, { currency }) {
    return {
      title: `Reference rate for ${currency}`, intro: 'Your cost rate. Exchange profit is measured against it.',
      fields: [{ name: 'ref_rate', label: `1 USD = ? ${currency}`, type: 'rate', value: S.settings.ref_rates[currency] || '', required: true, placeholder: 'rate' }],
      onSubmit: (v) => api('PUT', '/settings', { ...v, currency }),
    };
  },

  /** Price list editor: several ranges at once (its own dialog, see FeeList.jsx). */
  feeList(S, args = {}) {
    return { custom: FeeList, S, ...args };
  },

  /** A new mobile money network: one account per chosen currency. */
  network(S) {
    return {
      title: 'New network', intro: 'For example Africell Money or MTN. One account is created for each currency you tick.',
      fields: [
        { name: 'provider', label: 'Network name', required: true, placeholder: 'e.g. Africell Money' },
        { name: 'label', label: 'Sub-account (optional)', placeholder: 'e.g. Float, Org' },
        ...S.currencies.map((c) => ({ name: 'cur_' + c, label: `Account in ${c}`, type: 'check', value: true })),
        { name: 'on_dashboard', label: 'Show on the dashboard', type: 'check', value: true }],
      async onSubmit(v) {
        const chosen = S.currencies.filter((c) => v['cur_' + c]);
        if (!chosen.length) throw new Error('Tick at least one currency');
        for (const currency of chosen) await api('POST', '/accounts', { provider: v.provider, label: v.label, kind: 'virtual', currency, on_dashboard: v.on_dashboard });
      },
    };
  },

  currency() {
    return {
      title: 'New currency', intro: 'For example UGX for Uganda. After adding it, set its rates on the Rates page.',
      fields: [
        { name: 'code', label: 'Code (3 letters)', required: true, placeholder: 'e.g. UGX' },
        { name: 'name', label: 'Name (optional)', placeholder: 'e.g. Ugandan Shilling' },
        { name: 'with_accounts', label: 'Create Cash and Bank accounts in this currency', type: 'check', value: true }],
      onSubmit: (v) => api('POST', '/currencies', v),
    };
  },
};

/** Actions that only need a confirmation. Each returns a message to show, or nothing if cancelled. */
export const ACTIONS = {
  async delTxn(S, { id }) {
    if (!window.confirm('Delete this record? Balances will be corrected as if it never happened.')) return null;
    await api('DELETE', '/txns/' + id);
    return 'Record deleted';
  },
  async delCustomer(S, { id }) {
    if (!window.confirm('Delete this customer?')) return null;
    await api('DELETE', '/customers/' + id);
    return 'Customer deleted';
  },
  async delUser(S, { id }) {
    if (!window.confirm('Remove this user?')) return null;
    await api('DELETE', '/users/' + id);
    return 'User removed';
  },
  async rentalToggle(S, { id }) {
    const r = S.rentals.find((x) => x.id === Number(id));
    if (!window.confirm(r.active ? `End the rental “${r.property}” today? No more rent will be counted after today.` : `Re-open the rental “${r.property}”?`)) return null;
    await api('PUT', `/rentals/${id}/active`, { active: !r.active, today: S.today.date });
    return r.active ? 'Rental ended' : 'Rental re-opened';
  },
};
