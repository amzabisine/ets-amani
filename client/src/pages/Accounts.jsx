import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Empty, Head, Money, Op, TxnTable } from '../components.jsx';
import { acc, accName, sum, total, useApp, useTxns } from '../lib.js';

const KINDS = [['virtual', 'Virtual — mobile money'], ['cash', 'Cash'], ['bank', 'Bank']];

export function Accounts() {
  const { S } = useApp();
  const navigate = useNavigate();
  return (
    <>
      <Head title="Accounts" sub="Where the money is. Enter what you really have, then every operation keeps it up to date.">
        <Op name="capital" args={{ type: 'capital_in' }} cls="primary">+ Add money</Op>
        <Op name="capital" args={{ type: 'capital_out' }}>Take money out</Op>
        <Op name="move">Move between accounts</Op>
        <Op name="account">New account</Op>
      </Head>
      {KINDS.map(([kind, title]) => (
        <div className="section" key={kind}>
          <Card title={title}>
            <div className="tw">
              <table className="t">
                <thead><tr><th>Account</th><th>Currency</th><th className="r">Balance</th><th className="owner-only" /></tr></thead>
                <tbody>
                  {S.accounts.filter((a) => a.kind === kind && !a.archived).map((a) => (
                    <tr key={a.id} className="link" onClick={() => navigate(`/accounts/${a.id}`)}>
                      <td><b>{accName(a)}</b>{!a.on_dashboard && <> <span className="badge">not on dashboard</span></>}</td>
                      <td>{a.currency}</td>
                      <td className="r"><b><Money v={a.balance} cur={a.currency} /></b></td>
                      <td className="r owner-only">
                        <Op name="capital" args={{ type: 'capital_in', account: a.id }} cls="sm">Add</Op>{' '}
                        <Op name="account" args={{ id: a.id }} cls="sm ghost">Edit</Op>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="r">{S.currencies.map((c, i) => <span key={c}>{i > 0 && '  ·  '}<Money v={total(S, kind, c)} cur={c} /></span>)}</td>
                    <td className="owner-only" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      ))}
    </>
  );
}

/** Statement of one account, with the balance after each movement. */
export function Account() {
  const { S } = useApp();
  const { id } = useParams();
  const a = acc(S, id);
  const rows = useTxns({ account: id, limit: 2000 });
  if (!a) return <Empty>Account not found.</Empty>;

  let running = a.balance; // newest first: walk backwards from today's balance
  const statement = rows?.map((t) => {
    const delta = sum(t.entries.filter((e) => e.account_id === a.id), (e) => e.amount);
    const row = { ...t, _delta: delta, _bal: running };
    running -= delta;
    return row;
  });

  return (
    <>
      <Head title={<>{accName(a)} <span className="badge">{a.currency}</span></>} sub={<><Link to="/accounts">← All accounts</Link> · statement</>}>
        <Op name="capital" args={{ type: 'capital_in', account: a.id }} cls="primary">Add money</Op>
        <Op name="capital" args={{ type: 'capital_out', account: a.id }}>Take out</Op>
        <Op name="account" args={{ id: a.id }}>Edit</Op>
      </Head>
      <div className="grid g3">
        <div className="card stat hero"><div className="lbl"><i className="dot" />Current balance</div><div className="big"><Money v={a.balance} cur={a.currency} /></div></div>
      </div>
      <div className="section"><Card title="Movements"><TxnTable rows={statement} balance={a.currency} /></Card></div>
    </>
  );
}
