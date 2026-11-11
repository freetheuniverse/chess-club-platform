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


### Troubleshooting first Workers Build

If Cloudflare reports `ENOENT: /opt/buildhome/repo/package.json`, check the build's branch label. The `main` branch is intentionally only a placeholder; the application resides on `dev`. In Cloudflare, set **Settings → Build → Branch control → Production branch** to `dev` and save. **Retry build** may rerun the old `main` commit; a fresh push to `dev` triggers a new build from the correct branch.

### Cloudflare password hashing compatibility

Cloudflare's production Worker runtime rejects a **single** PBKDF2 call with more than 100,000 iterations. Our original password hashing used 210,000 in one call, resulting in registration HTTP 500 even though the database was healthy. The Worker now stores versioned, random-salted hashes using three sequential 100,000-iteration PBKDF2-SHA256 operations with domain-separated salts. This is a custom chained KDF; it is **not identical** to one standard 300,000-iteration PBKDF2 operation and is an interim development solution. No raw passwords are saved.

Automated hash tests run in the `npm run check` build command, and Worker invocation logging is enabled for diagnosing failures. Cloudflare's 10 ms free-tier CPU limit may still impose restrictions, so test against an actual deployed Worker. For a public student rollout, replace this prototype authentication system with a managed identity solution and add verified email, account recovery and abuse controls.

### Registration troubleshooting

The Worker provides a safe JSON health endpoint at `/api/health`.

- `{"status":"ready","database":"ready"}`: the tables required to create a user session exist. If signup still fails, check the registration response and Cloudflare Worker Logs.
- An error saying **online database is not initialized**: run `npm run db:migrate:cloud` in the repository folder on your Windows computer. This is a **remote** migration, not `db:migrate:local`.
- A Cloudflare 1102 or **CPU exceeded** error: investigate password hashing and the Workers plan's CPU limit. Do not reduce password-hashing strength just to bypass the limit; use an appropriate authentication provider or plan instead.
- A Cloudflare Access login or HTML response: verify that your authorized Cloudflare Access login is complete before retrying.

Registration messages are shown under the form and no longer erase the entered information.

## Lichess puzzle assignments (development)

The **Puzzles** tab now has an initial moderator assignment workflow using the official Lichess puzzle API and `chess.js` for board rules. Members stay on this website, where the backend checks moves against Lichess solutions and records their progress.

**Required one-time migration:** After pulling `dev`, run this once in the project directory on an already-authenticated Windows computer:

```bat
git pull origin dev
npm install
npm run db:migrate:cloud
```

Confirm the new `0002_puzzle_assignments.sql` migration. Cloudflare Git deployments update code but do **not** automatically apply D1 migrations. The `/api/health` endpoint now reports `"puzzles":"ready"` when this migration is applied. A missing migration does not affect existing club features.

### Moderator workflow

1. Open a club and choose **Puzzles** → **Assign puzzles**.
2. Enter the title, select a Lichess theme and difficulty, choose 1–10 puzzles, and optionally specify a due date.
3. Select club members and create the assignment. Alternatively, enter one or more five-character public Lichess puzzle IDs to assign specific puzzles.
4. Open an assignment to view a per-member table of solved puzzles and mistakes.

### Student workflow

1. Open **Puzzles** in the assigned club and select an assignment.
2. Choose a puzzle from the list. On the board, click the piece and its destination square (no Lichess account needed).
3. Correct moves and opponent replies are applied; wrong attempts are counted. Progress is saved in D1 and resumes on the next visit.

The API returns the starting board position, not the solution. Correctness is verified in the Worker. Puzzle theme and difficulty are determined by Lichess; assignment results are our own club-specific metrics, **not official Lichess puzzle ratings**.

### Known limitations

- The feature must be tested on the real free-tier Cloudflare Worker and D1 database before students use it.
- Lichess limits API requests; bulk scraping is prohibited. If Lichess returns HTTP 429, wait at least a minute. For a larger puzzle catalog, import a curated subset of the CC0 puzzle dataset instead.
- An assignment records a target list at creation time; members who join later are not automatically added.
- Deadlines are displayed but are not yet hard submission cutoffs.
- Wrong answers count as mistakes, while each fully solved puzzle counts once.
- First version uses click-to-move; full drag-and-drop, promotion selection, timed exercises, hints, score distributions and analytics by skill can come later.
- The app needs additional authentication hardening, email verification, abuse controls and age-appropriate privacy settings before use with students.

Official sources: https://lichess-org.github.io/api/ and https://database.lichess.org/ .

## Official Lichess Chessground

The puzzle board now uses [Chessground](https://github.com/lichess-org/chessground) (`@lichess-org/chessground`), released under GPL-3.0-or-later. It provides drag-and-drop, touch support, highlights, piece movement animations, drawing arrows and circles, and board flipping. We continue using chess.js for the rules and the Cloudflare Worker for validating puzzle solutions and recording attempts.

This repository is public and contains its own GPL license. The website links to its full source code and to Lichess. The build copies Chessground's official base, brown-board, and Cburnett-piece CSS into the static assets and publishes its license. No database changes are needed.

This dependency replaces the earlier MIT board. Cloudflare's current build image runs Node 24; local development should also use Node 24 or newer.

## Visual design and navigation

The website uses a compact SHJC-inspired layout with a white title bar branded **Chess Club Manager** (no logo) and a dark-green navigation sidebar. **Your clubs** appears before the selected club's workspace pages. The standalone "Managed" label is removed; the optional "Joined" label distinguishes clubs in which the account is a student member. Both the centered **+** control and **Add a Club** open a chooser offering **Create a club** or **Join a club**.

The active club appears under **Club workspace**, with Overview, Tournaments, Puzzle Assignments, Members, and Attendance below it. Switching clubs resets stale tournament and puzzle selection. On narrow screens the sidebar is a toggleable drawer.

The **Overview** now puts the club's **Message board** on the left and **Quick reference** on the right. The quick-reference table shows members, tournaments, tournaments in progress, and attendance dates; below it are clickable tournament names that open the corresponding pairing workspace. The old large metrics strip, attendance summary card, and recent-tournaments table are removed. The club name is displayed clearly above the page title.

### Club message board setup

The message board stores real club announcements in Cloudflare D1. Moderators can **create, pin/unpin, and delete** posts; all members of that club can read them. The server checks membership and moderator access, and the frontend escapes titles and message text.

The first time you deploy this feature, apply migration `0003_club_messages.sql` from the local project folder:

```bat
git pull origin dev
npm install
npm run db:migrate:cloud
```

Cloudflare Builds automatically deploys application code but **does not run D1 migrations**. Until this migration is applied, the overview continues to work and shows a friendly "Message board setup required" message. This migration does not alter existing tournament, attendance, or puzzle-assignment records.

Tournament detail still preserves the original SHJC pairing layout: the player roster on the left, round pairings on the right, and standings underneath. Each match has a centered VS control for entering results. UI tests cover sidebar and club switching, the message board, and permission-based controls.

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
