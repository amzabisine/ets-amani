import { Card, Empty, Head, Money, Op } from '../components.jsx';
import { exchangeRate, fmtRate, n2, useApp } from '../lib.js';

const KINDS = [['withdraw', 'Withdrawal prices'], ['deposit', 'Deposit prices']];

/** The price lists of one operation, one block per network + currency. */
function FeeLists({ kind }) {
  const { S } = useApp();
  const lists = new Map();
  for (const f of S.rates.fees.filter((x) => x.kind === kind)) {
    const key = f.provider + '|' + f.currency;
    if (!lists.has(key)) lists.set(key, { provider: f.provider, currency: f.currency, rows: [] });
    lists.get(key).rows.push(f);
  }
  if (!lists.size) return <Empty>No price list yet. The commission stays empty until you type it.</Empty>;
  return (
    <div className="tw">
      <table className="t">
        <thead><tr><th>Network</th><th className="r">From</th><th className="r">To</th><th className="r">Price</th><th className="owner-only" /></tr></thead>
        <tbody>
          {[...lists.values()].map((l) => l.rows.map((f, i) => (
            <tr key={f.id}>
              <td>{i === 0 && <><b>{l.provider || 'All networks'}</b> <span className="badge">{l.currency}</span></>}</td>
              <td className="r num">{n2(f.min_amount, f.currency)}</td>
              <td className="r num">{f.max_amount == null ? 'and above' : n2(f.max_amount, f.currency)}</td>
              <td className="r"><b>{f.percent ? <span className="num">{f.percent} %</span> : <Money v={f.fee} cur={f.currency} />}</b></td>
              <td className="r owner-only">{i === 0 && <Op name="feeList" args={{ kind, provider: l.provider, currency: l.currency }} cls="sm">Edit list</Op>}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

export default function Rates() {
  const { S } = useApp();
  const pairs = S.currencies.flatMap((from) => S.currencies.filter((to) => to !== from).map((to) => [from, to]));
  const others = S.currencies.filter((c) => c !== 'USD');
  return (
    <>
      <Head title="Rates" sub="Your price list. It fills the exchange and transfer forms for you; you can still change the figure on any operation.">
        <Op name="currency">+ Add currency</Op>
        <Op name="network">+ Add network</Op>
      </Head>

      <Card title="Exchange rates">
        <div className="tw">
          <table className="t">
            <thead><tr><th>Direction</th><th className="r">Rate</th><th className="owner-only" /></tr></thead>
            <tbody>
              {pairs.map(([from, to]) => {
                const rate = exchangeRate(S, from, to);
                return (
                  <tr key={from + to}>
                    <td><b>I give {from} → I receive {to}</b></td>
                    <td className="r">
                      {rate ? <><b className="num">1 {from} = {fmtRate(rate)} {to}</b>{rate < 1 && <div className="sub">1 {to} = {fmtRate(1 / rate)} {from}</div>}</> : <span className="muted">not set</span>}
                    </td>
                    <td className="r owner-only"><Op name="exRate" args={{ from, to }} cls="sm">{rate ? 'Change' : 'Set'}</Op></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="section">
        <Card title="Reference rates">
          <div className="tw">
            <table className="t">
              <thead><tr><th>Currency</th><th className="r">Your cost</th><th className="owner-only" /></tr></thead>
              <tbody>
                {others.map((c) => {
                  const ref = S.settings.ref_rates[c];
                  return (
                    <tr key={c}>
                      <td><b>{c}</b><div className="sub">exchange profit is measured against this rate</div></td>
                      <td className="r">{ref ? <b className="num">1 USD = {fmtRate(ref)} {c}</b> : <span className="muted">not set</span>}</td>
                      <td className="r owner-only"><Op name="rate" args={{ currency: c }} cls="sm">{ref ? 'Change' : 'Set'}</Op></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {KINDS.map(([kind, title]) => (
        <div className="section" key={kind}>
          <Card title={title} right={<span className="owner-only"><Op name="feeList" args={{ kind }} cls="sm">+ Add price ranges</Op></span>}>
            <FeeLists kind={kind} />
          </Card>
        </div>
      ))}
    </>
  );
}
