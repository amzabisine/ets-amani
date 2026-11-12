// Price list editor: all the ranges of one operation + network + currency, edited together.
import { useState } from 'react';
import { api, live } from './lib.js';

const blank = (from = '') => ({ from, to: '', value: '', type: 'fixed' });

export default function FeeList({ config, onClose, onDone }) {
  const { S } = config;
  const networks = [...new Set([...live(S).filter((a) => a.kind === 'virtual').map((a) => a.provider), ...S.rates.fees.map((f) => f.provider).filter(Boolean)])];

  // The saved ranges of a list, ready to edit — or three empty lines to start a new one.
  const load = (sel) => {
    const saved = S.rates.fees
      .filter((f) => f.kind === sel.kind && f.provider === sel.provider && f.currency === sel.currency)
      .map((f) => ({ from: String(f.min_amount / 100), to: f.max_amount == null ? '' : String(f.max_amount / 100), value: String(f.percent || f.fee / 100), type: f.percent ? 'percent' : 'fixed' }));
    return saved.length ? saved : [blank('0'), blank(), blank()];
  };

  const [sel, setSel] = useState({ kind: config.kind || 'withdraw', provider: config.provider || '', currency: config.currency || S.currencies[0] });
  const [rows, setRows] = useState(() => load(sel));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = (key) => (e) => { const next = { ...sel, [key]: e.target.value }; setSel(next); setRows(load(next)); };
  const edit = (i, key) => (e) => {
    const value = e.target.value;
    setRows((old) => {
      const next = old.map((r, j) => (j === i ? { ...r, [key]: value } : r));
      // Typing a "To" starts the next line just above it, so ranges never overlap or leave a gap.
      if (key === 'to' && next[i + 1] && value !== '' && Number.isFinite(Number(value))) {
        next[i + 1] = { ...next[i + 1], from: String(Number(value) + (sel.currency === 'USD' ? 0.01 : 1)) };
      }
      return next;
    });
  };
  const addRow = () => setRows((old) => {
    const last = old[old.length - 1];
    const from = last && last.to !== '' ? String(Number(last.to) + (sel.currency === 'USD' ? 0.01 : 1)) : '';
    return [...old, blank(from)];
  });
  const removeRow = (i) => setRows((old) => old.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      // Lines without a price are ignored, so spare empty lines do no harm.
      await api('PUT', '/rates/fees', { ...sel, rows: rows.filter((r) => r.value !== '') });
      onDone('Price list saved');
    } catch (ex) { setError(ex.message); setBusy(false); }
  };

  const num = { type: 'number', inputMode: 'decimal', min: 0, step: 'any' };
  return (
    <div className="modal open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide">
        <header>
          <div><h3>Price list</h3><p>All the ranges for one operation, network and currency. Saving replaces that whole list.</p></div>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form onSubmit={submit}>
          <div className="row3">
            <div className="f"><label>Operation</label>
              <select value={sel.kind} onChange={choose('kind')}><option value="withdraw">Withdrawal</option><option value="deposit">Deposit</option></select></div>
            <div className="f"><label>Network</label>
              <select value={sel.provider} onChange={choose('provider')}><option value="">All networks</option>{networks.map((n) => <option key={n}>{n}</option>)}</select></div>
            <div className="f"><label>Currency</label>
              <select value={sel.currency} onChange={choose('currency')}>{S.currencies.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>

          <div className="ranges">
            <div className="range head"><span>From</span><span>To</span><span>Price</span><span>Price is</span><span /></div>
            {rows.map((r, i) => (
              <div className="range" key={i}>
                <input {...num} value={r.from} onChange={edit(i, 'from')} placeholder="0" aria-label="From" />
                <input {...num} value={r.to} onChange={edit(i, 'to')} placeholder="and above" aria-label="To" />
                <input {...num} value={r.value} onChange={edit(i, 'value')} placeholder="price" aria-label="Price" />
                <select value={r.type} onChange={edit(i, 'type')} aria-label="Price is"><option value="fixed">{sel.currency}</option><option value="percent">%</option></select>
                <button type="button" className="btn sm ghost danger" onClick={() => removeRow(i)} aria-label="Remove line">✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn sm" onClick={addRow}>+ Add another range</button>
          <div className="hint" style={{ margin: '10px 0 14px' }}>Leave “To” empty on the last line for “and above”. Lines without a price are ignored.</div>

          {error && <div className="err">{error}</div>}
          <footer>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy}>Save price list</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
