# ETS AMANI — business manager

Transfers (Airtel Money, M-Pesa Org/Float, Orange Money), exchange USD ⇄ CDF, debts, rentals, cash and bank — for one owner, with optional view-only users.

| Part | Technology | Folder |
|---|---|---|
| Backend API | Node.js + Express 5 | `server/` |
| Frontend | React 18 + Vite + React Router | `client/` |
| Database | Supabase (Postgres) | `supabase/migrations/` |

The plan and status of each phase is in [ROADMAP.md](ROADMAP.md).

## How it fits together

```
React (browser)  →  Express API  →  Supabase Postgres
   client/            server/         supabase/migrations/
```

- The browser only talks to the Express API. It never talks to Supabase directly.
- Express connects to Supabase with the database connection string (`pg`), so each operation runs in one real database transaction: everything is saved, or nothing is.
- Every table has row level security switched on with no policies, so Supabase's public API keys cannot read or write anything.

## Setup

1. Create a project on supabase.com.
2. Copy `.env.example` to `.env` and paste the connection string
   (Supabase → Project Settings → Database → Connection string → **Session pooler**).
3. Install, create the tables, build and start:

```bash
npm install
```

```bash
npm run migrate
```

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:3000. The first screen creates the owner account and the 12 standard accounts.

### While developing

Run these in two terminals, then open http://localhost:5173 (changes reload automatically):

```bash
npm run dev:server
```

```bash
npm run dev:client
```

## Rules the system enforces

- Money can never leave an account that does not hold it (cash or virtual).
- Every operation reduces one place and increases another; balances are never typed by hand after the opening amounts.
- A deleted record is reversed everywhere, and is refused if that money was already used.
- View-only users can see everything and change nothing (checked on the server).
- Amounts are stored as whole cents, so calculations are exact.

## Where things are

| File | What it does |
|---|---|
| `server/src/ledger.js` | The money rules: every operation, the balance check, the dashboard figures |
| `server/src/index.js` | The API routes |
| `server/src/auth.js` | Passwords, sessions, owner / view-only |
| `client/src/forms.jsx` | Every form (transfer, exchange, lend, rent…) |
| `client/src/pages/` | One file per screen |
| `supabase/migrations/` | The database tables |
