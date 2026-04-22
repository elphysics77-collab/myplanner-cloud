# Cloud Setup (GitHub Actions)

## Setup Steps

### 1. Create private GitHub repo

- Go to https://github.com/new
- Name: `myplanner-cloud` (or anything)
- **Private** ✓
- Don't initialize with README

### 2. Push code to repo

From this project folder:
```bash
git init
git add cloud/ .github/
git commit -m "initial cloud setup"
git branch -M main
git remote add origin https://github.com/elphysics77-collab/myplanner-cloud.git
git push -u origin main
```

### 3. Add browser-state.json as secret

- In your GitHub repo, go to **Settings → Secrets and variables → Actions**
- Click **New repository secret**
- Name: `BROWSER_STATE_JSON`
- Value: paste the contents of `browser-state.json` (whole file)
- Save

### 4. Verify

- Go to **Actions** tab in the repo
- Click "Office Alert"
- Click "Run workflow" → target: `today` → Run
- Check the log output

## How It Works

- **Every day at 22:00 Greek** → checks if tomorrow is office → URGENT push if yes, skip if WFH
- **Every day at 08:00 Greek** → same for today
- Workflow has 4 cron schedules (2 summer + 2 winter) but self-checks Greek time, so only fires once per target time

## When Session Expires

When the workflow fails with "Session Expired", you'll get a notification on your phone. Then:

1. Run locally: `npx ts-node watcher.ts` (will open browser, approve MFA)
2. Copy the new `browser-state.json` contents
3. In GitHub: **Settings → Secrets → BROWSER_STATE_JSON → Update** → paste → Save
