# QRFlow — Dynamic QR Code Generator & Link Manager

Responsive dynamic QR code software with permanent QR IDs (example `adb121der`), a View QR preview, shareable QR images/links, PNG download, editable destination fields, Live Save, and TXT import/export.

**SEO brand/title:** QRFlow — Dynamic QR Code Generator & Link Manager. The HTML includes a descriptive title, meta description, keywords, and Open Graph metadata. Search engines still decide how and when to index the site; metadata does not guarantee ranking.

## How it works
- The QR code contains your permanent Netlify URL `/r/<id>`, never the destination URL.
- The **Current redirect link** is the live destination. **Updated redirect link** is the draft destination.
- Clicking **Live Save** replaces the current destination with the updated one and writes all records to `data/qr-data.txt` in your GitHub repository.
- The QR ID and QR image remain unchanged. Scanning the QR runs a Netlify Function, reads the latest TXT file and redirects to the current destination.
- TXT file is stored in GitHub, so it persists and is shared across devices. Every save creates a commit in the configured repo.

## One-time setup
### 1. Create a GitHub repository
Create a repository (private is recommended). This project must be deployed from a Git repository so Netlify Functions are deployed. Push the contents of this ZIP into the repo.

### 2. Create a GitHub token
Create a **fine-grained personal access token** limited to that repository, with **Contents: Read and write** permission. Keep the token secret. Never paste it into frontend JavaScript or commit it to your repo.

### 3. Configure Netlify environment variables
In Netlify → Site configuration → Environment variables, add:
- `GITHUB_TOKEN` = your fine-grained token
- `GITHUB_OWNER` = GitHub username or organization that owns the repo
- `GITHUB_REPO` = repository name
- `GITHUB_DATA_PATH` = `data/qr-data.txt` (optional; this is the default)
- `DYNAMICQR_ADMIN_USER` = `admin` (optional; default is `admin`)
- `DYNAMICQR_ADMIN_PASSWORD` = choose a strong password (required for anything beyond a local demo)

Deploy/redeploy after setting variables. On first save, the function creates `data/qr-data.txt` automatically.

### 4. Admin login
The login form is currently a frontend-only demo gate. Netlify environment variables are not automatically exposed to browser JavaScript, so setting `DYNAMICQR_ADMIN_USER` / `DYNAMICQR_ADMIN_PASSWORD` alone does not secure this login. Before using on a public production site, add server-verified authentication; do not store sensitive QR destinations until that is implemented.

## TXT backup
- **Export TXT** downloads `qrflow-data.txt` with all QR IDs and URLs as JSON-formatted plain text.
- **Import TXT** imports that backup into the dashboard and saves it to GitHub when cloud storage is configured.
- The GitHub `data/qr-data.txt` file is the live source of truth; editing a local downloaded TXT file does not affect the live website until you import it and save.

## Limitations
- GitHub API rate limits and repository commit history apply; this is a lightweight low-volume solution, not a high-traffic redirect platform.
- A shared TXT file is less suitable than a database for concurrent edits or large-scale production. Simultaneous saves can conflict; refresh and retry.
- QR ID uses nine lowercase alphanumeric characters. Do not change the Netlify domain after printing QR codes.
- Netlify Functions require deployment from a Git repository; a plain static drag-and-drop deploy may not deploy functions.


## QR preview, sharing, and downloads

The app generates QR images in the browser and retries loading the QR library from jsDelivr and unpkg if the first CDN request fails. After creation, the create dialog closes and the QR preview opens. View QR, Share QR, Download PNG, and Copy link are wired to the same permanent QR URL. Native image sharing depends on browser/device support; if unavailable, the app copies the permanent URL or downloads the PNG.


## QR fallback and backup status
- QR rendering first tries the bundled page's QRCode library CDN, then a second CDN, and finally an online QR image service if script CDNs are blocked. The online fallback requires internet access and that the network allows `api.qrserver.com`.
- `Export TXT` and `Import TXT` are available even in local-demo mode. If the dashboard says `Local + TXT backup`, records are only saved in that browser's local storage until GitHub environment variables are configured in Netlify. For cross-device shared records, configure `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO`, then redeploy. A ZIP cannot configure these private credentials automatically.


## Fixing “QR code not found”
A dynamic QR scan runs on Netlify's server, so it cannot read the browser's localStorage. If a QR was created while the dashboard showed `Local only`, its record was never saved to cloud and the scan will not redirect. Configure `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` in Netlify and redeploy. Then, on the browser where the QR was created, use **Export TXT** and import that file after cloud storage is available. Confirm the status says **Cloud TXT ready**, then test the QR again. The redirect function now extracts IDs from either the Netlify query parameter or the `/r/<id>` path and displays a more useful error when cloud storage or the record is missing.
