# Resonate

A self-hosted practice tracker for voice work with a speech-language pathologist, built
phone-first. Log the session in seven short steps (when and how much effort, warm-up note,
glides, POWER, Stretch and Flow, endurance, then tags and notes), watch adherence against
the targets in the plan, and hand your SLP a report and a CSV.

Everything you write is encrypted at rest with a key derived from your passphrase. The
server cannot read the log while it is locked, and a restart locks it.

## What it tracks

From the plan, as written:

| Track | Per session | Days a week |
|---|---|---|
| **Vocal Function Exercises** - warm-up note, glides, POWER up and down | 5-15 min | 5-7 |
| **Stretch and Flow** - whichever phase you are on | 5-10 min | 5-7 |
| **Endurance** - record a Star Trek episode summary, or read your cozy novel aloud | building toward an hour | daily |

Three things in the plan are load-bearing, so the app measures them rather than hoping:

- **Glides get the most time.** The insights screen computes glide minutes as a share of
  vocal function minutes, and whether glides were the longest part of the session.
- **Slow and steady, varying speed and shape.** Glide pace is a field, and the share of
  glide time at a slow pace is reported.
- **Clear vibration without voice breaks.** The warm-up note records a clarity rating and a
  count of voice breaks, which is the most objective signal in the whole plan.

Stretch and Flow phases are free-form: enter whichever phase number you are on, and the app
shows the most recent one plus how many times it has changed. Your SLP decides what moves
you to the next phase, so the app does not guess.

## Run it

```sh
docker compose up -d
docker logs resonate   # prints the one-time setup token on first start
```

The compose file reads its settings from a `.env` file next to it, so you do not have to
edit `docker-compose.yml` to change the token, the public origin, or the host port. Copy the
template and edit it:

```sh
cp .env.example .env
# edit .env, then recreate the container so the new values are applied:
docker compose up -d --force-recreate
```

The compose file pulls `ghcr.io/therebelrobot/resonate:latest`; if you have edited the code,
rebuild locally (`npm run docker:build`) so your changes are in the image. GHCR packages start
private - flip it public in the package settings if you want to pull it elsewhere.

Put it behind Nginx Proxy Manager (or any TLS-terminating proxy) at something like
`https://voice.example.com`, then open it on your phone and use **Add to Home Screen**. It
must be served over HTTPS: the session cookie is `Secure`-only.

Proxy settings that matter:

- Forward to `<docker-host>:8788`, enable **Force SSL** and **HSTS**. The default port is
  8788 rather than 8787 so it can sit next to another app on the same host.
- If the proxy runs on a **different host** than the container, set
  `RESONATE_BIND_ADDRESS=0.0.0.0` so the published port is reachable over the LAN. The default
  `127.0.0.1` publishes the port only on the container's host. Security tradeoff: `0.0.0.0`
  exposes the port to every device on the network; prefer running the proxy on the same host.
- Set `RESONATE_TRUST_PROXY=true` so rate limiting sees the real client IP (from the rightmost
  `X-Forwarded-For` hop, the one your proxy appends).
- Set `RESONATE_PUBLIC_ORIGIN` to the exact public origin; state-changing requests from any
  other `Origin` are refused.
- Consider restricting it to your LAN or VPN in the proxy. There is no reason for a practice
  log to be reachable from the whole internet.

### Configuration

In Docker, set these in the `.env` file next to `docker-compose.yml` (see `.env.example`).
Outside Docker they are read from the process environment. Changing a variable takes effect
only after the server process restarts (in Docker: `docker compose up -d --force-recreate`).

| Variable | Default | What it does |
|---|---|---|
| `RESONATE_HOST_PORT` | `8788` | Host port the container is published on (compose only). The container always listens on `8788`. |
| `RESONATE_BIND_ADDRESS` | `127.0.0.1` | Host interface the port is published on (compose only). `0.0.0.0` = all interfaces. |
| `RESONATE_PORT` | `8788` | Listen port inside the container. Fixed in the published image. |
| `RESONATE_DATA_DIR` | `./data` (`/app/data` in Docker) | Where `resonate.db` lives |
| `RESONATE_SETUP_TOKEN` | random, logged at start | Required to create the log, so nobody else can claim a fresh instance. Only checked while the log does not exist yet. |
| `RESONATE_TRUST_PROXY` | `false` | Read client IPs from `X-Forwarded-For` |
| `RESONATE_PUBLIC_ORIGIN` | from `Host` | Expected `Origin` for state-changing requests |
| `RESONATE_COOKIE_SECURE` | `true` | `false` only for local development over plain HTTP |
| `RESONATE_SESSION_IDLE_MINUTES` | `30` | Lock after this long without activity |
| `RESONATE_SESSION_MAX_HOURS` | `12` | Lock after this long regardless |
| `RESONATE_SCRYPT_N` | `131072` | scrypt cost for a new log (fixed for the life of that log) |
| `RESONATE_TIMEZONE` | server zone | IANA zone for the Date and Time columns of the server-side CSV export |

## Reports, and the CSV for your SLP

**Insights -> Make a report for your SLP** (also under Settings) builds a report from a date
range: adherence per track, minutes per day, the effort-before-to-after shift, warm-up clarity
and voice breaks over time, glide share, POWER bests, Stretch and Flow phase, and the tags you
use most. You can leave out what you wrote and keep measurements only, include or skip drafts,
and untick individual sessions. **Print or save as PDF** uses the browser's print dialog; on
iPhone choose Print, then Share.

**Download CSV** exports the same selection long-format, one row per measurement:
`Date, Time, Timestamp, Measure, Value, Unit, Notes`. That is the shape clinical software
generally expects; column mapping may need adjusting once you see the import screen. There is
also a server-side CSV under **Settings -> Export** with one row per part of each session,
which is easier to pivot if you would rather work in a spreadsheet.

The browser-built report and CSV use your device's time zone. The server-built one uses
`RESONATE_TIMEZONE`, because the stored timestamps are UTC and the container is usually not in
your zone - which is exactly what makes an evening session land on the wrong day otherwise.

All three are built from data you already have open; the server only records that a report or
export was made. The files themselves are not encrypted.

## How it protects your log

**Encryption at rest (envelope encryption).** At setup the server generates a random 256-bit
data key. That key is stored only in wrapped form: AES-256-GCM encrypted under a key derived
from your passphrase with scrypt (N=2^17, r=8, ~128 MiB), and a second copy under a key derived
from a one-time recovery code. Every tag, session, and note is a single AES-256-GCM ciphertext
whose authenticated data names its table and row id, so rows cannot be swapped or replayed. The
only plaintext in the database is random row ids, the key-wrapping material, and the access log
(time, event, IP, user agent). SQLite runs with `secure_delete` so deleted records are
overwritten.

**The key lives only in memory, only while unlocked.** Unlocking unwraps the data key into the
server's memory for that session; locking, idling out, or restarting zero-fills it. A copied
database file or backup is ciphertext without the passphrase.

**What that means for backups:** back up `resonate.db` (plus `-wal`/`-shm` if present, or stop
the container first) as often as you like. They are useless without your passphrase or recovery
code, and **if you lose both, the log cannot be recovered by anyone.**

**Sign-in.** Passphrase (12+ characters), optional authenticator app code (TOTP, RFC 6238,
replay-protected; its secret is itself encrypted with the data key). The recovery code resets
the passphrase, turns off the authenticator, and is replaced on use. Changing the passphrase
signs out every other device.

**Brute force.** scrypt makes each guess cost about a second of CPU. On top of that, after 5
failures an IP is locked out for 30 s, doubling to a 1-hour cap, and more than 30 failures in
15 minutes from anywhere locks everyone out for the window.

**Web hardening.** Session cookie is `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`; the
token is random and only its SHA-256 is held server-side. Every state-changing request must
carry a custom header (forcing a CORS preflight that is never granted) and a same-origin
`Origin`. Strict CSP with no inline scripts or styles and no third-party origins,
`frame-ancestors 'none'`, `no-referrer`, HSTS, `Cache-Control: no-store` on every API response,
`noindex`. Static files are served from an allow-list built at startup, so there is no path
traversal surface. Errors never echo request content into logs.

**In the browser.** Decrypted sessions live only in React state. Nothing is written to
localStorage, IndexedDB, or a service worker cache. The tab locks itself after the idle window
even if you never touch it, and the page blurs while the app is in the background so
app-switcher snapshots do not show your sessions. Exports are plaintext by design and are
logged; CSV cells are neutralized against spreadsheet formula injection.

**Container.** Runs as the unprivileged `node` user from a read-only root filesystem with all
capabilities dropped and `no-new-privileges`; the runtime image holds only Node and one bundled
file, no `node_modules`.

### What it does not protect against

- Someone who can run code on the server **while the log is unlocked** can read the key from
  memory. Keep the host patched and the idle timeout short.
- A compromised phone or browser sees what you see.
- Timing metadata: the access log records when you unlock, and the row count reveals how many
  sessions exist.
- This is a personal tool, not a HIPAA-covered system. Voice-clinical notes you intend to share
  with a clinician deserve a deliberate choice of channel, not a convenience link.

## Develop

```sh
npm install
npm run dev:server   # API on :8788, plain-HTTP cookies, ./data
npm run dev:client   # Vite on :5173, proxies /api
npm test             # crypto, metrics, CSV, and API flows (node:test)
npm run typecheck
npm run build        # dist/public + dist/server.mjs
```

Stack: Hono on Node (24 in the image, 22.13+ works), `node:sqlite`, React 19 + Vite, zod for
request validation. Five runtime dependencies; the server builds to a single esbuild bundle.

There is no ORM on purpose: every row is a ciphertext blob keyed by a random id, so there are no
columns to model, query, or migrate; the handful of SQL statements per table sit in
`server/repositories.ts`. Three things are unusual compared with a typical CRUD app and are
deliberate:

1. `payload` columns contain AES-256-GCM ciphertext, and the authenticated data names the table
   and row id, so a row cannot be moved.
2. The set of tags is data, not schema - `shared/protocol.ts` seeds it from the plan, and
   everything is renameable in the app.
3. Adherence rules live in `shared/metrics.ts` next to the protocol definition, so the number
   on the Today screen and the number in the report come from one function.

The GitHub Actions workflows pin every action to a commit SHA. Those SHAs were carried over
from a sibling project rather than re-resolved here; let Dependabot move them rather than
trusting them.

## Manual checks worth doing on a real phone

Automated tests cover the crypto, the metrics, the CSV export, and the API; these depend on the
device:

- [ ] Add to Home Screen opens standalone, and the bottom bar clears the home indicator.
- [ ] Sliders drag smoothly with a thumb, and the ghost mark sits under the original effort
      rating when you re-rate at the end of a session.
- [ ] Switching apps blurs the log in the app switcher.
- [ ] Leaving the app open past the idle window shows the unlock screen.
- [ ] The authenticator link opens your authenticator app on iOS.
- [ ] Password manager offers to fill the passphrase on the unlock screen.
- [ ] The report prints with the navigation hidden and the session list intact.
- [ ] CSV export opens correctly in your spreadsheet app.

## License

Unlicense.
