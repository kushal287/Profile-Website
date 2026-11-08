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
| My posts | Write posts, attach images / video / files, add inline links, pin, hide, edit, delete |
| GitHub repos | Toggle each repo's visibility, feature it, override its description |
| Resume | Upload new versions, choose which is live, rename, delete |
| Profile | Edit bio, roles, skills, **tech stack** (`Category: Item, Item @80`), education, social links |

## Studio link (KDS)

Admin → Profile → **Studio link (KDS)**: set the studio name and website address. The KDS logo and link then
show in the navigation bar, the About section and the footer. Leave the address empty to hide the link.
The built-in logo is `public/assets/kds-logo.svg`; to use your original image, save it as
`public/assets/kds-logo.png` (it takes priority automatically).

## Speed and images

- The home page ships with its data already inlined, so it paints without waiting for API calls; responses are gzip-compressed.
- The hero photo is served as AVIF / WebP / JPEG in two sizes. After changing `public/assets/kushal.jpg`, run `node scripts/optimize-images.js`.
- Photos uploaded in posts are automatically resized (max 1600 px) and converted to WebP.
- GitHub data is cached on disk (`data/github-cache.json`), so restarts and GitHub's rate limit (60 requests/hour without a token) don't empty your projects. Set `GITHUB_TOKEN` in `.env` for a much higher limit.
- The background renders at reduced resolution, slows itself down on weak devices and pauses in hidden tabs.

## Numbers on the home page

Profile → **Numbers on the home page**: Projects, Posts shared and GitHub followers are real values read
automatically (switch any off). LinkedIn / Instagram followers are typed in by hand because those sites
don't allow reading them. You can also add your own numbers (`Hackathons: 3`, `Years coding: 5+`).
A number shows only when it is above 0, and empty sections hide themselves.

## Interactive tech section

- **Language mix** is measured from the code in your visible GitHub repos (forks are left out by default). Click a language to filter Projects.
- **Stack explorer** shows the categories you set in Profile → Tech stack. Clicking an item filters your projects when it matches a GitHub language.
- **Live commit log** shows the latest commits from your visible repos.
- **Terminal** in the Contact section: type `help`. Press `/` anywhere to jump to it.

## Posts and links

Write a post, attach files, and use **🔗 Add link** to put a link inside the sentence. It is stored as
`[text](https://url)` and shows on the site as plain clickable text within the paragraph. Select a word
first to turn it into the link. Plain `https://…` addresses are linked automatically too.

## AI "Tidy" button (optional)

The post box has a **Tidy with AI** button that fixes spelling and spacing and removes hashtags.

Providers are tried in order, and the first that works wins:
1. **Your key** (`AI_PROVIDER` + `AI_API_KEY` in `.env`): `groq`, `gemini`, `openrouter` or `xai`. Free keys: console.groq.com, aistudio.google.com.
2. **Keyless free service** (pollinations), used automatically if the key is missing, invalid or out of credit. Turn off with `AI_FREE_FALLBACK=false`.
3. **Built-in cleaner** (strips hashtags and "like & share" lines) if no AI is reachable.

Keys stay on the server and are never sent to the browser.

## Deploying

Needs a Node host with a persistent disk (Render, Railway, Fly.io, a VPS). Keep `data/` and
`uploads/` on that disk, set `ADMIN_PASSWORD`, `AI_PROVIDER`, `AI_API_KEY` as environment variables, and
serve over HTTPS.
