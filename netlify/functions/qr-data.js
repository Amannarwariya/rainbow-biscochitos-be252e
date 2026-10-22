/*
 * Durable TXT storage via GitHub Contents API.
 * Configure GITHUB_TOKEN (fine-grained token with Contents: Read and write),
 * GITHUB_OWNER, GITHUB_REPO, and optionally GITHUB_DATA_PATH in Netlify env vars.
 * Every Live Save updates data/qr-data.txt in the configured private/public repo.
 */
const path = process.env.GITHUB_DATA_PATH || "data/qr-data.txt";
const apiBase = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`;
const headers = () => ({
  "Accept": "application/vnd.github+json",
  "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "DynamicQR-Netlify"
});
function json(statusCode, payload) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(payload) };
}
function configured() { return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO); }
exports.handler = async (event) => {
  if (!configured()) return json(503, { error: "TXT cloud storage not configured. Set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO in Netlify environment variables." });
  try {
    if (event.httpMethod === "GET") {
      const r = await fetch(apiBase, { headers: headers() });
      if (r.status === 404) return json(200, { items: [], sha: null });
      if (!r.ok) return json(502, { error: "Could not read TXT data from GitHub." });
      const file = await r.json();
      const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
      let data;
      try { data = JSON.parse(content); } catch { return json(500, { error: "The GitHub TXT data file contains invalid JSON." }); }
      return json(200, { items: Array.isArray(data.items) ? data.items : [], sha: file.sha });
    }
    if (event.httpMethod === "PUT") {
      let body;
      try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request body." }); }
      if (!Array.isArray(body.items)) return json(400, { error: "Expected items array." });
      if (body.items.length > 50000) return json(413, { error: "This TXT file has too many records for this endpoint." });
      for (const item of body.items) {
        if (!item || !/^[a-z0-9]{9}$/.test(item.id || "") || typeof item.name !== "string" || typeof item.currentUrl !== "string") {
          return json(400, { error: "One or more QR records are invalid." });
        }
        try { const u = new URL(item.currentUrl); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); }
        catch { return json(400, { error: `Invalid destination URL for QR ${item.id}.` }); }
      }
      // Fetch the latest SHA so each write updates the current file.
      const existing = await fetch(apiBase, { headers: headers() });
      let sha;
      if (existing.ok) sha = (await existing.json()).sha;
      else if (existing.status !== 404) return json(502, { error: "Could not check current TXT version on GitHub." });
      const content = JSON.stringify({ format: "DynamicQR-TXT-v1", updatedAt: new Date().toISOString(), items: body.items }, null, 2) + "\n";
      const payload = { message: `DynamicQR live save (${new Date().toISOString()})`, content: Buffer.from(content, "utf8").toString("base64"), ...(sha ? { sha } : {}) };
      const saved = await fetch(apiBase, { method: "PUT", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!saved.ok) {
        const detail = await saved.json().catch(() => ({}));
        if (saved.status === 409 || saved.status === 422) return json(409, { error: "TXT file changed at the same time. Refresh the dashboard and save again." });
        return json(502, { error: detail.message || "GitHub could not save the TXT file. Check token permissions." });
      }
      return json(200, { saved: true, message: "TXT file updated", items: body.items });
    }
    return json(405, { error: "Method not allowed." });
  } catch (e) { return json(500, { error: "TXT storage request failed." }); }
};
