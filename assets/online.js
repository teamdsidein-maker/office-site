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

try {
  const response = await fetch(endpoint, { headers });
  if (!response.ok) throw new Error();
  const { constituencies, categories } = await response.json();
  field("constituency_id").innerHTML = '<option value="">ਆਪਣਾ ਹਲਕਾ ਚੁਣੋ · Choose your Halka</option>' +
    constituencies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name_pa || c.name)} · ${escapeHtml(c.name)}</option>`).join("");
  field("category").innerHTML = '<option value="">ਸਮੱਸਿਆ ਦੀ ਕਿਸਮ ਚੁਣੋ · Select problem type</option>' +
    categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name_pa || c.name)} · ${escapeHtml(c.name)}</option>`).join("");
  if (!constituencies.length || !categories.length) errorBox.textContent = "The form is temporarily unavailable. Please try again later.";
  else button.disabled = false;
} catch {
  errorBox.textContent = "Could not load form options. Please try again later.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  const data = Object.fromEntries(["constituency_id", "name", "voter_id", "mobile", "village", "category", "details", "website"]
    .map((name) => [name, field(name).value.trim()]));
  if (!data.constituency_id || data.name.length < 2 || !/^[6-9][0-9]{9}$/.test(data.mobile) || !data.category || data.details.length < 10 || !field("consent").checked) {
    errorBox.textContent = "Choose your Halka and problem type, then enter your name, mobile number, problem details, and consent.";
    const missing = !data.constituency_id ? field("constituency_id") : data.name.length < 2 ? field("name") : !/^[6-9][0-9]{9}$/.test(data.mobile) ? field("mobile") : !data.category ? field("category") : data.details.length < 10 ? field("details") : field("consent");
    missing.focus();
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not submit. Please try again.");
    document.querySelector("#reference").textContent = result.reference;
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
