import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TYPES, describe, dfmt, n2, useApp } from './lib.js';

export const Money = ({ v, cur }) => <span className="num">{n2(v, cur)}<span className="cur">{cur}</span></span>;
export const Signed = ({ v, cur }) => (
  <span className={`num ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}`}>{v > 0 ? '+' : ''}{n2(v, cur)}<span className="cur">{cur}</span></span>
);
export const Dash = () => <span className="muted">—</span>;

/** A button that starts an operation (opens its form or runs its action). */
export function Op({ name, args, cls = '', children }) {
  const { run } = useApp();
  return <button className={`btn ${cls}`} onClick={(e) => { e.stopPropagation(); run(name, args); }}>{children}</button>;
}

export function Head({ title, sub, children }) {
  const { isOwner } = useApp();
  return (
    <>
      <div className="top">
        <div><h1>{title}</h1><p>{sub}</p></div>
        <div className="actions owner-only">{children}</div>
      </div>
      {!isOwner && <div className="ro">👁 View-only access — you can see everything but cannot change anything.</div>}
    </>
  );
}

export const Card = ({ title, right, children }) => (
  <div className="card">
    {title && <div className="hd"><h3>{title}</h3>{right}</div>}
    <div style={{ paddingTop: title ? 10 : 0 }}>{children}</div>
  </div>
);

export function Stat({ label, usd, cdf, hero, color, signed, sub }) {
  const V = signed ? Signed : Money;
  return (
    <div className={`card stat ${hero ? 'hero' : ''}`}>
      <div className="lbl"><i className="dot" style={color ? { background: color } : undefined} />{label}</div>
      <div className="big"><V v={usd} cur="USD" /></div>
      <div className="second"><V v={cdf} cur="CDF" /></div>
      {sub && <div className="sub" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export const Empty = ({ children }) => <div className="empty">{children}</div>;

/** The list of operations. With `balance` it becomes an account statement. */
export function TxnTable({ rows, empty = 'Nothing recorded yet.', balance, compact }) {
  const { S } = useApp();
  if (!rows) return <Empty>Loading…</Empty>;
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Date</th><th>Operation</th><th>Details</th>{!compact && <th>Customer</th>}<th className="r">Amount</th>
            {balance ? <><th className="r">In / Out</th><th className="r">Balance</th></> : <th className="r">Profit / Loss</th>}
            {!compact && <th className="owner-only" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const [label, cls] = TYPES[t.type] || [t.type, ''];
            return (
              <tr key={t.id}>
                <td className="num">{dfmt(t.date)}</td>
                <td><span className={`badge ${cls}`}>{label}</span></td>
                <td>{describe(S, t)}{compact && t.customer_id && <div className="sub">{t.customer_name}</div>}{t.note && <div className="sub">{t.note}</div>}</td>
                {!compact && <td>{t.customer_id ? <Link to={`/customers/${t.customer_id}`}>{t.customer_name}</Link> : <Dash />}</td>}
                <td className="r">
                  <Money v={t.amount} cur={t.currency} />
                  {t.type === 'exchange' && <div className="sub">→ {n2(t.to_amount, t.to_currency)} {t.to_currency}</div>}
                </td>
                {balance
                  ? <><td className="r"><Signed v={t._delta} cur={balance} /></td><td className="r"><b><Money v={t._bal} cur={balance} /></b></td></>
                  : <td className="r">{t.pnl ? <Signed v={t.pnl} cur={t.pnl_currency} /> : <Dash />}</td>}
                {!compact && <td className="r owner-only"><Op name="delTxn" args={{ id: t.id }} cls="sm ghost danger">✕</Op></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- the form dialog ----------
   A form is described by a plain object (see forms.jsx):
   { title, intro, submit, done, fields: [...], info: (values) => JSX, onSubmit: (values) => Promise }
   A select field's `options` may be a function of the current values, so one
   choice can narrow the next (e.g. only accounts in the same currency).        */
const optionsOf = (f, v) => (typeof f.options === 'function' ? f.options(v) : f.options);

function normalise(fields, values) {
  const v = { ...values };
  for (const f of fields) {
    if (f.type !== 'select') continue;
    const list = optionsOf(f, v);
    if (!list.some((o) => String(o.value) === String(v[f.name]))) v[f.name] = list[0] ? String(list[0].value) : '';
  }
  return v;
}

export function FormModal({ config, onClose, onDone }) {
  const { fields } = config;
  const [values, setValues] = useState(() =>
    normalise(fields, Object.fromEntries(fields.map((f) => [f.name, f.type === 'check' ? !!f.value : String(f.value ?? '')]))));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const errRef = useRef(null);

  useEffect(() => { formRef.current?.querySelector('input:not([type=date]):not([type=checkbox]), select')?.focus(); }, []);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest' }); }, [error]);

  const set = (name, value) => setValues((old) => {
    const v = { ...old, [name]: value };
    for (const f of fields) if (f.resetOn === name) v[f.name] = '';
    return normalise(fields, v);
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await config.onSubmit(values); onDone(config.done || 'Saved'); }
    catch (ex) { setError(ex.message); setBusy(false); }
  };

  const info = config.info?.(values);
  return (
    <div className="modal open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <header>
          <div><h3>{config.title}</h3>{config.intro && <p>{config.intro}</p>}</div>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form ref={formRef} onSubmit={submit}>
          {fields.map((f) => {
            const id = 'f_' + f.name;
            if (f.type === 'check') {
              return (
                <div className="f" key={f.name}>
                  <label className="check"><input type="checkbox" checked={values[f.name]} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}</label>
                  {f.hint && <div className="hint">{f.hint}</div>}
                </div>
              );
            }
            const common = { id, required: f.required, value: values[f.name], onChange: (e) => set(f.name, e.target.value) };
            const numeric = f.type === 'money' || f.type === 'rate';
            return (
              <div className="f" key={f.name}>
                <label htmlFor={id}>{f.label}</label>
                {f.type === 'select'
                  ? <select {...common}>{optionsOf(f, values).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : <input {...common} type={numeric ? 'number' : f.type || 'text'} placeholder={f.placeholder || (numeric ? '0.00' : '')}
                      {...(numeric ? { inputMode: 'decimal', min: 0, step: 'any' } : {})}
                      autoComplete={f.type === 'password' ? 'new-password' : 'off'} />}
                {f.hint && <div className="hint">{f.hint}</div>}
              </div>
            );
          })}
          {info && <div className="info">{info}</div>}
          {error && <div className="err" ref={errRef}>{error}</div>}
          <footer>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy}>{config.submit || 'Save'}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
