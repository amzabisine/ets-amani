import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Dash, Empty, Head, Money, Op, TxnTable } from '../components.jsx';
import { matchesCustomer, useApp, useTxns } from '../lib.js';

export function Customers() {
  const { S } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const list = S.customers.filter((c) => matchesCustomer(c, query));
  return (
    <>
      <Head title="Customers" sub={`${S.customers.length} people`}>
        <Op name="customer" cls="primary">+ New customer</Op>
      </Head>
      <div className="filters"><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone number…" style={{ width: 320, maxWidth: '100%' }} /></div>
      <Card>
        {list.length ? (
          <div className="tw">
            <table className="t">
              <thead><tr><th>Name</th><th>Phone</th><th>Note</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {list.map((c) => {
                  const balances = Object.entries(c.balances);
                  return (
                    <tr key={c.id} className="link" onClick={() => navigate(`/customers/${c.id}`)}>
                      <td><b>{c.name}</b></td>
                      <td>{c.phone || '—'}</td>
                      <td className="muted">{c.note}</td>
                      <td className="r">
                        {balances.length ? balances.map(([cur, b]) => <div key={cur}>{b > 0 ? 'owes me' : 'I owe'} <Money v={Math.abs(b)} cur={cur} /></div>) : <Dash />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>{S.customers.length ? 'No customer matches your search.' : 'No customers yet.'}</Empty>}
      </Card>
    </>
  );
}

export function Customer() {
  const { S } = useApp();
  const { id } = useParams();
  const c = S.customers.find((x) => x.id === Number(id));
  const rows = useTxns({ customer: id, limit: 2000 });
  if (!c) return <Empty>Customer not found. <Link to="/customers">Back to customers</Link></Empty>;
  return (
    <>
      <Head title={c.name} sub={<><Link to="/customers">← All customers</Link>{c.phone && ` · ${c.phone}`}{c.note && ` · ${c.note}`}</>}>
        <Op name="debt" args={{ type: 'loan_given', customer: c.id }} cls="primary">Lend</Op>
        <Op name="debt" args={{ type: 'loan_repaid', customer: c.id }}>Receive repayment</Op>
        <Op name="debt" args={{ type: 'borrowed', customer: c.id }}>Borrow</Op>
        <Op name="debt" args={{ type: 'borrow_repaid', customer: c.id }}>Pay back</Op>
        <Op name="customer" args={{ id: c.id }}>Edit</Op>
        <Op name="delCustomer" args={{ id: c.id }} cls="ghost danger">Delete</Op>
      </Head>
      <div className="grid g2">
        {S.currencies.map((cur) => {
          const b = c.balances[cur] || 0;
          return (
            <div className="card stat" key={cur}>
              <div className="lbl"><i className="dot" style={{ background: b > 0 ? '#b7791f' : b < 0 ? '#c0392b' : '#9aa' }} />{b > 0 ? 'Owes me' : b < 0 ? 'I owe' : 'Nothing pending'} · {cur}</div>
              <div className="big"><Money v={Math.abs(b)} cur={cur} /></div>
            </div>
          );
        })}
      </div>
      <div className="section"><Card title="History with this customer"><TxnTable rows={rows} /></Card></div>
    </>
  );
}
