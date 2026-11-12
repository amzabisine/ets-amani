import { Card, Head, Op } from '../components.jsx';
import { useApp } from '../lib.js';

export default function Settings() {
  const { S, isOwner } = useApp();
  return (
    <>
      <Head title="Settings" sub="Users and password" />
      <div className="grid g2">
        <Card title="My account">
          <div className="bd">
            Signed in as <b>{S.user.username}</b> · {isOwner ? 'Owner — full access' : 'View only'}
            <div style={{ marginTop: 12 }}><Op name="password">Change my password</Op></div>
          </div>
        </Card>
        {S.users && (
          <Card title="Users" right={<Op name="user" cls="sm">+ Add user</Op>}>
            <table className="t">
              <tbody>
                {S.users.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.username}</b></td>
                    <td><span className={`badge ${u.role === 'owner' ? 'g' : 'b'}`}>{u.role === 'owner' ? 'Owner' : 'View only'}</span></td>
                    <td className="r">{u.username === S.user.username ? <span className="muted">you</span> : <Op name="delUser" args={{ id: u.id }} cls="sm ghost danger">Remove</Op>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
