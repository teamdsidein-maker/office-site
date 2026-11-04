import { supabaseUrl, supabaseAnonKey } from "./config.js";

const endpoint = `${supabaseUrl}/functions/v1/online-intake`;
const form = document.querySelector("#online-form");
const errorBox = document.querySelector("#form-error");
const button = document.querySelector("#submit-button");
const field = (name) => form.elements.namedItem(name);
const headers = { apikey: supabaseAnonKey };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

try {
  const response = await fetch(endpoint, { headers });
  if (!response.ok) throw new Error();
  const { constituencies } = await response.json();
  field("constituency_id").innerHTML = '<option value="">ਚੁਣੋ · Choose</option>' +
    constituencies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name_pa || c.name)} · ${escapeHtml(c.name)}</option>`).join("");
  if (!constituencies.length) errorBox.textContent = "No constituency is accepting applications yet.";
} catch {
  errorBox.textContent = "Could not load constituencies. Please try again later.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  const data = Object.fromEntries(["constituency_id", "name", "mobile", "village", "category", "details", "website"]
    .map((name) => [name, field(name).value.trim()]));
  if (!data.constituency_id || data.name.length < 2 || !/^[6-9][0-9]{9}$/.test(data.mobile) || data.details.length < 10 || !field("consent").checked) {
    errorBox.textContent = "Choose a constituency and enter your name, mobile number, problem details, and consent.";
    return;
  }
  button.disabled = true;
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not submit. Please try again.");
    document.querySelector("#reference").textContent = result.reference;
    document.querySelector("#form-card").hidden = true;
    document.querySelector("#done-card").style.display = "block";
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
  }
});
