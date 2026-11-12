import { Card, Empty, Head, Money, Op } from '../components.jsx';
import { exchangeRate, n2, useApp } from '../lib.js';

const KINDS = [['withdraw', 'Withdrawal prices'], ['deposit', 'Deposit prices']];

function FeeTable({ kind }) {
  const { S } = useApp();
  const rows = S.rates.fees.filter((f) => f.kind === kind);
  if (!rows.length) return <Empty>No price range yet. The commission stays empty until you type it.</Empty>;
  return (
    <div className="tw">
      <table className="t">
        <thead><tr><th>Network</th><th>Currency</th><th className="r">From</th><th className="r">To</th><th className="r">Price</th><th className="owner-only" /></tr></thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td><b>{f.provider || 'All networks'}</b></td>
              <td>{f.currency}</td>
              <td className="r num">{n2(f.min_amount, f.currency)}</td>
              <td className="r num">{f.max_amount == null ? 'and above' : n2(f.max_amount, f.currency)}</td>
              <td className="r"><b>{f.percent ? <span className="num">{f.percent} %</span> : <Money v={f.fee} cur={f.currency} />}</b></td>
              <td className="r owner-only">
                <Op name="fee" args={{ id: f.id }} cls="sm">Edit</Op>{' '}
                <Op name="delFee" args={{ id: f.id }} cls="sm ghost danger">✕</Op>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Rates() {
  const { S } = useApp();
  const pairs = S.currencies.flatMap((from) => S.currencies.filter((to) => to !== from).map((to) => [from, to]));
  const unit = (from, to) => (from === 'USD' ? ['USD', to] : to === 'USD' ? ['USD', from] : [from, to]);
  return (
    <>
      <Head title="Rates" sub="Your price list. It fills the exchange and transfer forms for you; you can still change the figure on any operation." />

      <Card title="Exchange rates">
        <div className="tw">
          <table className="t">
            <thead><tr><th>Direction</th><th className="r">Rate</th><th className="owner-only" /></tr></thead>
            <tbody>
              {pairs.map(([from, to]) => {
                const rate = exchangeRate(S, from, to), [a, b] = unit(from, to);
                return (
                  <tr key={from + to}>
                    <td><b>I give {from} → I receive {to}</b><div className="sub">{from === 'USD' ? `selling ${from}` : to === 'USD' ? `buying ${to}` : ''}</div></td>
                    <td className="r">{rate ? <b className="num">1 {a} = {rate.toLocaleString('en-US')} {b}</b> : <span className="muted">not set</span>}</td>
                    <td className="r owner-only"><Op name="exRate" args={{ from, to }} cls="sm">{rate ? 'Change' : 'Set'}</Op></td>
                  </tr>
                );
              })}
              <tr>
                <td><b>Reference rate</b><div className="sub">your cost — exchange profit is measured against it</div></td>
                <td className="r">{S.settings.ref_rate ? <b className="num">1 USD = {S.settings.ref_rate.toLocaleString('en-US')} CDF</b> : <span className="muted">not set</span>}</td>
                <td className="r owner-only"><Op name="rate" cls="sm">{S.settings.ref_rate ? 'Change' : 'Set'}</Op></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {KINDS.map(([kind, title]) => (
        <div className="section" key={kind}>
          <Card title={title} right={<span className="owner-only"><Op name="fee" args={{ kind }} cls="sm">+ Add price range</Op></span>}>
            <FeeTable kind={kind} />
          </Card>
        </div>
      ))}
    </>
  );
}
