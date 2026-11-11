# Chess Club Platform

A standalone, mobile-friendly chess club management website, independent of the previous Google Apps Script tournament tool. Built for **Cloudflare Workers + D1** to keep initial hosting costs low.

## Current development status

Working application code is on the **`dev` branch**. It is an early MVP and has not yet been deployed or browser-tested against a real D1 database.

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

## Cloudflare deployment

When ready to deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

Cloudflare will provide a `workers.dev` URL. The frontend static assets and JSON API are deployed together via Workers Static Assets. Database information is stored in D1.

**Important:** Do not deploy with the placeholder D1 database ID. Test the registration, tournament and attendance workflows in a development environment before inviting students. Cloudflare free plan quotas and product terms can change; check current limits in the dashboard.

## Design and data rules

- Roles are scoped per club: moderator vs student.
- Only club members can view a club's private data.
- Only moderators can create tournaments, enroll players, start rounds and enter results.
- Pairings try to avoid repeat opponents, but are **not** a fully FIDE-compliant Swiss engine.
- Attendance has a database uniqueness constraint on `(club_id,user_id,event_date)`. Enrolling the same participant in several tournaments on the same date is idempotent.
- Future-dated events do not record attendance ahead of time. If a player is enrolled before the event date, attendance must be finalized on the event date in a future workflow; this MVP does not yet automate that check.
- The puzzle attempts table is reserved for future server-verified integrations. Client-reported puzzle accuracy must not be trusted.

## Next improvements

1. Test and harden authentication, add registration controls for school clubs.
2. Add proper tournament check-in and enrollment-based attendance review; handle future tournament attendance.
3. Improve Swiss pairings using Buchholz tiebreaks, color balance and bye history.
4. Integrate a suitable puzzle provider and record verified completion.
5. Add full analytics by student, club and event.

## Repository workflow

Request changes in ChatGPT; make them on `dev`, inspect/test them, then merge to `main` when stable. Never commit private keys or Cloudflare account tokens.
