/*
 * QRFlow — Dynamic QR Code Manager.
 * QR images are generated locally in the browser using qrcode.js.
 * Live Save uses a Netlify Function to read/write a JSON-formatted TXT file in GitHub.
 */
const $ = id => document.getElementById(id);
const state = { items: [], isDemo: false };
let toastTimer, latestQr = null, qrLibraryPromise = null;
const API = "/.netlify/functions/qr-data";
const BRAND_NAME = "QRFlow";

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function newId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
function permalink(id) {
  return `${location.origin}/r/${encodeURIComponent(id)}`;
}
function getStored() {
  try { return JSON.parse(localStorage.getItem("dynamicqr-demo") || "[]"); }
  catch { return []; }
}
async function api(method = "GET", body) {
  const res = await fetch(API, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `Storage API failed (${res.status})`);
  return data;
}
async function load() {
  try {
    const data = await api();
    state.items = data.items || [];
    state.isDemo = false;
  } catch {
    state.items = getStored();
    state.isDemo = true;
  }
  render();
}
function saveDemo() {
  localStorage.setItem("dynamicqr-demo", JSON.stringify(state.items));
}
async function persist() {
  const result = await api("PUT", { items: state.items });
  state.isDemo = false;
  return result;
}

/* Load QRCode on demand too, so a blocked first CDN request doesn't leave blank canvases. */
function ensureQrLibrary() {
  if (window.QRCode && typeof window.QRCode.toCanvas === "function") return Promise.resolve(window.QRCode);
  if (qrLibraryPromise) return qrLibraryPromise;
  qrLibraryPromise = new Promise((resolve, reject) => {
    const urls = [
      "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js",
      "https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js"
    ];
    let index = 0;
    const tryNext = () => {
      if (window.QRCode && typeof window.QRCode.toCanvas === "function") return resolve(window.QRCode);
      if (index >= urls.length) {
        qrLibraryPromise = null;
        return reject(new Error("QR library load nahi hui. Internet connection check karke dobara try karein."));
      }
      const script = document.createElement("script");
      script.src = urls[index++];
      script.async = true;
      script.onload = () => {
        if (window.QRCode && typeof window.QRCode.toCanvas === "function") resolve(window.QRCode);
        else tryNext();
      };
      script.onerror = tryNext;
      document.head.appendChild(script);
    };
    tryNext();
  });
  return qrLibraryPromise;
}
async function drawQr(canvas, id, width) {
  try {
    const QR = await ensureQrLibrary();
    await QR.toCanvas(canvas, permalink(id), {
      width, margin: 2, errorCorrectionLevel: "H", color: { dark: "#111827", light: "#ffffff" }
    });
    return canvas;
  } catch (libraryError) {
    // Last-resort QR image service fallback for networks that block script CDNs.
    // Keep a canvas result so PNG download/share uses the same flow.
    const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${width}&margin=2&format=png&data=${encodeURIComponent(permalink(id))}`;
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const ctx = canvas.getContext("2d");
          canvas.width = width; canvas.height = width;
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, width);
          ctx.drawImage(img, 0, 0, width, width);
          resolve();
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("QR library aur QR image service dono load nahi hue. Internet/CDN access check karein."));
      img.src = imageUrl;
    }).catch(() => { throw new Error("QR library load nahi hui aur QR fallback bhi unavailable hai. Internet connection ya network restrictions check karein."); });
    return canvas;
  }
}
function render() {
  const q = $("search").value.trim().toLowerCase();
  const items = state.items.filter(r =>
    `${r.id} ${r.name} ${r.currentUrl} ${r.updatedUrl || ""}`.toLowerCase().includes(q)
  );
  $("total").textContent = state.items.length;
  $("active").textContent = state.items.filter(x => x.active !== false).length;
  $("backupStatus").textContent = state.isDemo ? "Local only — scan won't redirect" : "Cloud TXT ready";
  $("countLabel").textContent = `${items.length} record${items.length === 1 ? "" : "s"}`;
  $("empty").classList.toggle("hidden", state.items.length !== 0);
  $("qrList").innerHTML = items.map(r => `<article class="qr-item" data-id="${esc(r.id)}">
    <div class="qr-identity"><canvas class="thumb" data-id="${esc(r.id)}" width="100" height="100" aria-label="QR code preview"></canvas><div><div class="qr-title">${esc(r.name)}</div><div class="qr-id">ID: ${esc(r.id)}</div><div class="active-tag ${r.active === false ? "paused" : ""}">${r.active === false ? "Paused" : "Active"}</div></div></div>
    <div><div class="field-title">CURRENT REDIRECT LINK</div><input class="field-input current-url" value="${esc(r.currentUrl)}" readonly title="Currently live destination"></div>
    <div><div class="field-title">UPDATED REDIRECT LINK</div><div class="updated-field"><input class="field-input updated-url" type="url" value="${esc(r.updatedUrl || r.currentUrl)}" placeholder="Paste the new destination URL (https://example.com)"><button class="live-save" data-action="save">Live Save ↗</button></div></div>
    <div class="row-actions"><button type="button" class="small-btn" data-action="qr">View QR</button><button type="button" class="small-btn" data-action="share">Share QR</button><button type="button" class="small-btn" data-action="download">Download PNG</button><button type="button" class="small-btn" data-action="toggle">${r.active === false ? "Enable" : "Pause"}</button></div>
  </article>`).join("");
  document.querySelectorAll("canvas.thumb").forEach(async canvas => {
    try { await drawQr(canvas, canvas.dataset.id, 100); }
    catch { canvas.title = "QR preview unavailable. Click View QR to retry."; }
  });
}

$("search").addEventListener("input", render);
function openCreate() {
  $("createError").textContent = "";
  $("createForm").reset();
  $("createModal").classList.remove("hidden");
}
function closeCreate() { $("createModal").classList.add("hidden"); }
$("createBtn").addEventListener("click", openCreate);
$("emptyCreate").addEventListener("click", openCreate);
$("closeCreate").addEventListener("click", closeCreate);
$("cancelCreate").addEventListener("click", closeCreate);

$("createForm").addEventListener("submit", async e => {
  e.preventDefault();
  const submitButton = $("createForm").querySelector('button[type="submit"], button:not([type])');
  const name = $("newName").value.trim(), url = $("newUrl").value.trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    $("createError").textContent = "Valid http:// ya https:// destination URL enter karein.";
    return;
  }
  if (!name) {
    $("createError").textContent = "QR code ka naam enter karein.";
    return;
  }
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Creating…"; }
  const record = {
    id: newId(), name, currentUrl: url, updatedUrl: url, active: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  try {
    // Check QR generation before saving, so users never receive a blank QR preview.
    await drawQr($("bigQr"), record.id, 260);
    state.items.unshift(record);
    try {
      await persist();
      state.isDemo = false;
      toast("QR code created and saved to cloud");
    } catch {
      saveDemo();
      state.isDemo = true;
      toast("QR created locally only. Configure GitHub storage before scanning the permanent link.");
    }
    closeCreate();
    render();
    await showQr(record);
    if (state.isDemo) {
      $("qrError").textContent = "Important: this QR ID is currently saved only in this browser. Scanning the permanent link from a phone will not work until GitHub TXT storage is configured in Netlify and this record is imported/saved to cloud.";
    }
  } catch (err) {
    $("createError").textContent = err.message || "QR code generate nahi ho paya. Dobara try karein.";
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Create QR code"; }
  }
});

$("qrList").addEventListener("click", async e => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".qr-item");
  const record = state.items.find(x => x.id === row?.dataset.id);
  if (!record) return;
  const action = button.dataset.action;
  if (action === "save") {
    const value = row.querySelector(".updated-url").value.trim();
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch { toast("Valid http:// ya https:// URL enter karein"); return; }
    const oldCurrent = record.currentUrl, oldUpdated = record.updatedUrl;
    record.updatedUrl = value;
    record.currentUrl = value;
    record.updatedAt = new Date().toISOString();
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await persist();
      render();
      toast("Live saved — QR ID unchanged");
    } catch {
      record.currentUrl = oldCurrent;
      record.updatedUrl = oldUpdated;
      saveDemo();
      render();
      toast("Server storage setup nahi hai; live redirect update nahi hua");
    }
  } else if (action === "qr") {
    try { await showQr(record); }
    catch (err) { toast(err.message || "QR code show nahi ho paya"); }
  } else if (action === "share") {
    await shareQr(record);
  } else if (action === "download") {
    try { await downloadQr(record); }
    catch (err) { toast(err.message || "QR download nahi ho paya"); }
  } else if (action === "toggle") {
    const old = record.active;
    record.active = record.active === false;
    try {
      await persist();
      render();
      toast(record.active ? "QR enabled" : "QR paused");
    } catch {
      record.active = old;
      render();
      toast("Server storage setup nahi hai; status update nahi hua");
    }
  }
});

async function showQr(record) {
  latestQr = record;
  $("qrModalName").textContent = record.name;
  $("permalink").value = permalink(record.id);
  $("qrError").textContent = "";
  $("qrModal").classList.remove("hidden");
  try {
    await drawQr($("bigQr"), record.id, 320);
  } catch (err) {
    $("qrError").textContent = err.message || "QR generate nahi ho paya.";
    throw err;
  }
}
async function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) return reject(new Error("Is browser mein PNG export supported nahi hai."));
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG image create nahi ho payi.")), "image/png");
  });
}
async function downloadQr(record) {
  const canvas = await drawQr($("bigQr"), record.id, 500);
  const blob = await canvasBlob(canvas);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${record.id}-qrflow-qr.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("QR PNG downloaded");
}
async function shareQr(record) {
  try {
    const canvas = await drawQr($("bigQr"), record.id, 500);
    const url = permalink(record.id);
    const title = `${record.name} — ${BRAND_NAME} QR code`;
    if (navigator.share) {
      try {
        const blob = await canvasBlob(canvas);
        const file = new File([blob], `${record.id}-qrflow-qr.png`, { type: "image/png" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text: `Scan this QR code to open ${record.name}.`, files: [file] });
          toast("QR image shared");
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
      await navigator.share({ title, text: `Permanent QR link for ${record.name}: ${url}`, url });
      toast("Permanent QR link shared");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Direct sharing supported nahi hai — permanent QR link copied. Image ke liye Download PNG use karein.");
    } catch {
      await downloadQr(record);
      toast("Direct sharing supported nahi hai — QR image download kar di gayi.");
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    toast(err.message || "Share nahi ho paya. Download PNG ya Copy link try karein.");
  }
}

$("downloadQr").addEventListener("click", async () => {
  if (!latestQr) return;
  try { await downloadQr(latestQr); } catch (err) { toast(err.message || "Download failed"); }
});
$("shareQr").addEventListener("click", () => latestQr && shareQr(latestQr));
function closeQr() { $("qrModal").classList.add("hidden"); }
$("closeQr").addEventListener("click", closeQr);
$("doneQr").addEventListener("click", closeQr);
$("copyLink").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("permalink").value);
    toast("Permanent QR URL copied");
  } catch {
    $("permalink").select();
    const copied = document.execCommand("copy");
    toast(copied ? "Permanent QR URL copied" : "Link select ho gaya — Ctrl+C press karein");
  }
});

$("exportBtn").addEventListener("click", () => {
  const payload = { format: "DynamicQR-TXT-v1", exportedAt: new Date().toISOString(), items: state.items };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "qrflow-data.txt";
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("backupStatus").textContent = "Exported";
  toast("TXT backup downloaded");
});
$("importFile").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) throw Error("TXT file format sahi nahi hai");
    for (const record of items) {
      if (!record.id || !record.currentUrl || !record.name) throw Error("Backup mein required fields missing hain");
    }
    const previous = state.items;
    state.items = items;
    try {
      await persist();
      state.isDemo = false;
      toast("TXT imported and synced");
    } catch {
      state.items = previous;
      throw Error("Server storage setup nahi hai; TXT import sync nahi hua.");
    }
    render();
  } catch (err) {
    toast(err.message || "File import nahi ho payi");
  }
  e.target.value = "";
});

$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const expectedUser = window.DYNAMICQR_ADMIN_USER || "admin";
  const expectedPass = window.DYNAMICQR_ADMIN_PASSWORD || "change-this-password";
  if ($("username").value.trim() !== expectedUser || $("password").value !== expectedPass) {
    $("loginError").textContent = "Username ya password galat hai.";
    return;
  }
  sessionStorage.setItem("dynamicqr-auth", "yes");
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  load();
});
$("logout").addEventListener("click", () => {
  sessionStorage.removeItem("dynamicqr-auth");
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
});
if (sessionStorage.getItem("dynamicqr-auth") === "yes") {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  load();
}
