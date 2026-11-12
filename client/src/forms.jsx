// Every operation the owner can do. FORMS open a dialog; ACTIONS run directly.
import { Signed } from './components.jsx';
import { acc, accFull, accName, api, exchangeRate, live, n2, transferFee } from './lib.js';

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
      other: ['Other transfer', 'Any customer transfer between two of your accounts in the same currency.', live(S), live(S)],
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
        { name: 'rate', label: 'Your rate (1 USD = ? CDF)', type: 'rate', required: true, placeholder: 'e.g. 2850',
          hint: 'Filled from your Rates page for this direction. You can change it.',
          auto: (v) => { const f = acc(S, v.from_account_id), t = acc(S, v.to_account_id); return String((f && t && exchangeRate(S, f.currency, t.currency)) || ''); } },
        { name: 'ref_rate', label: 'Reference rate (your cost)', type: 'rate', value: S.settings.ref_rate || '',
          hint: 'Used only to calculate your profit on this exchange. Change the default in Settings.' },
        ...fCustomer(S), fNote],
      info(v) {
        const f = acc(S, v.from_account_id), t = acc(S, v.to_account_id);
        const amt = Math.round(Number(v.amount) * 100), rate = Number(v.rate), ref = Number(v.ref_rate);
        if (!f) return null;
        const ok = t && amt > 0 && rate > 0;
        const got = ok ? Math.round(t.currency === 'USD' ? amt / rate : amt * rate) : 0;
        const profit = f.currency === 'USD' ? got - Math.round(amt * ref) : Math.round(got * ref) - amt;
        return (
          <>
            <Avail a={f} />
            {ok && <><br />You give <b>{n2(amt, f.currency)} {f.currency}</b> and receive <b>{n2(got, t.currency)} {t.currency}</b></>}
            {ok && ref > 0 && <><br />Profit on this exchange: <Signed v={profit} cur={f.currency === 'USD' ? t.currency : f.currency} /></>}
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

  rental(S) {
    return {
      title: 'New rental', intro: 'A house, room or shop you rent out to someone.',
      fields: [{ name: 'property', label: 'Property', required: true, placeholder: 'e.g. Shop n°2 — Avenue du Lac' },
        ...fCustomer(S, null, true, 'Tenant'),
        { name: 'monthly', label: 'Rent per month', type: 'money', required: true },
        { name: 'currency', label: 'Currency', type: 'select', options: curOpts(S) },
        { name: 'start_month', label: 'First month of rent', type: 'month', value: S.today.date.slice(0, 7), required: true }, fNote],
      onSubmit: (v) => api('POST', '/rentals', v),
    };
  },

  rentPay(S, { id } = {}) {
    const list = S.rentals.filter((r) => r.active || r.outstanding > 0);
    if (!list.length) throw new Error('Add a rental first');
    const rental = (v) => S.rentals.find((x) => x.id === Number(v.rental_id));
    return {
      title: 'Receive rent',
      fields: [fDate(S),
        { name: 'rental_id', label: 'Rental', type: 'select', value: id, options: list.map((r) => ({ value: r.id, label: `${r.property} — ${r.customer_name}` })) },
        { name: 'period', label: 'Payment is for the month of', type: 'month', value: S.today.date.slice(0, 7), required: true },
        { name: 'account_id', label: 'Received in', type: 'select', options: (v) => accOpts(live(S).filter((a) => a.currency === rental(v)?.currency)) },
        { name: 'amount', label: 'Amount', type: 'money', required: true }, fNote],
      info(v) {
        const r = rental(v);
        if (!r) return null;
        return (
          <>Rent: <b>{n2(r.monthly, r.currency)} {r.currency}</b> per month · {r.outstanding > 0
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
    const other = from === 'USD' ? to : to === 'USD' ? from : null;
    return {
      title: `Rate when I give ${from} and receive ${to}`,
      intro: 'Used to pre-fill the exchange form for this direction.',
      fields: [{ name: 'rate', label: other ? `1 USD = ? ${other}` : `1 ${from} = ? ${to}`, type: 'rate', value: exchangeRate(S, from, to) || '', required: true }],
      onSubmit: (v) => api('PUT', '/rates/exchange', { from_currency: from, to_currency: to, rate: v.rate }),
    };
  },

  fee(S, { id, kind = 'withdraw' } = {}) {
    const f = id && S.rates.fees.find((x) => x.id === Number(id));
    const networks = [...new Set(live(S).filter((a) => a.kind === 'virtual').map((a) => a.provider))];
    if (f?.provider && !networks.includes(f.provider)) networks.push(f.provider);
    return {
      title: f ? 'Edit price range' : 'New price range',
      intro: 'The commission you charge when the amount falls in this range.',
      fields: [
        { name: 'kind', label: 'Operation', type: 'select', value: f?.kind || kind, options: [{ value: 'withdraw', label: 'Withdrawal' }, { value: 'deposit', label: 'Deposit' }] },
        { name: 'provider', label: 'Network', type: 'select', value: f?.provider || '', options: [{ value: '', label: 'All networks' }, ...networks.map((n) => ({ value: n, label: n }))] },
        { name: 'currency', label: 'Currency', type: 'select', value: f?.currency, options: curOpts(S) },
        { name: 'min_amount', label: 'From amount', type: 'money', value: f ? f.min_amount / 100 : '', placeholder: '0' },
        { name: 'max_amount', label: 'To amount', type: 'money', value: f?.max_amount != null ? f.max_amount / 100 : '', placeholder: 'no limit', hint: 'Leave empty for “and above”.' },
        { name: 'fee_type', label: 'Price is', type: 'select', value: f?.percent ? 'percent' : 'fixed', options: [{ value: 'fixed', label: 'A fixed amount' }, { value: 'percent', label: 'A percentage of the amount' }] },
        { name: 'value', label: 'Price', type: 'money', value: f ? (f.percent || f.fee / 100) : '', required: true }],
      info: (v) => (v.fee_type === 'percent' ? <>Price: <b>{v.value || 0} %</b> of the amount</> : <>Price: <b>{v.value || 0} {v.currency}</b> per operation</>),
      onSubmit: (v) => api(f ? 'PUT' : 'POST', '/rates/fees' + (f ? '/' + f.id : ''), v),
    };
  },

  rate(S) {
    return {
      title: 'Reference exchange rate', intro: 'Your cost rate. Exchange profit is measured against it.',
      fields: [{ name: 'ref_rate', label: '1 USD = ? CDF', type: 'rate', value: S.settings.ref_rate || '', required: true }],
      onSubmit: (v) => api('PUT', '/settings', v),
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
  async delFee(S, { id }) {
    if (!window.confirm('Delete this price range?')) return null;
    await api('DELETE', '/rates/fees/' + id);
    return 'Price range deleted';
  },
  async delUser(S, { id }) {
    if (!window.confirm('Remove this user?')) return null;
    await api('DELETE', '/users/' + id);
    return 'User removed';
  },
  async rentalToggle(S, { id }) {
    const r = S.rentals.find((x) => x.id === Number(id));
    if (!window.confirm(r.active ? `End the rental “${r.property}”? No new rent will be expected after this month.` : `Re-open the rental “${r.property}”?`)) return null;
    await api('PUT', '/rentals/' + id, { active: !r.active });
    return r.active ? 'Rental ended' : 'Rental re-opened';
  },
};
