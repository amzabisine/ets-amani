import { Link } from 'react-router-dom';
import { Card, Empty, Head, Money, Op, TxnTable } from '../components.jsx';
import { useApp, useTxns } from '../lib.js';

const Status = ({ r }) => {
  if (r.outstanding > 0) return <><span className="badge r">unpaid</span> <Money v={r.outstanding} cur={r.currency} /></>;
  if (r.outstanding < 0) return <><span className="badge b">in advance</span> <Money v={-r.outstanding} cur={r.currency} /></>;
  return <span className="badge g">up to date</span>;
};

export default function Rentals() {
  const { S } = useApp();
  const rows = useTxns({ types: 'rent_payment' });
  return (
    <>
      <Head title="Rentals" sub="Properties you rent out and what each tenant has paid">
        <Op name="rentPay" cls="primary">+ Receive rent</Op>
        <Op name="rental">New rental</Op>
      </Head>
      <Card>
        {S.rentals.length ? (
          <div className="tw">
            <table className="t">
              <thead>
                <tr><th>Property</th><th>Tenant</th><th className="r">Rent / month</th><th>Since</th><th className="r">Paid so far</th><th className="r">Status</th><th className="owner-only" /></tr>
              </thead>
              <tbody>
                {S.rentals.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.property}</b>{!r.active && <> <span className="badge">ended {r.end_month}</span></>}</td>
                    <td><Link to={`/customers/${r.customer_id}`}>{r.customer_name}</Link></td>
                    <td className="r"><Money v={r.monthly} cur={r.currency} /></td>
                    <td className="num">{r.start_month}</td>
                    <td className="r"><Money v={r.paid} cur={r.currency} /></td>
                    <td className="r"><Status r={r} /></td>
                    <td className="r owner-only">
                      <Op name="rentPay" args={{ id: r.id }} cls="sm">Receive</Op>{' '}
                      <Op name="rentalToggle" args={{ id: r.id }} cls="sm ghost">{r.active ? 'End' : 'Re-open'}</Op>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No rental yet. Add the first property you rent out.</Empty>}
      </Card>
      <div className="section"><Card title="Rent payments"><TxnTable rows={rows} /></Card></div>
    </>
  );
}
