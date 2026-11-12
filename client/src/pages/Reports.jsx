import { useEffect, useState } from 'react';
import { Card, Dash, Empty, Head, Money, Signed, TxnTable } from '../components.jsx';
import { PL_LINES, TYPES, accName, api, describe, dfmt, fmtRate, n2, sum, useApp, useTxns } from '../lib.js';

function downloadCsv(S, rows, f) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Operation', 'Details', 'Customer', 'Amount', 'Currency', 'Received', 'Received currency', 'Rate', 'Profit/Loss', 'P/L currency', 'Note']]
    .concat(rows.map((t) => [t.date, TYPES[t.type]?.[0] || t.type, describe(S, t), t.customer_name, t.amount / 100, t.currency,
      t.to_amount != null ? t.to_amount / 100 : '', t.to_currency, t.rate, t.pnl / 100, t.pnl_currency, t.note]));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }));
  a.download = `ets-amani_${f.from}_${f.to}.csv`;
  a.click();
}

const shift = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const KINDS = [['virtual', 'Networks'], ['cash', 'Cash'], ['bank', 'Bank']];
const Num = ({ v, cur }) => (v ? <span className="num">{n2(v, cur)}</span> : <Dash />);

/** Where the money was at the start, what came in, what went out, where it is at the end. */
function CashPosition({ rep }) {
  const { S } = useApp();
  const byId = new Map(rep.accounts.map((a) => [a.id, a]));
  const rows = S.accounts.map((a) => ({ ...a, ...byId.get(a.id) })).filter((a) => a.opening || a.money_in || a.money_out); // accounts with no money and no movement are left out
  const line = (key, label, a, bold) => (
    <tr key={key} className={bold ? 'total' : ''}>
      <td>{label}</td><td>{a.currency}</td>
      <td className="r"><Num v={a.opening} cur={a.currency} /></td>
      <td className="r pos"><Num v={a.money_in} cur={a.currency} /></td>
      <td className="r neg"><Num v={a.money_out} cur={a.currency} /></td>
      <td className="r"><b className="num">{n2(a.opening + a.money_in - a.money_out, a.currency)}</b></td>
    </tr>
  );
  const add = (list, currency) => ({ currency, opening: sum(list, (a) => a.opening), money_in: sum(list, (a) => a.money_in), money_out: sum(list, (a) => a.money_out) });
  return (
    <div className="tw">
      <table className="t">
        <thead><tr><th>Account</th><th>Currency</th><th className="r">Start</th><th className="r">Money in</th><th className="r">Money out</th><th className="r">End</th></tr></thead>
        {KINDS.map(([kind, title]) => {
          const list = rows.filter((a) => a.kind === kind);
          if (!list.length) return null;
          return (
            <tbody key={kind}>
              <tr className="group"><td colSpan={6}>{title}</td></tr>
              {list.map((a) => line(a.id, accName(a), a))}
            </tbody>
          );
        })}
        <tfoot>
          {S.currencies.map((c) => line(c, 'Total — all accounts', add(rows.filter((a) => a.currency === c), c), true))}
        </tfoot>
      </table>
    </div>
  );
}

export default function Reports() {
  const { S } = useApp();
  const day = S.today.date;
  const [f, setF] = useState({ from: day, to: day, type: '' });
  const [rep, setRep] = useState(null);
  const rows = useTxns({ from: f.from, to: f.to, limit: 5000, ...(f.type ? { types: f.type } : {}) });

  useEffect(() => {
    let alive = true;
    api('GET', `/report?from=${f.from}&to=${f.to}`).then((r) => alive && setRep(r)).catch(() => {});
    return () => { alive = false; };
  }, [f.from, f.to, S]);

  const pnl = rep?.pnl || [];
  const value = (type, cur) => pnl.find((p) => p.type === type && p.currency === cur)?.total || 0;
  const net = (cur) => sum(pnl.filter((p) => p.currency === cur), (p) => p.total);
  const change = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const range = (from, to) => () => setF({ ...f, from, to });
  const oneDay = f.from === f.to;
  const categories = (type) => {
    const list = (rep?.categories || []).filter((c) => c.type === type);
    if (!list.length) return <Empty>Nothing in this period.</Empty>;
    return (
      <table className="t">
        <tbody>
          {list.map((c) => <tr key={c.category + c.currency}><td>{c.category}<span className="sub"> · {c.n}×</span></td><td className="r"><Money v={c.total} cur={c.currency} /></td></tr>)}
        </tbody>
        <tfoot>{S.currencies.filter((cur) => list.some((c) => c.currency === cur)).map((cur) => (
          <tr key={cur}><td>Total {cur}</td><td className="r"><Money v={sum(list.filter((c) => c.currency === cur), (c) => c.total)} cur={cur} /></td></tr>))}
        </tfoot>
      </table>
    );
  };

  return (
    <>
      <Head title={oneDay ? `Daily report — ${dfmt(f.from)}` : 'Report'} sub={oneDay ? 'Everything recorded on this day, added up for you' : `From ${dfmt(f.from)} to ${dfmt(f.to)}`} />
      <div className="filters">
        <label>From<input type="date" value={f.from} onChange={change('from')} /></label>
        <label>To<input type="date" value={f.to} onChange={change('to')} /></label>
        <button className="btn" onClick={range(day, day)}>Today</button>
        <button className="btn" onClick={range(shift(day, -1), shift(day, -1))}>Yesterday</button>
        <button className="btn" onClick={range(shift(day, -6), day)}>Last 7 days</button>
        <button className="btn" onClick={range(day.slice(0, 8) + '01', day)}>This month</button>
        <button className="btn dark" onClick={() => window.print()}>Print</button>
      </div>

      {!rep ? <Card><Empty>Loading…</Empty></Card> : (
        <>
          <Card title="Cash position"><CashPosition rep={rep} /></Card>

          <div className="section grid g2">
            <Card title="Result (profit / loss)">
              <table className="t">
                <thead><tr><th>Source</th>{S.currencies.map((c) => <th className="r" key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(PL_LINES).map(([type, label]) => (
                    <tr key={type}>
                      <td>{label}</td>
                      {S.currencies.map((c) => <td className="r" key={c}>{value(type, c) ? <Signed v={value(type, c)} cur={c} /> : <Dash />}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Net result</td>{S.currencies.map((c) => <td className="r" key={c}><Signed v={net(c)} cur={c} /></td>)}</tr></tfoot>
              </table>
            </Card>
            <div className="grid" style={{ alignContent: 'start' }}>
              <Card title="Expenses by category">{categories('expense')}</Card>
              <Card title="Other income by category">{categories('income')}</Card>
            </div>
          </div>

          <div className="section">
            <Card title="Forex bureau">
              {rep.exchange.length ? (
                <div className="tw">
                  <table className="t">
                    <thead><tr><th>Direction</th><th className="r">Operations</th><th className="r">Given</th><th className="r">Received</th><th className="r">Average rate</th><th className="r">Profit</th></tr></thead>
                    <tbody>
                      {rep.exchange.map((x) => (
                        <tr key={x.currency + x.to_currency}>
                          <td><b>{x.currency} → {x.to_currency}</b></td>
                          <td className="r num">{x.n}</td>
                          <td className="r"><Money v={x.given} cur={x.currency} /></td>
                          <td className="r"><Money v={x.received} cur={x.to_currency} /></td>
                          <td className="r num">1 {x.currency} = {fmtRate(x.received / x.given)} {x.to_currency}</td>
                          <td className="r">{x.pnl_currency ? <Signed v={x.pnl} cur={x.pnl_currency} /> : <Dash />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>No exchange in this period.</Empty>}
            </Card>
          </div>
        </>
      )}

      <div className="section">
        <Card title={`All operations (${rows ? rows.length : '…'})`} right={(
          <span className="filters" style={{ margin: 0 }}>
            <select value={f.type} onChange={change('type')}>
              <option value="">All operations</option>
              {Object.entries(TYPES).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <button className="btn sm" onClick={() => rows && downloadCsv(S, rows, f)}>Download CSV</button>
          </span>
        )}>
          <TxnTable rows={rows} empty="No operations in this period." />
        </Card>
      </div>
    </>
  );
}
