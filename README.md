# Greenhouse Planner — PWA package

This folder is your app, ready to be published as an installable PWA and
eventually to the Google Play Store. It contains:

```
index.html          the app itself (with PWA tags + a localStorage fallback)
manifest.json        app name, icons, colors, display mode
service-worker.js    lets the app work offline and be "installable"
icons/                app icons in the required sizes
```

## Step 1 — Put it online (needs to be HTTPS, not a local file)

Easiest free option — **GitHub Pages**:
1. Create a free GitHub account if you don't have one.
2. Create a new repository (e.g. `greenhouse-planner`), and upload the
   contents of this folder (index.html, manifest.json, service-worker.js,
   and the icons folder) to the root of the repository.
3. In the repo, go to **Settings → Pages**, set the source to the `main`
   branch, root folder, and save.
4. After a minute or two, GitHub gives you a URL like
   `https://yourusername.github.io/greenhouse-planner/` — that's your live
   app.

(Netlify or Vercel work the same way if you'd rather drag-and-drop the
folder instead of using git.)

## Step 2 — Verify it works as a PWA

Open the GitHub Pages URL on your phone in Chrome. You should see a
"Install app" / "Add to Home Screen" prompt. Install it and confirm it
opens full-screen with your icon, and that planting something and closing
the app keeps your layout when you reopen it.

## Step 3 — Package it for Android

Go to **[pwabuilder.com](https://www.pwabuilder.com)**, paste your GitHub
Pages URL, and let it analyze the site. It will generate a downloadable
Android package (`.aab`) built around a Trusted Web Activity — no native
coding required.

## Step 4 — Publish to Google Play

1. Create a [Google Play Console](https://play.google.com/console) account
   (one-time $25 USD registration fee).
2. Create a new app, upload the `.aab` file from PWABuilder.
3. Fill in the store listing: description, screenshots, icon (you already
   have `icons/icon-512.png`), and content rating questionnaire.
4. **Required:** publish a privacy policy page, since the app requests
   location access. A simple page stating what data is used (location, for
   local weather; nothing is collected or shared) and hosting it as another
   page on your GitHub Pages site is enough. Ask if you'd like help writing
   one.
5. Submit for review.

## Known limitations of the standalone version

- **Custom plant icon generation** (the "+ Add Plant" AI-generated icon
  feature) calls Anthropic's API directly and only works inside Claude.ai,
  where the request is authenticated automatically. Outside Claude.ai it
  will fail silently and fall back to a locally chosen icon — everything
  else about adding a custom plant still works fine.
- Weather, sunset, and location lookups (open-meteo.com and ipwho.is) are
  free public APIs with no key required, so those work exactly the same
  once deployed.
