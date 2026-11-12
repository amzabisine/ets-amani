import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Head, Money, Op, TxnTable } from '../components.jsx';
import { RENTAL_TYPES, dfmt, useApp, useTxns } from '../lib.js';

const Status = ({ r }) => {
  if (r.outstanding > 0) return <><span className="badge r">unpaid</span> <Money v={r.outstanding} cur={r.currency} /></>;
  if (r.outstanding < 0) return <><span className="badge b">in advance</span> <Money v={-r.outstanding} cur={r.currency} /></>;
  return <span className="badge g">up to date</span>;
};

/** The attributes of the rental's type, on one line: "Plate number: CGO 1234 · Colour: white". */
const details = (r) => (RENTAL_TYPES[r.type] || RENTAL_TYPES.other).fields
  .filter(([key]) => r.details[key]).map(([key, label]) => `${label.replace(/\s*\(.*\)|\?.*/, '')}: ${r.details[key]}`).join(' · ');

export default function Rentals() {
  const { S } = useApp();
  const rows = useTxns({ types: 'rent_payment' });
  const [filter, setFilter] = useState('');
  const used = Object.keys(RENTAL_TYPES).filter((t) => S.rentals.some((r) => r.type === t));
  const list = S.rentals.filter((r) => !filter || r.type === filter);
  const shownIds = new Set(list.map((r) => r.id));

  return (
    <>
      <Head title="Rentals" sub="Cars, apartments, shops and anything else you rent out, and what each tenant has paid">
        <Op name="rentPay" cls="primary">+ Receive rent</Op>
        <Op name="rental" args={{ type: filter || undefined }}>New rental</Op>
      </Head>

      {used.length > 1 && (
        <div className="tabs">
          <button className={`btn sm ${filter ? '' : 'dark'}`} onClick={() => setFilter('')}>All ({S.rentals.length})</button>
          {used.map((t) => (
            <button key={t} className={`btn sm ${filter === t ? 'dark' : ''}`} onClick={() => setFilter(t)}>
              {RENTAL_TYPES[t].plural} ({S.rentals.filter((r) => r.type === t).length})
            </button>
          ))}
        </div>
      )}

      <Card>
        {list.length ? (
          <div className="tw">
            <table className="t">
              <thead>
                <tr><th>Rental</th><th>Tenant</th><th className="r">Price</th><th>Period</th><th className="r">Paid so far</th><th className="r">Status</th><th className="owner-only" /></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="badge">{(RENTAL_TYPES[r.type] || RENTAL_TYPES.other).label}</span> <b>{r.property}</b>
                      {r.finished && <> <span className="badge y">ended</span></>}
                      {details(r) && <div className="sub">{details(r)}</div>}
                    </td>
                    <td><Link to={`/customers/${r.customer_id}`}>{r.customer_name}</Link></td>
                    <td className="r"><Money v={r.rate} cur={r.currency} /><span className="sub"> / {r.period_unit}</span></td>
                    <td className="num">{dfmt(r.start_date)}{r.end_date ? ` → ${dfmt(r.end_date)}` : ' →'}<div className="sub">{r.periods_due} {r.period_unit}{r.periods_due === 1 ? '' : 's'} counted</div></td>
                    <td className="r"><Money v={r.paid} cur={r.currency} /></td>
                    <td className="r"><Status r={r} /></td>
                    <td className="r owner-only">
                      <Op name="rentPay" args={{ id: r.id }} cls="sm">Receive</Op>{' '}
                      <Op name="rental" args={{ id: r.id }} cls="sm ghost">Edit</Op>{' '}
                      <Op name="rentalToggle" args={{ id: r.id }} cls="sm ghost">{r.active ? 'End' : 'Re-open'}</Op>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No rental yet. Add the first car, apartment or shop you rent out.</Empty>}
      </Card>
      <div className="section"><Card title="Rent payments"><TxnTable rows={rows?.filter((t) => shownIds.has(t.rental_id))} /></Card></div>
    </>
  );
}
