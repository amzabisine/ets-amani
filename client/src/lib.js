// Small helpers shared by every screen.
import { createContext, useContext, useEffect, useState } from 'react';

export const AppContext = createContext(null);
/** { S, refresh, run, toast, isOwner } — S is everything the server knows. */
export const useApp = () => useContext(AppContext);

export async function api(method, url, body) {
  const r = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/login') window.dispatchEvent(new Event('signed-out'));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const fetchTxns = (params) => api('GET', '/txns?' + new URLSearchParams(params));

/** Loads operations for a page and reloads them whenever data changes. */
export function useTxns(params) {
  const { S } = useApp();
  const [rows, setRows] = useState(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    let alive = true;
    fetchTxns(JSON.parse(key)).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [key, S]);
  return rows;
}

export const localDay = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/* ---------- formatting ---------- */
export const n2 = (minor, cur) =>
  (minor / 100).toLocaleString('en-US', { minimumFractionDigits: cur === 'CDF' ? 0 : 2, maximumFractionDigits: 2 });
export const dfmt = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
export const accName = (a) => (a ? `${a.provider}${a.label ? ' ' + a.label : ''}` : '—');
export const accFull = (a) => (a ? `${accName(a)} · ${a.currency}` : '—');

/* ---------- reading the state ---------- */
export const acc = (S, id) => S.accounts.find((a) => a.id === Number(id));
export const live = (S) => S.accounts.filter((a) => !a.archived);
export const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
export const total = (S, kind, cur) =>
  sum(S.accounts.filter((a) => (!kind || a.kind === kind) && a.currency === cur), (a) => a.balance);

/** Per currency: what people owe me (mine) and what I owe (theirs). */
export function debtTotals(S) {
  const o = {};
  for (const c of S.currencies) o[c] = { mine: 0, theirs: 0 };
  for (const cu of S.customers) {
    for (const [c, b] of Object.entries(cu.balances)) {
      if (b > 0) o[c].mine += b; else o[c].theirs -= b;
    }
  }
  return o;
}

export const TYPES = {
  capital_in: ['Capital added', 'b'], capital_out: ['Capital withdrawn', 'y'], transfer: ['Transfer', 'g'],
  move: ['Internal move', ''], exchange: ['Exchange', 'p'], loan_given: ['Money lent', 'r'],
  loan_repaid: ['Repayment received', 'g'], borrowed: ['Money borrowed', 'y'], borrow_repaid: ['Debt paid back', 'b'],
  rent_payment: ['Rent received', 'g'], expense: ['Expense', 'r'], income: ['Income', 'g'],
};
export const PL_LINES = {
  transfer: 'Transfer commissions', exchange: 'Exchange margin', rent_payment: 'Rent income',
  income: 'Other income', expense: 'Expenses', move: 'Fees on internal moves',
};

/** One-line description of an operation. */
export function describe(S, t) {
  const from = acc(S, t.entries.find((e) => e.amount < 0)?.account_id);
  const to = acc(S, t.entries.find((e) => e.amount > 0)?.account_id);
  switch (t.type) {
    case 'capital_in': return `Into ${accName(to)}`;
    case 'capital_out': return `From ${accName(from)}`;
    case 'transfer': return `${accName(from)} → ${accName(to)}${t.pnl ? ` · commission ${n2(t.pnl, t.currency)}` : ''}`;
    case 'move': return `${accName(from)} → ${accName(to)}${t.pnl ? ` · fee ${n2(-t.pnl, t.currency)}` : ''}`;
    case 'exchange': return `${accName(from)} ${t.currency} → ${accName(to)} ${t.to_currency} · rate ${t.rate}`;
    case 'loan_given': case 'borrow_repaid': return `Paid from ${accName(from)}`;
    case 'loan_repaid': case 'borrowed': return `Received in ${accName(to)}`;
    case 'rent_payment': {
      const r = S.rentals.find((x) => x.id === t.rental_id);
      return `${r ? r.property : 'Rent'} · ${t.period} · in ${accName(to)}`;
    }
    case 'expense': return `${t.category} · from ${accName(from)}`;
    case 'income': return `${t.category} · in ${accName(to)}`;
    default: return '';
  }
}
