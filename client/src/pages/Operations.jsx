// Three simple screens: a few buttons and the list of matching operations.
import { Link } from 'react-router-dom';
import { Card, Head, Op, TxnTable } from '../components.jsx';
import { SHOW_DEPOSIT_WITHDRAW, fmtRate, useApp, useTxns } from '../lib.js';

export function Transfers() {
  const rows = useTxns({ types: 'transfer,move' });
  return (
    <>
      <Head title="Transfers" sub="Mobile money transfers — Airtel Money, M-Pesa, Orange Money">
        {SHOW_DEPOSIT_WITHDRAW ? (
          <>
            <Op name="transfer" args={{ mode: 'deposit' }} cls="primary">+ Deposit</Op>
            <Op name="transfer" args={{ mode: 'withdraw' }} cls="dark">+ Withdrawal</Op>
            <Op name="transfer" args={{ mode: 'other' }}>Other transfer</Op>
          </>
        ) : <Op name="transfer" args={{ mode: 'other' }} cls="primary">+ Transfer</Op>}
        <Op name="move">Move between my accounts</Op>
        {SHOW_DEPOSIT_WITHDRAW && <Link className="btn" to="/rates">Prices</Link>}
      </Head>
      <Card><TxnTable rows={rows} empty="No transfers yet." /></Card>
    </>
  );
}

export function Exchange() {
  const { S } = useApp();
  const rows = useTxns({ types: 'exchange' });
  const rates = S.rates.exchange.map((r) => `1 ${r.from_currency} = ${fmtRate(r.rate)} ${r.to_currency}`).join('  ·  ');
  return (
    <>
      <Head title="Exchange" sub={rates || 'No rates set yet — add them on the Rates page'}>
        <Op name="exchange" cls="primary">+ New exchange</Op>
        <Link className="btn" to="/rates">Rates</Link>
      </Head>
      <Card><TxnTable rows={rows} empty="No exchange recorded yet." /></Card>
    </>
  );
}

export function Money() {
  const rows = useTxns({ types: 'expense,income' });
  return (
    <>
      <Head title="Income & expenses" sub="Everything else that makes you gain or lose money">
        <Op name="pnl" args={{ type: 'expense' }} cls="primary">+ Expense</Op>
        <Op name="pnl" args={{ type: 'income' }}>+ Other income</Op>
      </Head>
      <Card><TxnTable rows={rows} empty="No income or expense recorded yet." /></Card>
    </>
  );
}
