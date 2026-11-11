import "./custom-select.js";
import { supabaseUrl, supabaseAnonKey } from "./config.js";

const endpoint = `${supabaseUrl}/functions/v1/online-intake`;
const form = document.querySelector("#online-form");
const errorBox = document.querySelector("#form-error");
const button = document.querySelector("#submit-button");
button.disabled = true;
const field = (name) => form.elements.namedItem(name);
const headers = { apikey: supabaseAnonKey };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fixedHalka = new URLSearchParams(location.search).get("halka") === "raja-sansi";
let fixedHalkaAvailable = true;
const imageInput = field("images");
const photos = () => Array.from(imageInput.files || []);

function showPhotos() {
  const files = photos();
  document.querySelector("#photo-list").textContent = files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} selected: ${files.map((file) => file.name).join(", ")}` : "";
  document.querySelector("#photo-help").classList.toggle("intake-invalid", files.length > 3);
}
imageInput.addEventListener("change", showPhotos);

async function toJpeg(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose JPEG, PNG or WebP photos.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(`Could not open ${file.name}. Choose another photo.`); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.58]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 2 * 1024 * 1024) return blob;
    }
    throw new Error(`${file.name} is too large. Try a smaller photo.`);
  } finally { bitmap.close(); }
}

try {
  const response = await fetch(endpoint, { headers });
  if (!response.ok) throw new Error();
  const { constituencies, categories } = await response.json();
  field("constituency_id").innerHTML = '<option value="">ਆਪਣਾ ਹਲਕਾ ਚੁਣੋ · Choose your Halka</option>' +
    constituencies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name_pa || c.name)} · ${escapeHtml(c.name)}</option>`).join("");
  if (fixedHalka) {
    const rajaSansi = constituencies.find((c) => c.name.trim().toLowerCase().replace(/\s+/g, "-") === "raja-sansi");
    if (rajaSansi) {
      field("constituency_id").value = rajaSansi.id;
      document.querySelector("#halka-field").hidden = true;
      document.querySelector("#form-intro").textContent = "Raja Sansi constituency office · * ਲਾਜ਼ਮੀ ਖਾਨੇ";
      document.querySelector("#done-office").innerHTML = "ਰਾਜਾ ਸਾਂਸੀ ਦਾ ਸਟਾਫ਼ ਇਸ ਨੂੰ ਦੇਖ ਕੇ ਸਬੰਧਤ ਅਧਿਕਾਰੀ ਨੂੰ ਸੌਂਪੇਗਾ।<br><small>Raja Sansi staff will review and assign your application.</small>";
    } else {
      errorBox.textContent = "Raja Sansi is not currently available. Please try again later.";
      fixedHalkaAvailable = false;
    }
  }
  field("category").innerHTML = '<option value="">ਸਮੱਸਿਆ ਦੀ ਕਿਸਮ ਚੁਣੋ · Select problem type</option>' +
    categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name_pa || c.name)} · ${escapeHtml(c.name)}</option>`).join("");
  if (!constituencies.length || !categories.length) errorBox.textContent = "The form is temporarily unavailable. Please try again later.";
  else if (fixedHalkaAvailable) button.disabled = false;
} catch {
  errorBox.textContent = "Could not load form options. Please try again later.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  const data = Object.fromEntries(["constituency_id", "name", "voter_id", "mobile", "mobile2", "village", "location", "category", "details", "website"]
    .map((name) => [name, field(name).value.trim()]));
  if (!data.constituency_id || data.name.length < 2 || !/^[6-9][0-9]{9}$/.test(data.mobile) || !data.category || data.details.length < 10 || !field("consent").checked) {
    errorBox.textContent = "Choose your Halka and problem type, then enter your name, mobile number, problem details, and consent.";
    const missing = !data.constituency_id ? field("constituency_id") : data.name.length < 2 ? field("name") : !/^[6-9][0-9]{9}$/.test(data.mobile) ? field("mobile") : !data.category ? field("category") : data.details.length < 10 ? field("details") : field("consent");
    missing.focus();
    return;
  }
  if (data.mobile2 && !/^[6-9][0-9]{9}$/.test(data.mobile2)) { errorBox.textContent = "Enter a valid alternate mobile number."; field("mobile2").focus(); return; }
  if (photos().length > 3) { errorBox.textContent = "Choose up to three photos."; imageInput.focus(); return; }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const body = new FormData();
    body.set("payload", JSON.stringify(data));
    for (const [index, file] of photos().entries()) body.append("images", await toJpeg(file), `photo-${index + 1}.jpg`);
    const response = await fetch(endpoint, { method: "POST", headers, body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not submit. Please try again.");
    document.querySelector("#reference").textContent = result.reference;
    document.querySelector("#image-warning").hidden = !result.imageWarning;
    document.querySelector("#form-card").hidden = true;
    document.querySelector("#done-card").hidden = false;
    document.querySelector("#done-card").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    button.removeAttribute("aria-busy");
  }
});
