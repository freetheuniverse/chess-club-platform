# Third-party software and artwork

This project is distributed under GPL-3.0. See the top-level [LICENSE](LICENSE).

## Lichess Chessground

- Package: `@lichess-org/chessground` (official Lichess chessboard)
- Copyright: Chessground contributors / Lichess
- License: GPL-3.0-or-later
- Source: https://github.com/lichess-org/chessground
- License: https://github.com/lichess-org/chessground/blob/master/LICENSE

The production build includes Chessground's official base stylesheet, brown-board
theme, and Cburnett SVG piece theme. These are supplied by the Chessground package,
not recreated or relicensed by this project. The build also publishes its GPL
license at `/assets/licenses/Chessground-GPL-3.0-or-later.txt`.

## chess.js

- Package: `chess.js`
- License: BSD-2-Clause
- Source: https://github.com/jhlywa/chess.js

chess.js validates moves and chess rules. Puzzle answers are verified by the
Cloudflare Worker against solutions stored privately in the D1 database.

## Source availability

Complete source for the Chess Club Platform, including the board adapter and
Cloudflare Worker, is available at:
https://github.com/freetheuniverse/chess-club-platform/tree/dev

Club membership, student attendance, password hashes, and puzzle progress are
private application data, not part of the publicly licensed source code.
