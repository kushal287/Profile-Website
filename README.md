# Kushal Aggarwal — Portfolio

Node + Express backend, vanilla HTML/CSS/JS frontend, JSON-file storage (no database to set up).

## Run

```bash
npm install
npm start          # http://localhost:3000
```

Settings live in `.env` (see `.env.example`). **Quote the password** if it contains `#`:
`ADMIN_PASSWORD="your#code"`.

## Hidden admin panel

Open `/aaddmmiinn` (e.g. `http://localhost:3000/aaddmmiinn`) and enter the access code.
There is no link to it anywhere on the public site. The code is checked on the server; the
session is a signed httpOnly cookie, and 6 wrong tries lock that IP out for 15 minutes.

| Tab | What it does |
|---|---|
| My posts | Write posts, attach images / video / files, pin, hide, edit, delete |
| LinkedIn | Add posts (paste), bulk-import `Shares.csv`, AI-clean, hide/show, edit, delete |
| GitHub repos | Toggle each repo's visibility, feature it, override its description |
| Resume | Upload new versions, choose which is live, rename, delete |
| Profile | Edit bio, roles, skills, education, social links |

## LinkedIn

LinkedIn has no public API for reading your own posts, and scraping it breaks their terms. Use either:
1. **Paste** a post into the LinkedIn tab, or
2. **Bulk import:** LinkedIn → Settings → Data privacy → *Get a copy of your data* → Posts → upload `Shares.csv`.

## AI cleaning

Providers are tried in order, and the first that works wins:
1. **Your key** (`AI_PROVIDER` + `AI_API_KEY` in `.env`): `groq`, `gemini`, `openrouter` or `xai`. Free keys: console.groq.com, aistudio.google.com.
2. **Keyless free service** (pollinations), used automatically if the key is missing, invalid or out of credit. Turn off with `AI_FREE_FALLBACK=false`.
3. **Built-in cleaner** (strips hashtags and "like & share" lines) if no AI is reachable.

Keys stay on the server and are never sent to the browser.

## Deploying

Needs a Node host with a persistent disk (Render, Railway, Fly.io, a VPS). Keep `data/` and
`uploads/` on that disk, set `ADMIN_PASSWORD`, `AI_PROVIDER`, `AI_API_KEY` as environment variables, and
serve over HTTPS.
