import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { one, q } from './db.js';
import { bad, str } from './util.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 14;

const hash = async (password, salt) => (await scrypt(String(password || ''), salt, 64)).toString('hex');

export async function makeUser(db, username, password, role) {
  username = str(username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw bad('Username: 3–40 letters, numbers, dot, dash');
  if (String(password || '').length < 6) throw bad('Password must be at least 6 characters');
  if (await db.one('select 1 from users where username=$1', [username])) throw bad('That username already exists');
  const salt = crypto.randomBytes(16).toString('hex');
  await db.q('insert into users(username, pass_hash, salt, role) values($1,$2,$3,$4)', [username, await hash(password, salt), salt, role]);
}

export async function checkPassword(user, password) {
  const a = Buffer.from(await hash(password, user.salt), 'hex');
  const b = Buffer.from(user.pass_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function setPassword(userId, password) {
  if (String(password || '').length < 6) throw bad('New password must be at least 6 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  await q('update users set pass_hash=$1, salt=$2 where id=$3', [await hash(password, salt), salt, userId]);
}

const cookie = (req, token, maxAge) =>
  `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`;

export async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q('delete from sessions where expires < now()');
  await q(`insert into sessions(token, user_id, expires) values($1,$2, now() + interval '${SESSION_DAYS} days')`, [token, userId]);
  res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
}

export async function endSession(req, res) {
  await q('delete from sessions where token=$1', [req.user.token]);
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}

export async function sessionUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const u = await one('select u.id, u.username, u.role from sessions s join users u on u.id = s.user_id where s.token=$1 and s.expires > now()', [m[1]]);
  return u && { ...u, token: m[1] };
}

/** Middleware: must be signed in. */
export async function requireUser(req, res, next) {
  req.user = await sessionUser(req);
  if (!req.user) throw bad('Please sign in', 401);
  next();
}

/** Middleware: viewers can look, never touch. */
export function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') throw bad('View-only account: you cannot change anything', 403);
  next();
}

// Slow down password guessing: 10 attempts per 15 minutes per address.
const attempts = new Map();
export function throttle(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { n: 0, t: now };
  if (now - a.t > 15 * 60e3) { a.n = 0; a.t = now; }
  a.n++;
  attempts.set(ip, a);
  if (a.n > 10) throw bad('Too many attempts. Try again in 15 minutes.', 429);
}
export const clearThrottle = (ip) => attempts.delete(ip);
