import { useNavigate } from 'react-router-dom';
import { Card, Dash, Empty, Head, Money, Op, Stat, TxnTable } from '../components.jsx';
import { debtTotals, useApp, useTxns } from '../lib.js';

const Balance = ({ b, cur }) => {
  if (!b) return <Dash />;
  return b > 0
    ? <><span className="badge y">owes me</span> <Money v={b} cur={cur} /></>
    : <><span className="badge r">I owe</span> <Money v={-b} cur={cur} /></>;
};

export default function Debts() {
  const { S } = useApp();
  const navigate = useNavigate();
  const rows = useTxns({ types: 'loan_given,loan_repaid,borrowed,borrow_repaid' });
  const d = debtTotals(S);
  const people = S.customers.filter((c) => Object.keys(c.balances).length);
  return (
    <>
      <Head title="Debts" sub="Everyone who has your money, and everyone whose money you have">
        <Op name="debt" args={{ type: 'loan_given' }} cls="primary">+ Lend money</Op>
        <Op name="debt" args={{ type: 'loan_repaid' }}>Receive repayment</Op>
        <Op name="debt" args={{ type: 'borrowed' }}>Borrow</Op>
        <Op name="debt" args={{ type: 'borrow_repaid' }}>Pay back</Op>
      </Head>
      <div className="grid g2">
        <Stat label="Total credited — they owe me" usd={d.USD.mine} cdf={d.CDF.mine} color="#b7791f" />
        <Stat label="Total debited — I owe" usd={d.USD.theirs} cdf={d.CDF.theirs} color="#c0392b" />
      </div>
      <div className="section">
        <Card title="Balance per person">
          {people.length ? (
            <div className="tw">
              <table className="t">
                <thead><tr><th>Person</th>{S.currencies.map((c) => <th className="r" key={c}>{c}</th>)}<th className="owner-only" /></tr></thead>
                <tbody>
                  {people.map((c) => (
                    <tr key={c.id} className="link" onClick={() => navigate(`/customers/${c.id}`)}>
                      <td><b>{c.name}</b><div className="sub">{c.phone}</div></td>
                      {S.currencies.map((cur) => <td className="r" key={cur}><Balance b={c.balances[cur]} cur={cur} /></td>)}
                      <td className="r owner-only">
                        <Op name="debt" cls="sm" args={{ type: Object.values(c.balances).some((b) => b > 0) ? 'loan_repaid' : 'borrow_repaid', customer: c.id }}>Repayment</Op>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Nobody owes you and you owe nobody.</Empty>}
        </Card>
      </div>
      <div className="section"><Card title="History"><TxnTable rows={rows} /></Card></div>
    </>
  );
}
