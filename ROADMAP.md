# ETS AMANI — roadmap

Status: ✅ built and tested · 🔜 next · ⏳ later

## Phase 0 — Prototype ✅
Single-file prototype used to agree on the features and the look. Replaced by the stack below.

## Phase 1 — Foundation ✅
- Project structure: Express API, React app, Supabase migrations
- Database schema with exact money (whole cents) and locked-down tables
- First-start owner setup, sign in / sign out, password change
- Two roles: owner (full access) and view-only, enforced on the server
- App shell: sidebar, mobile menu, forms, messages

## Phase 2 — Money core ✅
- Accounts: Airtel Money, M-Pesa Org, M-Pesa Float, Orange Money, Cash, Bank — each in USD and CDF
- Add extra accounts, choose whether they show on the dashboard
- Opening balances / capital in and out
- The ledger and the golden rule: money cannot leave an account that does not hold it
- Account statement with balance after each movement
- Dashboard: total virtual (per network), cash, bank, credited, debited, today's profit/loss, unpaid rent

## Phase 3 — Transfers and exchange ✅
- Customer deposit and withdrawal with commission
- Moves between own accounts with optional fee
- Exchange USD ⇄ CDF at the typed rate, profit against a reference rate

## Phase 4 — Customers and debts ✅
- Customer list and per-customer history
- Lend, receive repayment, borrow, pay back
- "They have my money" / "I have their money" per person and in total

## Phase 5 — Rentals, income and expenses ✅
- Properties, tenants, monthly rent, payments per month, who is behind
- Other income and expenses by category

## Phase 6 — Reports ✅
- Profit and loss by source for any period
- Full operation history with filters, CSV download, print

## Phase 7 — Go live 🔜
- Create the Supabase project, run the migration, connect `.env`
- Put the app online (one small Node host) with HTTPS and a domain
- Automatic database backups (Supabase) and a restore test
- Demo to the client with his real opening balances; collect feedback

## Phase 8 — Client feedback and Uganda ⏳
- Changes requested after the demo
- Uganda: UGX currency, MTN and Airtel Uganda accounts, rates per currency pair
- French interface (and Swahili if wanted)

## Phase 9 — Hardening ⏳
- Automated tests for the money rules
- Audit log: who did what and when; edit with history instead of delete
- Daily closing: count the cash, compare with the system, record the difference
- Customer receipts (print / WhatsApp), low-float alerts
- Installable phone app (PWA)
