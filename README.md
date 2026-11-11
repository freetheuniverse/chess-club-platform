# Chess Club Platform

A standalone, mobile-friendly chess club management website, independent of the previous Google Apps Script tournament tool. Built for **Cloudflare Workers + D1** to keep initial hosting costs low.

## Current development status

Working application code is on the **`dev` branch**. It is an early MVP and has been tested locally; remote Cloudflare deployment still requires the one-time Git connection and remote migration.

### Included in this MVP
- Moderator and student accounts (email + password, server-side session cookies)
- Create a club, join with an invite code, and see a club dashboard
- Tournament creation, enrollment of existing club members, and Swiss-style pairings
- Game results (white win, black win, draw), standings, byes, and completed tournaments
- Attendance recorded automatically when players are added to current/past-date tournaments; one attendance record per **club + student + event date** across tournaments
- Member directory, attendance history and responsive dashboard

**Not yet implemented:** puzzle provider integration and validated puzzle analytics; advanced Swiss tiebreaks, color balancing, pairings constraints, email verification/password reset, rate limiting, and production-grade abuse controls. The interface links to Lichess for puzzle practice but does **not** claim to track Lichess performance.

## Local setup

Install **Node.js 22+**, **Git**, and create a free [Cloudflare](https://dash.cloudflare.com/) account.

```bash
git clone https://github.com/freetheuniverse/chess-club-platform.git
cd chess-club-platform
git checkout dev
npm install
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create chess-club-db
```

Copy the `database_id` shown in the terminal into `wrangler.jsonc` where it says `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Apply schema locally:

```bash
npm run db:migrate:local
npm run dev
```

Open the localhost URL Wrangler prints. Register, create a club, and add student accounts using a club join code. Moderators can then create tournaments and enroll members.

## Automatic Cloudflare deployment from GitHub (development)

This project has two Wrangler configurations:

- `wrangler.jsonc`: local development. Keep your personal local database settings; do not commit credentials.
- `wrangler.cloud.jsonc`: **Cloudflare Git deployment** using the project's already-created remote D1 database. This file is safe to commit because a D1 database ID is not an API credential. Never put API keys or tokens in either file.

### One-time database preparation

On your Windows computer in this repository, run:

```bash
git pull origin dev
npm run db:migrate:cloud
```

Confirm the migration if prompted. This applies schema `0001_initial.sql` to the **remote** Cloudflare D1 database, not the local test copy. Local and remote databases store different data.

### Connect GitHub to Cloudflare

1. Open [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages), select **Create application**, then **GitHub** (Workers Git integration). Authorize the `freetheuniverse` GitHub account if requested.
2. Grant Cloudflare access to the private repo `freetheuniverse/chess-club-platform` and select it.
3. Ensure the **Worker name** is exactly `chess-club-platform` (it matches the Wrangler `name`). Use the **`dev`** branch as the **production branch for this development Worker**, NOT `main`.
4. Use the **repository root** as root directory. Set **Build command** to `npm run check` and **Deploy command** to `npm run deploy:cloud`. No Cloudflare API token needs to be pasted into ChatGPT; Workers Builds can provision its own build token.
5. Select **Save and Deploy**. Confirm a successful build in the Cloudflare dashboard and open the generated `workers.dev` URL. Do not guess a URL.
6. If Cloudflare initially selects `main`, change it under your Worker **Settings > Builds > Branch control** to `dev` before relying on auto-deploys. Disable other branch builds for now to keep the testing environment predictable.

After this one-time setup, **each Git push to the `dev` branch triggers a fresh Cloudflare build and deployment**, without running `git pull` or `npm run dev` on Windows.

For a one-time manual cloud deploy from your computer instead, use `npm run deploy:cloud` (requires Wrangler login).

### Safety notes

The online address is publicly reachable; use test data only until authentication safeguards, email verification, password recovery, rate limiting, and club moderation are finished. Cloudflare Workers Free has a short per-request CPU-time allowance; check login and registration on your real Worker since cryptographic password derivation may exceed that limit. A future student-facing production site must use its own Worker and database, separate from this dev environment.

**Do not** connect the `main` branch of this repository directly to this test Worker or reuse the testing database for live student data.

## Design and data rules

- Roles are scoped per club: moderator vs student.
- Only club members can view a club's private data.
- Only moderators can create tournaments, enroll players, start rounds and enter results.
- Pairings try to avoid repeat opponents, but are **not** a fully FIDE-compliant Swiss engine.
- Attendance has a database uniqueness constraint on `(club_id,user_id,event_date)`. Enrolling the same participant in several tournaments on the same date is idempotent.
- Future-dated events do not record attendance ahead of time. If a player is enrolled before the event date, their attendance is recorded when the moderator generates the first round on that date. A tournament never started will not produce attendance automatically.
- The puzzle attempts table is reserved for future server-verified integrations. Client-reported puzzle accuracy must not be trusted.

## Next improvements

1. Test and harden authentication, add registration controls for school clubs.
2. Add proper tournament check-in and enrollment-based attendance review; handle future tournament attendance.
3. Improve Swiss pairings using Buchholz tiebreaks, color balance and bye history.
4. Integrate a suitable puzzle provider and record verified completion.
5. Add full analytics by student, club and event.

## Repository workflow

Request changes in ChatGPT; make them on `dev`, inspect/test them, then merge to `main` when stable. Never commit private keys or Cloudflare account tokens.
