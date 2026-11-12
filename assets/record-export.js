// A self-contained print document for one application. The browser's print
// dialog can save it as a PDF while preserving Punjabi text and photographs.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const filled = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const field = (label, value) => filled(value)
  ? `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

export function recordExportHtml({ application: a, number, status, constituency, department,
  officers = [], creator, details, events = [], images = [], generatedAt }) {
  const imageUrls = images.filter((image) => /^https:\/\//i.test(image.url || "") || /^data:image\//i.test(image.url || ""));
  const applicant = [
    field("Name · ਨਾਮ", a.name), field("Father / husband · ਪਿਤਾ / ਪਤੀ", a.father_name),
    field("Mobile · ਮੋਬਾਈਲ", a.mobile), field("Alternate mobile · ਮੋਬਾਈਲ 2", a.mobile2),
    field("Voter ID / EPIC · ਵੋਟਰ ਕਾਰਡ", a.voter_id), field("Village / ward · ਪਿੰਡ / ਵਾਰਡ", a.village),
    field("Area · ਇਲਾਕਾ", a.area), field("District · ਜ਼ਿਲ੍ਹਾ", a.district),
    field("Polling station · ਪੋਲਿੰਗ ਸਟੇਸ਼ਨ", a.polling_station),
    field("Parliamentary constituency · ਲੋਕ ਸਭਾ ਹਲਕਾ", a.parliamentary)
  ].join("");
  const assignment = [
    field("Constituency · ਹਲਕਾ", constituency), field("Department · ਵਿਭਾਗ", department || "Not assigned yet"),
    field("Assigned officers · ਅਧਿਕਾਰੀ", officers.join(", ")),
    field("Revisit · ਦੁਬਾਰਾ ਮਿਲਣਾ", a.revisit_time ? `${a.revisit_time}${a.revisit_on ? ` (${a.revisit_on})` : ""}` : a.revisit_on)
  ].join("");
  const history = events.map((event) => `<li class="event">
    <div class="event-head"><b>${escapeHtml(event.status || "Note · ਨੋਟ")}</b><time>${escapeHtml(event.at)}</time></div>
    ${filled(event.note) ? `<p>${escapeHtml(event.note)}</p>` : ""}
    <small>${escapeHtml(event.actor || "—")}${filled(event.role) ? ` · ${escapeHtml(event.role)}` : ""}</small>
  </li>`).join("");
  const photos = imageUrls.map((image, index) => `<figure><img src="${escapeHtml(image.url)}" alt="Application image ${index + 1}"><figcaption>Image ${index + 1}${filled(image.at) ? ` · ${escapeHtml(image.at)}` : ""}</figcaption></figure>`).join("");
  return `<!doctype html><html lang="pa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(number)} · dsidein Office</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Gurmukhi:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 17mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #18283b; background: #fff; font: 11px/1.48 Inter,"Noto Sans Gurmukhi",sans-serif; }
  .watermarks { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; opacity: .09; }
  .watermarks span { position: absolute; left: -16%; width: 132%; text-align: center; transform: rotate(-31deg); font: 700 42px/1 Inter,sans-serif; letter-spacing: .13em; color: #1a4b72; white-space: nowrap; }
  .watermarks span:nth-child(1) { top: 13%; }.watermarks span:nth-child(2) { top: 46%; }.watermarks span:nth-child(3) { top: 79%; }
  .document { position: relative; z-index: 1; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; border-bottom: 2px solid #173a5d; padding-bottom: 10px; margin-bottom: 16px; }
  .brand { color: #173a5d; font-size: 17px; font-weight: 700; line-height: 1.15; }.brand small { display: block; margin-top: 4px; color: #607388; font-size: 9px; font-weight: 500; letter-spacing: .05em; text-transform: uppercase; }
  .reference { text-align: right; }.reference b { display: block; font-size: 13px; color: #173a5d; }.reference span { color: #607388; font-size: 9px; }
  h1 { margin: 0 0 4px; color: #173a5d; font-size: 20px; line-height: 1.25; overflow-wrap: anywhere; }
  .subtitle { margin: 0 0 15px; color: #5c6e7f; }
  .summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-bottom: 17px; }
  .summary div { padding: 9px 10px; background: #eef3f7; border-left: 3px solid #1a6979; min-width: 0; }
  .summary span { display: block; color: #647789; font-size: 9px; }.summary b { display: block; margin-top: 3px; font-size: 10px; overflow-wrap: anywhere; }
  section { margin: 0 0 17px; break-inside: auto; } section h2 { margin: 0 0 9px; padding-bottom: 5px; border-bottom: 1px solid #cbd6df; color: #173a5d; font-size: 13px; break-after: avoid; }
  dl { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px 18px; margin: 0; }
  .field { min-width: 0; break-inside: avoid; }.field dt { color: #657789; font-size: 9px; }.field dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
  .problem { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }.meta { margin-top: 11px; }
  .history { margin: 0; padding: 0 0 0 18px; }.event { padding: 0 0 11px 4px; break-inside: avoid; }.event-head { display: flex; gap: 8px; justify-content: space-between; }.event-head time { color: #657789; white-space: nowrap; font-size: 9px; }.event p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }.event small { color: #657789; }
  .photos { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }.photos figure { margin: 0; break-inside: avoid; }.photos img { display: block; width: 100%; max-height: 85mm; object-fit: contain; border: 1px solid #cbd6df; background: #f8fafb; }.photos figcaption { margin-top: 3px; color: #657789; font-size: 9px; }
  footer { margin-top: 23px; padding-top: 7px; border-top: 1px solid #cbd6df; color: #657789; font-size: 9px; }
  .screen-only { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -17mm -15mm 15mm; padding: 10px 15mm; color: #fff; background: #173a5d; font-size: 12px; }
  .screen-only button { border: 0; border-radius: 6px; padding: 7px 12px; color: #173a5d; background: #fff; font: 600 12px Inter,sans-serif; cursor: pointer; }
  @media screen { body { max-width: 210mm; min-height: 297mm; margin: 20px auto; padding: 17mm 15mm; box-shadow: 0 5px 30px #0002; } }
  @media print { .screen-only { display: none; } }
</style></head><body>
<div class="watermarks" aria-hidden="true"><span>DSIDEIN OFFICE</span><span>DSIDEIN OFFICE</span><span>DSIDEIN OFFICE</span></div>
<div class="screen-only"><span>Print → Save as PDF to download this record.</span><button type="button" id="print-record">Print / Save PDF</button></div>
<div class="document"><header><div class="brand">dsidein Office<small>Application record · ਅਰਜ਼ੀ ਦਾ ਰਿਕਾਰਡ</small></div><div class="reference"><b>${escapeHtml(number)}</b><span>Generated ${escapeHtml(generatedAt)}</span></div></header>
<h1>${escapeHtml(a.name)}</h1><p class="subtitle">${escapeHtml(a.intake_source === "online" ? "Online application · ਆਨਲਾਈਨ ਅਰਜ਼ੀ" : "Office application · ਦਫ਼ਤਰੀ ਅਰਜ਼ੀ")}${filled(creator) ? ` · Registered by ${escapeHtml(creator)}` : ""}</p>
<div class="summary"><div><span>Status · ਸਥਿਤੀ</span><b>${escapeHtml(status)}</b></div><div><span>Received · ਮਿਲੀ</span><b>${escapeHtml(a.created_at_display)}</b></div><div><span>Last updated · ਆਖਰੀ ਬਦਲਾਅ</span><b>${escapeHtml(a.updated_at_display)}</b></div></div>
<section><h2>Applicant · ਅਰਜ਼ੀਕਰਤਾ</h2><dl>${applicant}</dl></section>
<section><h2>Problem / enquiry · ਸਮੱਸਿਆ / ਪੁੱਛਗਿੱਛ</h2><p class="problem">${escapeHtml(details || "—")}</p><dl class="meta">${field("Category · ਸ਼੍ਰੇਣੀ", a.category)}${field("Reference · ਹਵਾਲਾ", a.reference)}</dl></section>
<section><h2>Assignment · ਸੌਂਪਣਾ</h2><dl>${assignment}</dl></section>
<section><h2>History · ਪੂਰਾ ਇਤਿਹਾਸ</h2>${history ? `<ol class="history">${history}</ol>` : "<p>No history yet · ਅਜੇ ਕੋਈ ਇਤਿਹਾਸ ਨਹੀਂ</p>"}</section>
${photos ? `<section><h2>Images · ਤਸਵੀਰਾਂ</h2><div class="photos">${photos}</div></section>` : ""}
<footer>${escapeHtml(number)} · dsidein Office · Contains personal information; handle with care.</footer></div></body></html>`;
}
