/*
 * Permanent dynamic QR redirect.
 * QR URLs are /r/<9-character-id>; Netlify may pass the ID as query string or path.
 * Cloud records must be stored in the GitHub TXT file; browser localStorage is not available to scanners.
 */
const dataPath = process.env.GITHUB_DATA_PATH || "data/qr-data.txt";
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const token = process.env.GITHUB_TOKEN;
const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}`;

exports.handler = async (event) => {
  const queryId = event.queryStringParameters?.id || "";
  const pathMatch = (event.path || "").match(/\/r\/([a-z0-9]{9})\/?$/i);
  const id = String(queryId || pathMatch?.[1] || "").toLowerCase();

  if (!/^[a-z0-9]{9}$/.test(id)) {
    return page(404, "QR code not found", "This QR URL does not contain a valid 9-character QR ID. Check that the Netlify redirect rule is deployed.");
  }
  if (!token || !owner || !repo) {
    return page(503, "QR storage not configured", "This QR code cannot redirect yet. In Netlify, set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO, then redeploy. Also import/save this QR record to cloud storage.");
  }

  try {
    const response = await fetch(apiUrl, { headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "QRFlow-Netlify"
    }});
    if (response.status === 404) {
      return page(404, "QR code not found", "This QR ID is not in the cloud TXT file. If it was created while the dashboard showed Local only, import the TXT backup after configuring cloud storage.");
    }
    if (!response.ok) {
      return page(502, "QR data unavailable", `GitHub could not read the QR data file (HTTP ${response.status}). Check your token permissions, repository name, and data file path.`);
    }
    const file = await response.json();
    if (!file.content) return page(500, "QR data unavailable", "The cloud TXT file has no readable content.");
    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    const data = JSON.parse(decoded);
    const record = (data.items || []).find(x => String(x.id || "").toLowerCase() === id);
    if (!record) {
      return page(404, "QR code not found", "This QR ID does not exist in the cloud TXT file. Import the TXT backup from the browser where it was created, then redeploy is not needed.");
    }
    if (record.active === false) return page(410, "QR code paused", "The owner has temporarily disabled this QR code.");
    const dest = new URL(record.currentUrl);
    if (!["http:", "https:"].includes(dest.protocol)) return page(500, "Invalid destination", "The saved destination URL is invalid.");
    return { statusCode: 302, headers: { Location: dest.toString(), "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: "" };
  } catch (error) {
    return page(500, "Redirect error", "The redirect service could not read the cloud QR data. Check that data/qr-data.txt contains valid JSON and your Netlify environment variables are correct.");
  }
};

function page(statusCode, title, message) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} — QRFlow</title></head><body style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;color:#182230"><h1>${safeTitle}</h1><p>${safeMessage}</p></body></html>`
  };
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
