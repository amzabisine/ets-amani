import { Link, useNavigate } from 'react-router-dom';
import { Card, Empty, Head, Money, Op, Stat, TxnTable } from '../components.jsx';
import { debtTotals, dfmt, live, n2, sum, total, useApp } from '../lib.js';

const providerColor = (p) => (/airtel/i.test(p) ? '#e4002b' : /pesa|voda/i.test(p) ? '#2f9e44' : /orange/i.test(p) ? '#ff7900' : '#11564b');

function People({ list, sign }) {
  const navigate = useNavigate();
  if (!list.length) return <Empty>Nobody.</Empty>;
  return (
    <table className="t">
      <tbody>
        {list.slice(0, 6).map((c) => (
          <tr key={c.id} className="link" onClick={() => navigate(`/customers/${c.id}`)}>
            <td><b>{c.name}</b><div className="sub">{c.phone}</div></td>
            <td className="r">
              {Object.entries(c.balances).filter(([, b]) => b * sign > 0).map(([cur, b]) => <div key={cur}><Money v={Math.abs(b)} cur={cur} /></div>)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Dashboard() {
  const { S } = useApp();
  const d = debtTotals(S);
  const profit = (c) => sum(S.today.pnl.filter((p) => p.currency === c), (p) => p.total);
  const rent = (c) => sum(S.rentals.filter((r) => r.currency === c && r.outstanding > 0), (r) => r.outstanding);

  // Virtual accounts grouped by network, then by sub-account (Org, Float…)
  const groups = {};
  for (const a of live(S).filter((x) => x.kind === 'virtual' && x.on_dashboard)) {
    ((groups[a.provider] ||= {})[a.label || ''] ||= {})[a.currency] = a;
  }
  const debtors = S.customers.filter((c) => Object.values(c.balances).some((b) => b > 0));
  const creditors = S.customers.filter((c) => Object.values(c.balances).some((b) => b < 0));

  return (
    <>
      <Head title="Dashboard" sub={`Situation on ${dfmt(S.today.date)}`}>
        <Op name="transfer" args={{ mode: 'deposit' }} cls="primary">+ Transfer</Op>
        <Op name="exchange">⇄ Exchange</Op>
        <Op name="debt" args={{ type: 'loan_given' }}>Lend</Op>
        <Op name="capital" args={{ type: 'capital_in' }}>Add money</Op>
      </Head>

      <div className="grid g4">
        <Stat label="Total virtual" usd={total(S, 'virtual', 'USD')} cdf={total(S, 'virtual', 'CDF')} hero />
        <Stat label="Total cash" usd={total(S, 'cash', 'USD')} cdf={total(S, 'cash', 'CDF')} />
        <Stat label="Total in bank" usd={total(S, 'bank', 'USD')} cdf={total(S, 'bank', 'CDF')} color="#2563a8" />
        <Stat label="All money in hand" usd={total(S, null, 'USD')} cdf={total(S, null, 'CDF')} color="#0d1f1c" sub="virtual + cash + bank" />
        <Stat label="Total credited" usd={d.USD.mine} cdf={d.CDF.mine} color="#b7791f" sub="people who have my money" />
        <Stat label="Total debited" usd={d.USD.theirs} cdf={d.CDF.theirs} color="#c0392b" sub="money I owe to others" />
        <Stat label="Today’s profit / loss" usd={profit('USD')} cdf={profit('CDF')} signed color="#0b7a55" />
        <Stat label="Unpaid rent" usd={rent('USD')} cdf={rent('CDF')} color="#59409a" sub="tenants behind on rent" />
      </div>

      <div className="section">
        <h2>Virtual accounts <span>money on each network</span></h2>
        <div className="grid g3">
          {Object.entries(groups).map(([provider, labels]) => (
            <div className="card prov" key={provider}>
              <div className="name"><span className="chip" style={{ background: providerColor(provider) }}>{provider[0]}</span>{provider}</div>
              <table>
                <tbody>
                  <tr><th />{S.currencies.map((c) => <th key={c}>{c}</th>)}</tr>
                  {Object.entries(labels).map(([label, by]) => (
                    <tr key={label}>
                      <td className="muted">{label || 'Balance'}</td>
                      {S.currencies.map((c) => (
                        <td className="num" key={c}>{by[c] ? <Link to={`/accounts/${by[c].id}`}>{n2(by[c].balance, c)}</Link> : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div className="section grid split">
        <Card title="Latest operations" right={<Link className="btn sm" to="/reports">See all</Link>}><TxnTable rows={S.recent} compact /></Card>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="They have my money" right={<Link className="btn sm" to="/debts">All</Link>}><People list={debtors} sign={1} /></Card>
          <Card title="I have their money"><People list={creditors} sign={-1} /></Card>
        </div>
      </div>
    </>
  );
}
