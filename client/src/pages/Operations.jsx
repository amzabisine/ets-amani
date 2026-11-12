// Three simple screens: a few buttons and the list of matching operations.
import { Card, Head, Op, TxnTable } from '../components.jsx';
import { useApp, useTxns } from '../lib.js';

export function Transfers() {
  const rows = useTxns({ types: 'transfer,move' });
  return (
    <>
      <Head title="Transfers" sub="Mobile money deposits and withdrawals — Airtel Money, M-Pesa, Orange Money">
        <Op name="transfer" args={{ mode: 'deposit' }} cls="primary">+ Deposit</Op>
        <Op name="transfer" args={{ mode: 'withdraw' }} cls="dark">+ Withdrawal</Op>
        <Op name="transfer" args={{ mode: 'other' }}>Other transfer</Op>
        <Op name="move">Move between my accounts</Op>
      </Head>
      <Card><TxnTable rows={rows} empty="No transfers yet. Record your first deposit or withdrawal." /></Card>
    </>
  );
}

export function Exchange() {
  const { S } = useApp();
  const rows = useTxns({ types: 'exchange' });
  const rate = S.settings.ref_rate ? `1 USD = ${S.settings.ref_rate} CDF` : 'not set yet';
  return (
    <>
      <Head title="Exchange" sub={`USD ⇄ CDF · reference rate: ${rate}`}>
        <Op name="exchange" cls="primary">+ New exchange</Op>
        <Op name="rate">Set reference rate</Op>
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
