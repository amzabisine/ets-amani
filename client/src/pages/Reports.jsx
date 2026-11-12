import { useEffect, useState } from 'react';
import { Card, Dash, Head, Signed, TxnTable } from '../components.jsx';
import { PL_LINES, TYPES, api, describe, sum, useApp, useTxns } from '../lib.js';

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

export default function Reports() {
  const { S } = useApp();
  const day = S.today.date;
  const [f, setF] = useState({ from: day.slice(0, 8) + '01', to: day, type: '' });
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

  return (
    <>
      <Head title="Reports" sub="Profit and loss, and the full record of operations" />
      <div className="filters">
        <label>From<input type="date" value={f.from} onChange={change('from')} /></label>
        <label>To<input type="date" value={f.to} onChange={change('to')} /></label>
        <label>Operation
          <select value={f.type} onChange={change('type')}>
            <option value="">All operations</option>
            {Object.entries(TYPES).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => setF({ ...f, from: day, to: day })}>Today</button>
        <button className="btn" onClick={() => rows && downloadCsv(S, rows, f)}>Download CSV</button>
        <button className="btn" onClick={() => window.print()}>Print</button>
      </div>
      <div className="grid">
        <Card title="Profit / loss">
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
        <Card title={`Operations (${rows ? rows.length : '…'})`}><TxnTable rows={rows} empty="No operations in this period." /></Card>
      </div>
    </>
  );
}
