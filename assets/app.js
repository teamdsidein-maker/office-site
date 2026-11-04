import { api, isDemo, LIMITS } from "./data.js";
import { ROLE_LABELS, assignableRoles, checkTarget, validMobile, validPassword } from "./rules.js";
import { canMove, noteNeeded } from "./workflow.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (v, label, sel) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(label)}</option>`;
const fmtDate = (t) => new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Punjabi first, English as the sub-line. t() = HTML (fixed text only), p() = plain text.
const t = (pa, en) => `<span class="pa">${pa}</span> <small class="en">${en}</small>`;
const p = (pa, en) => `${pa} · ${en}`;
// A saved name that may have a Punjabi version.
const named = (o) => (o?.name_pa ? t(esc(o.name_pa), esc(o.name)) : `<span class="pa">${esc(o?.name || "—")}</span>`);
const plainName = (o) => (o?.name_pa ? p(o.name_pa, o.name) : o?.name || "—");
const roleText = (r) => p(...ROLE_LABELS[r]);

const root = $("#root");
const dlg = $("#dlg");
const blankAppFilter = () => ({ q: "", status: "", dept: "", cat: "", officer: "" });
const state = {
  me: null, constituencies: [], departments: [], people: [], links: [], apps: [], appOfficers: [],
  lists: [], settings: {}, listKind: "category", picked: new Set(), section: "applications",
  cid: "", // constituency the Super Admin is working in ("*" = all, where a page allows it)
  q: "", role: "", dept: "", status: "",
  af: blankAppFilter()
};

const NAV = {
  home: ["ਮੁੱਖ ਪੰਨਾ", "Home", "M3 11l9-8 9 8M5 9.5V21h14V9.5"],
  offices: ["ਦਫ਼ਤਰ", "Offices", "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01"],
  new: ["ਨਵੀਂ ਅਰਜ਼ੀ", "New application", "M12 5v14M5 12h14"],
  reports: ["ਰਿਪੋਰਟਾਂ", "Reports", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
  lists: ["ਸੂਚੀਆਂ", "Lists", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  applications: ["ਅਰਜ਼ੀਆਂ", "Applications", "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8"],
  online: ["ਆਨਲਾਈਨ ਅਰਜ਼ੀਆਂ", "Online applications", "M4 4h16v12H4zM8 20h8M12 16v4M8 10h8"],
  constituencies: ["ਹਲਕੇ", "Constituencies", "M12 22s7-7.2 7-12a7 7 0 10-14 0c0 4.8 7 12 7 12zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"],
  departments: ["ਵਿਭਾਗ", "Departments", "M4 21V5l8-3v19M12 9l8 3v9M2 21h20M8 8v.01M8 12v.01M8 16v.01M16 15v.01M16 18v.01"],
  people: ["ਲੋਕ", "People", "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"],
  activity: ["ਗਤੀਵਿਧੀ", "Activity", "M3 12h4l3 8 4-16 3 8h4"],
  account: ["ਮੇਰਾ ਖਾਤਾ", "My account", "M12 12a5 5 0 100-10 5 5 0 000 10zM4 22a8 8 0 0116 0"]
};
const NAV_BY_ROLE = {
  main_admin: ["home", "new", "applications", "online", "reports", "offices", "constituencies", "departments", "people", "lists", "activity", "account"],
  constituency_admin: ["home", "new", "applications", "online", "reports", "offices", "departments", "people", "activity", "account"],
  staff: ["home", "new", "applications", "online", "departments", "account"],
  officer: ["home", "applications", "account"]
};
const OFFICE_KEYS = new Set(["offices", "constituencies", "departments", "people", "lists", "activity"]);
const icon = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${NAV[key][2]}"/></svg>`;

const STATUS = {
  new: ["ਨਵੀਂ", "New"],
  assigned: ["ਸੌਂਪੀ ਗਈ", "Assigned"],
  in_progress: ["ਕੰਮ ਜਾਰੀ", "In progress"],
  solved: ["ਹੱਲ ਹੋਈ", "Solved"],
  closed: ["ਬੰਦ", "Closed"],
  returned: ["ਵਾਪਸ ਭੇਜੀ", "Sent back"]
};
const STEPS = ["new", "assigned", "in_progress", "solved", "closed"];
const statusBadge = (s) => `<span class="st st-${s}">${t(...STATUS[s])}</span>`;
const appNo = (a) => `APP-${new Date(a.created_at).getFullYear()}-${String(a.no).padStart(5, "0")}`;
function ago(at) {
  const d = Math.floor((Date.now() - new Date(at).getTime()) / 864e5);
  return d <= 0 ? "ਅੱਜ · today" : d === 1 ? "1 ਦਿਨ ਪਹਿਲਾਂ · 1 day ago" : `${d} ਦਿਨ ਪਹਿਲਾਂ · ${d} days ago`;
}

// ---------- helpers ----------
function toast(text, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = text;
  $("#toasts").append(el);
  setTimeout(() => el.classList.add("out"), 2800);
  setTimeout(() => el.remove(), 3200);
}
const SAVED = p("ਸੇਵ ਹੋ ਗਿਆ", "Saved");
const isMain = () => state.me.role === "main_admin";
const isAdmin = () => ["main_admin", "constituency_admin"].includes(state.me.role);
const conById = (id) => state.constituencies.find((c) => c.id === id);
const deptById = (id) => state.departments.find((d) => d.id === id);
const deptsOf = (cid) => state.departments.filter((d) => d.constituency_id === cid);
const personDepts = (uid) => state.links.filter((l) => l.user_id === uid).map((l) => deptById(l.department_id)).filter(Boolean);
const deptPeople = (did) => state.links.filter((l) => l.department_id === did).map((l) => state.people.find((x) => x.id === l.user_id)).filter(Boolean);
const appPeople = (aid) => state.appOfficers.filter((o) => o.application_id === aid).map((o) => state.people.find((x) => x.id === o.user_id)).filter(Boolean);
// Pages that need one constituency can't use "all".
const workingCid = () => {
  if (!isMain()) return state.me.constituency_id;
  if (state.cid === "*") state.cid = state.constituencies[0]?.id || "";
  return state.cid;
};
const roleBadge = (r) => `<span class="badge r-${r}">${t(...ROLE_LABELS[r])}</span>`;
const onOff = (active) => `<span class="dot ${active ? "on" : "off"}">${active ? t("ਚਾਲੂ", "Active") : t("ਬੰਦ", "Off")}</span>`;
const OPEN = ["new", "assigned", "in_progress", "returned"];
const countStatus = (list, ...st) => list.filter((a) => st.includes(a.status)).length;

function makePassword() {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(out, (n) => abc[n % abc.length]).join("");
}

async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { console.error(err); toast(err.message || p("ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ", "Something went wrong"), "err"); throw err; }
  finally { if (btn) btn.disabled = false; }
}

async function reload() {
  const [constituencies, departments, people, links, apps, appOfficers, lists, settings] = await Promise.all([
    api.listConstituencies(), api.listDepartments(), api.listPeople(), api.listLinks(),
    api.listApplications(), api.listApplicationOfficers(), api.listItems(), api.getSettings()
  ]);
  Object.assign(state, { constituencies, departments, people, links, apps, appOfficers, lists, settings });
  if (isMain() && state.cid !== "*" && !conById(state.cid)) state.cid = constituencies[0]?.id || "";
}

// ---------- login ----------
function showLogin(message = "") {
  const demoRow = (m, r) => `<button type="button" class="btn sm" data-demo="${m}">${t(...ROLE_LABELS[r])}</button>`;
  root.innerHTML = `
    <main class="login">
      <form class="login-card" id="login-form" novalidate>
        <img src="assets/icons/icon-192.png" alt="" class="login-logo">
        <h1>${t("ਦਫ਼ਤਰ ਪ੍ਰਬੰਧ", "dsidein Office")}</h1>
        <p class="stack">${t("ਆਪਣੇ ਐਡਮਿਨ ਵੱਲੋਂ ਦਰਜ ਮੋਬਾਈਲ ਨੰਬਰ ਨਾਲ ਲੌਗਇਨ ਕਰੋ।", "Log in with the mobile number your admin registered.")}</p>
        <label class="fl"><span>${t("ਮੋਬਾਈਲ ਨੰਬਰ", "Mobile number")}</span><input class="inp" id="mobile" inputmode="numeric" maxlength="10" autocomplete="username" required></label>
        <label class="fl"><span>${t("ਪਾਸਵਰਡ", "Password")}</span><input class="inp" id="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary wide" id="login-btn">${t("ਲੌਗਇਨ ਕਰੋ", "Log in")}</button>
        <a class="btn wide" href="apply/">${t("ਆਪਣੀ ਸਮੱਸਿਆ ਦਰਜ ਕਰੋ", "Submit a problem online")}</a>
        <p class="err" id="login-msg" role="alert">${esc(message)}</p>
        <p class="stack center small">${t("ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ? ਆਪਣੇ ਐਡਮਿਨ ਨੂੰ ਕਹੋ।", "Forgot your password? Ask your admin to reset it.")}</p>
        ${isDemo ? `<div class="demo-box">
          <strong>${p("ਡੈਮੋ", "Demo")}</strong>: ${p("ਹਰ ਪੱਧਰ ਅਜ਼ਮਾਓ", "try each level")}
          <div class="demo-btns">${demoRow("9000000001", "main_admin")}${demoRow("9000000002", "constituency_admin")}${demoRow("9000000004", "staff")}${demoRow("9000000005", "officer")}</div>
        </div>` : ""}
      </form>
    </main>`;
  const msg = $("#login-msg");
  const go = async (mobile, password) => {
    msg.textContent = "";
    const btn = $("#login-btn");
    btn.disabled = true;
    try { await api.signIn(mobile, password); await start(); }
    catch (err) { msg.textContent = err.message; btn.disabled = false; }
  };
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const mobile = $("#mobile").value.trim(), password = $("#password").value;
    if (!validMobile(mobile)) { msg.textContent = p("ਆਪਣਾ 10 ਅੰਕਾਂ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ ਲਿਖੋ", "Enter your 10-digit mobile number"); return; }
    if (!password) { msg.textContent = p("ਪਾਸਵਰਡ ਲਿਖੋ", "Enter your password"); return; }
    go(mobile, password);
  });
  root.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => go(b.dataset.demo, "demo")));
}

const PW_SHORT = p("ਪਾਸਵਰਡ ਘੱਟੋ-ਘੱਟ 8 ਅੱਖਰਾਂ ਦਾ ਹੋਵੇ", "The password must be at least 8 characters");
const PW_DIFF = p("ਦੋਵੇਂ ਪਾਸਵਰਡ ਇੱਕੋ ਜਿਹੇ ਨਹੀਂ", "The two passwords don't match");

function showChangePassword() {
  root.innerHTML = `
    <main class="login">
      <form class="login-card" id="pw-form" novalidate>
        <img src="assets/icons/icon-192.png" alt="" class="login-logo">
        <h1>${t("ਆਪਣਾ ਪਾਸਵਰਡ ਬਣਾਓ", "Set your own password")}</h1>
        <p class="stack">${t("ਐਡਮਿਨ ਨੇ ਤੁਹਾਨੂੰ ਆਰਜ਼ੀ ਪਾਸਵਰਡ ਦਿੱਤਾ ਸੀ। ਹੁਣ ਨਵਾਂ ਚੁਣੋ ਜੋ ਸਿਰਫ਼ ਤੁਹਾਨੂੰ ਪਤਾ ਹੋਵੇ।", "Your admin gave you a temporary password. Choose a new one that only you know.")}</p>
        <label class="fl"><span>${t("ਨਵਾਂ ਪਾਸਵਰਡ", "New password (at least 8 characters)")}</span><input class="inp" id="pw1" type="password" autocomplete="new-password"></label>
        <label class="fl"><span>${t("ਦੁਬਾਰਾ ਲਿਖੋ", "Type it again")}</span><input class="inp" id="pw2" type="password" autocomplete="new-password"></label>
        <button class="btn primary wide" id="pw-btn">${t("ਸੇਵ ਕਰੋ", "Save password")}</button>
        <p class="err" id="pw-msg" role="alert"></p>
        <button type="button" class="link center" id="pw-out">${t("ਲੌਗਆਊਟ", "Log out")}</button>
      </form>
    </main>`;
  $("#pw-out").addEventListener("click", signOut);
  $("#pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#pw-msg"), a = $("#pw1").value, b = $("#pw2").value;
    if (!validPassword(a)) { msg.textContent = PW_SHORT; return; }
    if (a !== b) { msg.textContent = PW_DIFF; return; }
    const btn = $("#pw-btn");
    btn.disabled = true;
    try { await api.changePassword(a); toast(SAVED, "ok"); await start(); }
    catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
}

async function signOut() {
  await api.signOut();
  // nothing from this person's session carries over to the next login on this browser
  Object.assign(state, { me: null, cid: "", q: "", role: "", dept: "", status: "", af: blankAppFilter(), section: "applications", apps: [], appOfficers: [], shown: [], people: [], pageKey: undefined });
  state.picked.clear();
  location.hash = "";
  showLogin();
}

// ---------- shell ----------
function shell() {
  const me = state.me, items = NAV_BY_ROLE[me.role];
  const label = (k) => (k === "applications" && me.role === "officer" ? ["ਮੇਰਾ ਕੰਮ", "My work"] : NAV[k]);
  const link = (k) => `<a href="#/${k}" data-nav="${k}">${icon(k)}<span class="nav-label"><span class="pa">${label(k)[0]}</span><small class="en">${label(k)[1]}</small></span>${k === "applications" ? `<b class="nb" hidden></b>` : ""}</a>`;
  const scope = me.role === "main_admin" ? p("ਸਾਰੇ ਹਲਕੇ", "All constituencies") : plainName(conById(me.constituency_id));
  root.innerHTML = `
    <div class="app">
      <aside class="side">
        <div class="side-brand"><img src="assets/icons/icon-192.png" alt=""><div><strong>ਦਫ਼ਤਰ ਪ੍ਰਬੰਧ</strong><small>${esc(scope)}</small></div></div>
        <nav class="side-nav">${items.map(link).join("")}</nav>
        <div class="side-me">
          <div><strong>${esc(me.full_name)}</strong><small>${esc(roleText(me.role))}</small></div>
          <button class="btn sm ghost-light" id="logout">${p("ਲੌਗਆਊਟ", "Log out")}</button>
        </div>
      </aside>
      <div class="main">
        <header class="mobile-top">
          <img src="assets/icons/icon-192.png" alt=""><div><strong>${esc(me.full_name)}</strong><small>${esc(roleText(me.role))}</small></div>
          <button class="btn sm" id="logout-m">${p("ਲੌਗਆਊਟ", "Log out")}</button>
        </header>
        ${me.role === "officer" ? "" : `<div class="section-bar">
          <div class="section-tabs">
            <a href="#/home" data-sec="applications">${NAV.applications[2] ? icon("applications") : ""}<span>${t("ਅਰਜ਼ੀਆਂ", "Applications")}</span></a>
            <a href="${me.role === "staff" ? "#/departments" : "#/offices"}" data-sec="offices">${icon("offices")}<span>${t("ਦਫ਼ਤਰ", "Offices")}</span></a>
          </div>
          <form class="top-search" id="top-search" role="search">
            <input class="inp" id="top-q" type="search" placeholder="${esc(p("ਅਰਜ਼ੀ ਖੋਜੋ: ਨਾਮ, ਮੋਬਾਈਲ, ਨੰਬਰ", "Find application: name, mobile, no."))}" aria-label="${esc(p("ਅਰਜ਼ੀ ਖੋਜੋ", "Find application"))}">
          </form>
        </div>`}
        ${isDemo ? `<div class="demo-bar">${p("ਡੈਮੋ: ਡਾਟਾ ਸਿਰਫ਼ ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਹੈ, ਅਰਜ਼ੀਆਂ ਨਮੂਨੇ ਦੀਆਂ ਹਨ", "Demo: data stays in this browser, applications are samples")}</div>` : ""}
        <div class="view" id="view"></div>
      </div>
      <nav class="bottom-nav">${items.map(link).join("")}</nav>
    </div>`;
  $("#logout").addEventListener("click", signOut);
  $("#logout-m").addEventListener("click", signOut);
  // A menu or section click starts with clean filters.
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-nav], [data-sec]")) { state.af = blankAppFilter(); state.picked.clear(); }
  });
  $("#top-search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#top-q").value.trim();
    if (!q) return;
    goApps({ q, cid: isMain() ? "*" : undefined });
    $("#top-q").value = "";
  });
  $("#view").addEventListener("click", onClick);
  $("#view").addEventListener("input", onInput);
  $("#view").addEventListener("change", onInput);
  $("#view").addEventListener("submit", onSubmit);
}

const SCREENS = { home: renderHome, offices: renderOffices, new: () => renderAppForm(), applications: renderApplications, online: renderOnlineApplications, reports: renderReports, constituencies: renderConstituencies, departments: renderDepartments, people: renderPeople, lists: renderLists, activity: renderActivity, account: renderAccount };

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function playEnter() {
  const v = $("#view");
  if (!v || calm()) return;
  v.classList.remove("enter");
  void v.offsetWidth;
  v.classList.add("enter");
  clearTimeout(playEnter.t);
  playEnter.t = setTimeout(() => v.classList.remove("enter"), 800);
  requestAnimationFrame(() => {
    v.querySelectorAll(".stat b").forEach((el) => {
      const n = Number(el.textContent);
      if (!Number.isFinite(n) || n <= 0) return;
      const t0 = performance.now(), run = (now) => {
        const k = Math.min(1, (now - t0) / 550);
        el.textContent = Math.round(n * (1 - (1 - k) ** 3));
        if (k < 1 && el.isConnected) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    });
  });
}
function goApps({ status = "", dept = "", officer = "", q = "", cid } = {}) {
  state.af = { ...blankAppFilter(), status, dept, officer, q };
  state.picked.clear();
  if (isMain() && cid !== undefined) state.cid = cid;
  if (location.hash === "#/applications") { route(); window.scrollTo({ top: 0 }); }
  else location.hash = "#/applications";
}

function route() {
  if (!state.me || !$("#view")) return;
  const allowed = NAV_BY_ROLE[state.me.role];
  const [first, id, sub] = location.hash.replace(/^#\/?/, "").split("/");
  const key = allowed.includes(first) ? first : "home";
  root.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
  if (key !== "account") state.section = OFFICE_KEYS.has(key) ? "offices" : "applications";
  root.querySelectorAll("[data-sec]").forEach((a) => a.classList.toggle("on", a.dataset.sec === state.section));
  if (state.me.role !== "officer") root.querySelectorAll("[data-nav]").forEach((a) => {
    const k = a.dataset.nav;
    a.hidden = !(k === "account" || (state.section === "offices") === OFFICE_KEYS.has(k));
  });
  root.querySelector(".bottom-nav a.active")?.scrollIntoView({ inline: "center", block: "nearest" });
  const pageChanged = state.pageKey !== location.hash;
  state.pageKey = location.hash;
  if (pageChanged) { state.picked.clear(); playEnter(); }
  state.screen = key;
  state.detail = id || "";
  const waiting = needsAttention();
  root.querySelectorAll(".nb").forEach((b) => { b.textContent = waiting; b.hidden = !waiting; });
  if (key === "applications" && id && sub === "edit") return renderAppForm(state.apps.find((a) => a.id === id));
  if (key === "applications" && id) return renderApplicationDetail(id);
  if (key === "departments" && id) return renderDepartmentDetail(id);
  SCREENS[key]();
}
window.addEventListener("hashchange", () => { route(); window.scrollTo({ top: 0 }); });

const head = (title, sub = "", actions = "") => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="stack">${sub}</p>` : ""}</div>${actions ? `<div class="head-actions">${actions}</div>` : ""}</div>`;
const stat = (label, n) => `<div class="stat"><span>${label}</span><b>${n}</b></div>`;
const conPicker = (allowAll = false) => (isMain() ? `<label class="fl picker"><span>${t("ਹਲਕਾ", "Constituency")}</span><select class="inp" id="pick-con">${allowAll ? opt("*", p("ਸਾਰੇ ਹਲਕੇ", "All constituencies"), state.cid) : ""}${state.constituencies.map((c) => opt(c.id, plainName(c) + (c.active ? "" : ` (${p("ਬੰਦ", "off")})`), state.cid)).join("")}</select></label>` : "");

// ---------- home ----------
function renderHome() {
  ({ main_admin: homeMain, constituency_admin: homeAdmin, staff: homeStaff, officer: homeOfficer })[state.me.role]();
}
const countRole = (r, cid) => state.people.filter((x) => x.role === r && x.active && (!cid || x.constituency_id === cid)).length;
const attention = () => liveApps().filter((a) => (state.me.role === "officer" ? a.status === "assigned" : ["new", "returned"].includes(a.status)));
const statLink = (label, n, attrs) => `<button class="stat" data-act="go-apps" ${attrs}><span>${label}</span><b>${n}</b></button>`;
// attrs: which applications the cards should open, e.g. one department or constituency
const appStats = (list, attrs = "") => `<div class="stats">
    ${statLink(t("ਕੁੱਲ ਅਰਜ਼ੀਆਂ", "Total applications"), list.length, attrs)}
    ${statLink(t("ਨਵੀਆਂ", "New"), countStatus(list, "new"), `data-status="new" ${attrs}`)}
    ${statLink(t("ਕੰਮ ਜਾਰੀ", "In progress"), countStatus(list, "assigned", "in_progress"), `data-status="working" ${attrs}`)}
    ${statLink(t("ਹੱਲ ਹੋਈਆਂ", "Solved"), countStatus(list, "solved", "closed"), `data-status="done" ${attrs}`)}
  </div>`;
const feedBox = () => `<h2 class="sec">${t("ਕੀ ਹੋ ਰਿਹਾ ਹੈ", "What's happening")}</h2><div class="list" id="feed"><div class="row muted small">…</div></div>`;
async function loadFeed() {
  try {
    const events = await api.listRecentEvents(10);
    const el = $("#feed");
    if (!el) return;
    const rows = events.map((e) => ({ e, a: state.apps.find((x) => x.id === e.application_id) })).filter((r) => r.a);
    el.innerHTML = rows.map(({ e, a }) => `<div class="row feed-row" data-href="#/applications/${esc(a.id)}">
        <div class="row-main"><span class="app-no">${appNo(a)}</span>
          <strong>${esc(a.name)}</strong>
          ${e.note ? `<p class="app-text one">${esc(e.note)}</p>` : ""}
          <small>${esc(e.actor_name || "—")} · ${esc(ago(e.at))}</small></div>
        ${e.to_status ? statusBadge(e.to_status) : `<span class="st st-note">${t("ਨੋਟ", "Note")}</span>`}
      </div>`).join("") || `<div class="row muted">${p("ਅਜੇ ਕੁਝ ਨਹੀਂ", "Nothing yet")}</div>`;
  } catch (err) { console.error(err); }
}

function homeMain() {
  const live = liveApps(), delayed = live.filter(isDelayed).length, revisit = live.filter(isRevisitDue).length;
  $("#view").innerHTML = `
    ${head(esc(state.me.full_name), t("ਸਾਰੇ ਹਲਕਿਆਂ ਦੀਆਂ ਅਰਜ਼ੀਆਂ", "Applications across all constituencies"), `<a class="btn" href="#/applications">${t("ਸਾਰੀਆਂ ਅਰਜ਼ੀਆਂ", "All applications")}</a><a class="btn primary" href="#/new">+ ${t("ਨਵੀਂ ਅਰਜ਼ੀ", "New application")}</a>`)}
    ${appStats(live, `data-cid="*"`)}
    ${alertCards(delayed, revisit, `data-cid="*"`)}
    <h2 class="sec">${t("ਹਲਕੇ ਮੁਤਾਬਕ ਅਰਜ਼ੀਆਂ", "Applications by constituency")}</h2>
    ${state.constituencies.length ? `<div class="cards">${state.constituencies.map(conAppCard).join("")}</div>`
      : `<div class="empty panel"><h2>${t("ਅਜੇ ਕੋਈ ਹਲਕਾ ਨਹੀਂ", "No constituencies yet")}</h2><a class="btn primary" href="#/constituencies">${t("ਹਲਕਾ ਜੋੜੋ", "Add constituency")}</a></div>`}
    ${attentionList()}
    ${feedBox()}`;
  loadFeed();
}
const alertCards = (delayed, revisit, attrs = "") => (delayed || revisit ? `<div class="alert-row">
    ${delayed ? `<button class="alert late" data-act="go-apps" data-status="delayed" ${attrs}><b>${delayed}</b>${t("ਅਰਜ਼ੀਆਂ ਵਿੱਚ ਦੇਰੀ", `delayed ${DELAY_DAYS}+ days`)}</button>` : ""}
    ${revisit ? `<button class="alert due" data-act="go-apps" data-status="revisit" ${attrs}><b>${revisit}</b>${t("ਦੁਬਾਰਾ ਮਿਲਣਾ ਬਾਕੀ", "re-visits due")}</button>` : ""}
  </div>` : "");
function conAppCard(c) {
  const apps = liveApps().filter((a) => a.constituency_id === c.id);
  return `<button class="card${c.active ? "" : " off"}" data-act="go-apps" data-cid="${esc(c.id)}">
    <span class="card-title stack">${named(c)}</span>
    <span class="card-big"><b>${countStatus(apps, ...OPEN)}</b> ${p("ਖੁੱਲ੍ਹੀਆਂ ਅਰਜ਼ੀਆਂ", "open applications")}</span>
    <span class="card-nums">
      <span><b>${countStatus(apps, "new")}</b> ${p("ਨਵੀਆਂ", "new")}</span>
      <span><b>${countStatus(apps, "assigned", "in_progress")}</b> ${p("ਜਾਰੀ", "working")}</span>
      <span><b>${countStatus(apps, "solved", "closed")}</b> ${p("ਹੱਲ", "solved")}</span>
    </span>
    ${c.active ? "" : `<span class="tag">${p("ਬੰਦ", "Off")}</span>`}
  </button>`;
}
const officeStat = (label, n, href, attrs = "") => `<a class="stat" href="${href}" ${attrs}><span>${label}</span><b>${n}</b></a>`;
async function renderOffices() {
  const main = isMain(), cid = state.me.constituency_id;
  $("#view").innerHTML = main ? `
    ${head(t("ਦਫ਼ਤਰ", "Offices"), t("ਹਲਕੇ, ਵਿਭਾਗ ਅਤੇ ਲੋਕ।", "Constituencies, departments and people."), `<a class="btn primary" href="#/constituencies">+ ${t("ਹਲਕਾ ਜੋੜੋ", "Add constituency")}</a>`)}
    <div class="stats">
      ${officeStat(t("ਹਲਕੇ", "Constituencies"), state.constituencies.filter((c) => c.active).length, "#/constituencies")}
      <button class="stat" data-act="go-people" data-role="constituency_admin"><span>${t("ਹਲਕਾ ਐਡਮਿਨ", "Admins")}</span><b>${countRole("constituency_admin")}</b></button>
      <button class="stat" data-act="go-people" data-role="staff"><span>${t("ਸਟਾਫ਼", "Staff")}</span><b>${countRole("staff")}</b></button>
      <button class="stat" data-act="go-people" data-role="officer"><span>${t("ਅਧਿਕਾਰੀ", "Officers")}</span><b>${countRole("officer")}</b></button>
    </div>
    <h2 class="sec">${t("ਹਲਕੇ", "Constituencies")}</h2>
    ${state.constituencies.length ? `<div class="cards">${state.constituencies.map(conCard).join("")}</div>`
      : `<div class="empty panel"><h2>${t("ਅਜੇ ਕੋਈ ਹਲਕਾ ਨਹੀਂ", "No constituencies yet")}</h2></div>`}
    <section class="panel usage"><h2>${t("ਮੁਫ਼ਤ ਪਲਾਨ ਦੀ ਥਾਂ", "Free-plan space")}</h2><div id="usage" class="small">…</div></section>` : `
    ${head(named(conById(cid)), t("ਤੁਹਾਡਾ ਦਫ਼ਤਰ", "Your office"), `<button class="btn primary" data-act="add-person">+ ${t("ਨਵਾਂ ਵਿਅਕਤੀ", "Register a person")}</button>`)}
    <div class="stats">
      ${officeStat(t("ਵਿਭਾਗ", "Departments"), deptsOf(cid).filter((d) => d.active).length, "#/departments")}
      <button class="stat" data-act="go-people" data-role="officer"><span>${t("ਅਧਿਕਾਰੀ", "Officers")}</span><b>${countRole("officer", cid)}</b></button>
      <button class="stat" data-act="go-people" data-role="staff"><span>${t("ਸਟਾਫ਼", "Staff")}</span><b>${countRole("staff", cid)}</b></button>
    </div>
    ${deptTable(deptsOf(cid).filter((d) => d.active))}`;
  if (!main) return;
  try {
    const [used, images] = await Promise.all([api.dbUsage(), api.storageUsage()]);
    const bar = (label, bytes, limit, limitText) => {
      const pct = Math.min(100, Math.round((bytes / limit) * 100));
      return `<div class="meter${pct >= 80 ? " warn" : ""}"><i style="width:${pct}%"></i></div>
      <p>${label}: ${(bytes / 1048576).toFixed(0)} MB / ${limitText} (${pct}%)${pct >= 80 ? ` <strong>${p("Supabase Pro ਲੈਣ ਦਾ ਸਮਾਂ", "Time to upgrade to Supabase Pro")}</strong>` : ""}</p>`;
    };
    const el = $("#usage");
    if (el) el.innerHTML = bar(p("ਡਾਟਾਬੇਸ", "Database"), used, LIMITS.dbBytes, "500 MB") + bar(p("ਤਸਵੀਰਾਂ", "Images"), images, LIMITS.imageBytes, "1 GB");
  } catch { const el = $("#usage"); if (el) el.textContent = p("ਪੜ੍ਹਿਆ ਨਹੀਂ ਗਿਆ", "Could not read the size"); }
}
function conCard(c) {
  const admin = state.people.find((x) => x.role === "constituency_admin" && x.constituency_id === c.id && x.active);
  const apps = liveApps().filter((a) => a.constituency_id === c.id);
  return `<button class="card${c.active ? "" : " off"}" data-act="open-con" data-id="${esc(c.id)}">
    <span class="card-title stack">${named(c)}</span>
    <span class="card-meta">${admin ? `${p("ਐਡਮਿਨ", "Admin")}: ${esc(admin.full_name)}` : `<em class="warn-text">${p("ਅਜੇ ਐਡਮਿਨ ਨਹੀਂ", "No admin yet")}</em>`}</span>
    <span class="card-big"><b>${countStatus(apps, ...OPEN)}</b> ${p("ਖੁੱਲ੍ਹੀਆਂ ਅਰਜ਼ੀਆਂ", "open applications")}</span>
    <span class="card-nums">
      <span><b>${deptsOf(c.id).filter((d) => d.active).length}</b> ${p("ਵਿਭਾਗ", "depts")}</span>
      <span><b>${countRole("officer", c.id)}</b> ${p("ਅਧਿਕਾਰੀ", "officers")}</span>
      <span><b>${countRole("staff", c.id)}</b> ${p("ਸਟਾਫ਼", "staff")}</span>
    </span>
    ${c.active ? "" : `<span class="tag">${p("ਬੰਦ", "Off")}</span>`}
  </button>`;
}
function homeAdmin() {
  const cid = state.me.constituency_id, live = liveApps();
  $("#view").innerHTML = `
    ${head(named(conById(cid)), esc(state.me.full_name), `<a class="btn" href="#/applications">${t("ਸਾਰੀਆਂ ਅਰਜ਼ੀਆਂ", "All applications")}</a><a class="btn primary" href="#/new">+ ${t("ਨਵੀਂ ਅਰਜ਼ੀ", "New application")}</a>`)}
    ${appStats(live)}
    ${alertCards(live.filter(isDelayed).length, live.filter(isRevisitDue).length)}
    ${attentionList()}
    ${feedBox()}`;
  loadFeed();
}
function attentionList() {
  const list = attention();
  return list.length ? `<h2 class="sec">${state.me.role === "officer" ? t("ਨਵਾਂ ਕੰਮ", "New work") : t("ਧਿਆਨ ਦੀ ਲੋੜ", "Needs attention")}</h2>${appList(list.slice(0, 8))}` : "";
}
function homeStaff() {
  const cid = state.me.constituency_id;
  $("#view").innerHTML = `
    ${head(esc(state.me.full_name), named(conById(cid)), `<a class="btn primary" href="#/new">+ ${t("ਨਵੀਂ ਅਰਜ਼ੀ", "New application")}</a>`)}
    ${appStats(liveApps())}
    ${attentionList()}
    ${feedBox()}`;
  loadFeed();
}
function homeOfficer() {
  const mine = personDepts(state.me.id);
  $("#view").innerHTML = `
    ${head(esc(state.me.full_name), named(conById(state.me.constituency_id)), `<a class="btn primary" href="#/applications">${t("ਮੇਰਾ ਕੰਮ", "My work")}</a>`)}
    ${appStats(liveApps())}
    <section class="panel"><h2>${t("ਤੁਹਾਡੇ ਵਿਭਾਗ", "Your departments")}</h2>
      ${mine.length ? `<div class="chips">${mine.map((d) => `<button class="chip chip-btn" data-act="go-apps" data-dept="${esc(d.id)}">${esc(plainName(d))}</button>`).join("")}</div>` : `<p class="stack">${t("ਤੁਹਾਨੂੰ ਅਜੇ ਕਿਸੇ ਵਿਭਾਗ ਵਿੱਚ ਨਹੀਂ ਜੋੜਿਆ।", "You haven't been added to a department yet.")}</p>`}
    </section>
    ${attentionList()}
    ${feedBox()}`;
  loadFeed();
}
function deptTable(list) {
  const clickable = state.me.role !== "officer";
  return `<h2 class="sec">${t("ਵਿਭਾਗ ਅਤੇ ਅਧਿਕਾਰੀ", "Departments and officers")}</h2><div class="list">
    ${list.map((d) => {
      const ppl = deptPeople(d.id).filter((x) => x.active);
      const inner = `<div class="row-main stack"><strong>${named(d)}</strong><small>${ppl.length ? ppl.map((x) => esc(x.full_name)).join(", ") : `<em class="warn-text">${p("ਅਜੇ ਅਧਿਕਾਰੀ ਨਹੀਂ", "No officer yet")}</em>`}</small></div>${clickable ? deptCounts(d.id) : `<span class="count">${ppl.length}</span>`}`;
      return clickable ? `<a class="row link-row" href="#/departments/${esc(d.id)}">${inner}</a>` : `<div class="row">${inner}</div>`;
    }).join("") || `<div class="row muted">${p("ਅਜੇ ਕੋਈ ਵਿਭਾਗ ਨਹੀਂ", "No departments yet")}</div>`}
  </div>`;
}
function deptCounts(did) {
  const list = liveApps().filter((a) => a.department_id === did);
  return `<span class="mini-counts">
    <span class="mc" title="${esc(p("ਖੁੱਲ੍ਹੀਆਂ", "Open"))}"><b>${countStatus(list, ...OPEN)}</b><small>${p("ਖੁੱਲ੍ਹੀਆਂ", "open")}</small></span>
    <span class="mc" title="${esc(p("ਹੱਲ ਹੋਈਆਂ", "Solved"))}"><b>${countStatus(list, "solved", "closed")}</b><small>${p("ਹੱਲ", "solved")}</small></span>
  </span>`;
}

// ---------- applications: helpers ----------
const DELAY_DAYS = 7;
const liveApps = () => state.apps.filter((a) => !a.deleted);
const todayStr = () => new Date().toISOString().slice(0, 10);
const isDelayed = (a) => OPEN.includes(a.status) && Date.now() - new Date(a.updated_at).getTime() > DELAY_DAYS * 864e5;
const isRevisitDue = (a) => !!a.revisit_on && a.revisit_on <= todayStr() && !["solved", "closed"].includes(a.status);
const needsAttention = () => (state.me.role === "officer"
  ? liveApps().filter((a) => a.status === "assigned").length
  : liveApps().filter((a) => ["new", "returned"].includes(a.status)).length);
const itemsOf = (kind) => state.lists.filter((i) => i.kind === kind);
const canEditApp = (a) => isAdmin() || (state.me.role === "staff" && a.status === "new");
const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "");

// Details are saved as simple formatted text; everything else is stripped before showing.
const RICH_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "BR", "P", "DIV"]);
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "SVG", "MATH", "LINK", "META"]);
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
  const walk = (node) => {
    [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) return c.remove();
      if (DROP_TAGS.has(c.tagName.toUpperCase())) return c.remove();
      walk(c);
      if (RICH_TAGS.has(c.tagName)) [...c.attributes].forEach((x) => c.removeAttribute(x.name));
      else c.replaceWith(...c.childNodes);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
function plainText(html) {
  const text = String(html ?? "").replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n");
  return new DOMParser().parseFromString(text, "text/html").body.textContent.replace(/\n{2,}/g, "\n").trim();
}

// Photos are shrunk before upload to stay within the free storage.
async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(p("ਸਿਰਫ਼ ਤਸਵੀਰ ਚੁਣੋ", "Please choose an image file"));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(p("ਇਹ ਤਸਵੀਰ ਖੁੱਲ੍ਹੀ ਨਹੀਂ", "This image could not be opened")));
      el.src = url;
    });
    const target = isDemo ? 60 * 1024 : 350 * 1024;
    let side = isDemo ? 700 : 1600, blob;
    for (let i = 0; i < 5; i++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.72));
      if (blob && blob.size <= target) break;
      side = Math.round(side * 0.75);
    }
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
async function uploadPhotos(app, files, eventId) {
  let failed = 0;
  for (const f of files) {
    try { await api.uploadImage(app, await compressImage(f), eventId); }
    catch (err) { console.error(err); failed++; toast(err.message, "err"); }
  }
  return failed;
}

// Picture slots used by the form and the update dialog. Returns the chosen files.
function photoSlots(box, count) {
  const chosen = new Array(count).fill(null);
  box.innerHTML = Array.from({ length: count }, (_, i) => `<label class="slot" data-i="${i}">
      <input type="file" accept="image/*">
      <span class="slot-empty">+ ${t("ਤਸਵੀਰ", "Image")} ${i + 1}</span>
    </label>`).join("");
  box.addEventListener("change", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot || e.target.type !== "file") return;
    const i = +slot.dataset.i, file = e.target.files[0];
    chosen[i] = file || null;
    slot.querySelector(".slot-preview")?.remove();
    slot.querySelector(".slot-empty").hidden = !!file;
    if (file) {
      if (!file.type.startsWith("image/")) { chosen[i] = null; slot.querySelector(".slot-empty").hidden = false; return toast(p("ਸਿਰਫ਼ ਤਸਵੀਰ ਚੁਣੋ", "Please choose an image file"), "err"); }
      const img = document.createElement("img");
      img.className = "slot-preview";
      img.alt = "";
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      slot.append(img);
    }
  });
  return () => chosen.filter(Boolean);
}

function showImage(src) {
  dlg.innerHTML = `<div class="dlg viewer"><header><h2>${t("ਤਸਵੀਰ", "Image")}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header><img src="${esc(src)}" alt=""></div>`;
  if (!dlg.open) dlg.showModal();
}

// ---------- applications: list ----------
const canSend = () => state.me.role !== "officer";
function appList(list, { pick = false } = {}) {
  return `<div class="list">${list.map((a) => {
    const ppl = appPeople(a.id), d = deptById(a.department_id), link = `#/applications/${esc(a.id)}`;
    const quick = !a.deleted && canMove(state.me.role, a.status, "assigned") && ["new", "returned"].includes(a.status);
    return `<div class="row app-row${a.deleted ? " is-off" : ""}${state.picked.has(a.id) ? " picked" : ""}" data-href="${link}">
      ${pick ? `<label class="pick"><input type="checkbox" data-pick="${esc(a.id)}" aria-label="${esc(appNo(a))}" ${state.picked.has(a.id) ? "checked" : ""}></label>` : ""}
      <div class="row-main">
        <a class="app-no" href="${link}">${appNo(a)}</a>
        <strong>${esc(a.name)}</strong>
        <small>${esc(a.village || "")}${isMain() ? ` · ${esc(plainName(conById(a.constituency_id)))}` : ""}</small>
        <p class="app-text">${esc(plainText(a.details))}</p>
        <div class="chips tight">
          ${d ? `<span class="chip">${esc(plainName(d))}</span>` : `<span class="chip warn">${p("ਵਿਭਾਗ ਨਹੀਂ ਸੌਂਪਿਆ", "No department yet")}</span>`}
          ${ppl.map((x) => `<span class="chip plain">${esc(x.full_name)}</span>`).join("")}
          ${isRevisitDue(a) ? `<span class="chip warn">${p("ਦੁਬਾਰਾ ਮਿਲਣਾ", "Re-visit due")}</span>` : ""}
          ${isDelayed(a) ? `<span class="chip late">${p("ਦੇਰੀ", "Delayed")}</span>` : ""}
          ${a.deleted ? `<span class="chip late">${p("ਹਟਾਈ", "Removed")}</span>` : ""}
        </div>
      </div>
      <div class="app-side">${statusBadge(a.status)}<small>${esc(ago(a.updated_at))}</small>
        ${quick ? `<button class="btn sm primary" data-act="assign" data-id="${esc(a.id)}">${p("ਭੇਜੋ", "Send")}</button>` : ""}
      </div>
    </div>`;
  }).join("") || `<div class="empty"><h2>${t("ਕੋਈ ਅਰਜ਼ੀ ਨਹੀਂ ਮਿਲੀ", "No applications found")}</h2></div>`}</div>`;
}
function statusTiles(base) {
  const list = base.filter((a) => !a.deleted);
  const tile = (key, label, n) => `<button class="tile${state.af.status === key ? " on" : ""}" data-act="af-status" data-status="${key}"><b>${n}</b><span class="stack">${label}</span></button>`;
  return `<div class="tiles">
    ${tile("", t("ਸਾਰੀਆਂ", "All"), list.length)}
    ${Object.entries(STATUS).map(([k, [pa, en]]) => tile(k, t(pa, en), countStatus(list, k))).join("")}
    ${tile("delayed", t("ਦੇਰੀ", `Delayed ${DELAY_DAYS}+ days`), list.filter(isDelayed).length)}
    ${tile("revisit", t("ਦੁਬਾਰਾ ਮਿਲਣਾ", "Re-visit due"), list.filter(isRevisitDue).length)}
    ${isAdmin() ? tile("deleted", t("ਹਟਾਈਆਂ", "Removed"), base.filter((a) => a.deleted).length) : ""}
  </div>`;
}
function filterApps(list) {
  const { q, status, dept, cat } = state.af, needle = q.trim().toLowerCase();
  return list.filter((a) => {
    if (status === "deleted") { if (!a.deleted) return false; }
    else if (a.deleted) return false;
    if (status === "working" && !["assigned", "in_progress"].includes(a.status)) return false;
    if (status === "done" && !["solved", "closed"].includes(a.status)) return false;
    if (state.af.officer && !state.appOfficers.some((o) => o.application_id === a.id && o.user_id === state.af.officer)) return false;
    if (status === "delayed" && !isDelayed(a)) return false;
    if (status === "revisit" && !isRevisitDue(a)) return false;
    if (STATUS[status] && a.status !== status) return false;
    if (dept && a.department_id !== dept) return false;
    if (cat && a.category !== cat) return false;
    if (needle) {
      const hay = [appNo(a), a.name, a.father_name, a.mobile, a.mobile2, a.voter_id, a.village, a.area, plainText(a.details)].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
function appFilters(base, showDept) {
  const cats = [...new Set(base.map((a) => a.category).filter(Boolean))].sort();
  const cid = isMain() ? state.cid : state.me.constituency_id;
  const depts = state.me.role === "officer" ? personDepts(state.me.id) : cid && cid !== "*" ? deptsOf(cid) : [];
  return `<section class="panel filters">
    ${conPicker(true)}
    <label class="fl grow"><span>${t("ਖੋਜੋ", "Search")}</span><input class="inp" id="af-q" type="search" value="${esc(state.af.q)}" placeholder="${esc(p("ਨਾਮ, ਮੋਬਾਈਲ, ਨੰਬਰ, ਪਿੰਡ", "name, mobile, no., village"))}"></label>
    ${showDept && depts.length ? `<label class="fl"><span>${t("ਵਿਭਾਗ", "Department")}</span><select class="inp" id="af-dept">${opt("", p("ਸਾਰੇ", "All"), state.af.dept)}${depts.map((d) => opt(d.id, plainName(d), state.af.dept)).join("")}</select></label>` : ""}
    ${cats.length ? `<label class="fl"><span>${t("ਸ਼੍ਰੇਣੀ", "Category")}</span><select class="inp" id="af-cat">${opt("", p("ਸਾਰੀਆਂ", "All"), state.af.cat)}${cats.map((c) => opt(c, c, state.af.cat)).join("")}</select></label>` : ""}
  </section>`;
}
function scopedApps() {
  if (!isMain() || state.cid === "*" || !state.cid) return state.apps;
  return state.apps.filter((a) => a.constituency_id === state.cid);
}
function renderApplications() {
  const base = scopedApps(), officer = state.me.role === "officer";
  $("#view").innerHTML = `
    ${head(officer ? t("ਮੇਰਾ ਕੰਮ", "My work") : t("ਅਰਜ਼ੀਆਂ", "Applications"),
      officer ? t("ਤੁਹਾਡੇ ਵਿਭਾਗ ਦੀਆਂ ਸਮੱਸਿਆਵਾਂ।", "Problems for your departments.") : t("ਹਰ ਅਰਜ਼ੀ ਕਿੱਥੇ ਪਹੁੰਚੀ, ਕਿਸ ਕੋਲ ਹੈ ਅਤੇ ਕੀ ਹੋ ਰਿਹਾ ਹੈ।", "Where every application is, who has it and what is happening."),
      `${isAdmin() ? `<button class="btn" data-act="export-apps">${t("Excel / PDF", "Export")}</button>` : ""}${officer ? "" : `<a class="btn primary" href="#/new">+ ${t("ਨਵੀਂ ਅਰਜ਼ੀ", "New application")}</a>`}`)}
    ${appFilters(base, true)}
    <div id="app-tiles">${statusTiles(base)}</div>
    <div id="app-results"></div>`;
  renderAppResults(base);
}
function renderOnlineApplications() {
  const queue = scopedApps().filter((a) => a.intake_source === "online" && a.status === "new" && !a.deleted);
  $("#view").innerHTML = `${head(t("ਆਨਲਾਈਨ ਅਰਜ਼ੀਆਂ", "Online applications"),
    t("ਲੋਕਾਂ ਵੱਲੋਂ ਭੇਜੀਆਂ ਨਵੀਆਂ ਅਰਜ਼ੀਆਂ। ਹਰ ਅਰਜ਼ੀ ਦੇਖ ਕੇ ਵਿਭਾਗ ਅਤੇ ਅਧਿਕਾਰੀ ਨੂੰ ਸੌਂਪੋ।", "New requests sent by the public. Review each one, then assign its department and officer."),
    `<button class="btn" data-act="refresh-online">${t("ਤਾਜ਼ਾ ਕਰੋ", "Refresh")}</button> <a class="btn" href="apply/" target="_blank" rel="noopener">${t("ਜਨਤਕ ਫਾਰਮ", "Public form")}</a>`)}
    <p class="muted small">${queue.length} ${p("ਸੌਂਪਣ ਲਈ", "waiting for assignment")}</p>
    ${appList(queue)}`;
}
const FILTER_LABEL = { working: ["ਕੰਮ ਜਾਰੀ", "In progress"], done: ["ਹੱਲ ਹੋਈਆਂ", "Solved"] };
function renderAppResults(base) {
  const el = $("#app-results");
  if (!el) return;
  const list = filterApps(base), total = base.filter((a) => !a.deleted).length;
  state.shown = list;
  const canPick = canSend();
  const banners = [];
  const { status, officer, q } = state.af;
  if (FILTER_LABEL[status]) banners.push(p(...FILTER_LABEL[status]));
  if (officer) banners.push(state.people.find((x) => x.id === officer)?.full_name || "");
  if (q && !$("#af-q")) banners.push(q);
  const allPicked = list.length && list.every((a) => state.picked.has(a.id));
  el.innerHTML = `
    ${banners.length ? `<div class="filter-tag"><span>${p("ਫਿਲਟਰ", "Filter")}: <b>${banners.map(esc).join(", ")}</b></span><button class="link" data-act="clear-af">✕ ${p("ਹਟਾਓ", "Clear")}</button></div>` : ""}
    <div class="result-bar"><p class="muted small result-count">${list.length} / ${total} ${p("ਅਰਜ਼ੀਆਂ", "applications")}</p>
      ${canPick && list.length ? `<button class="link" data-act="pick-all">${allPicked ? p("ਕੋਈ ਨਹੀਂ", "Select none") : p("ਸਾਰੀਆਂ ਚੁਣੋ", "Select all")}</button>` : ""}</div>
    ${appList(list, { pick: canPick })}
    <div id="pickbar"></div>`;
  updatePickbar();
}
function updatePickbar() {
  const bar = $("#pickbar");
  if (!bar) return;
  const n = (state.shown || []).filter((a) => state.picked.has(a.id)).length;
  bar.className = n ? "pickbar" : "";
  bar.innerHTML = n ? `<strong>${n} ${p("ਚੁਣੀਆਂ", "selected")}</strong>
    <div class="pick-btns">
      <button class="btn sm primary" data-act="pick-assign">${t("ਵਿਭਾਗ ਨੂੰ ਭੇਜੋ", "Send to department")}</button>
      <button class="btn sm" data-act="pick-share">${t("WhatsApp / ਕਾਪੀ", "Share")}</button>
      ${isAdmin() ? `<button class="btn sm" data-act="export-apps">Excel / PDF</button>` : ""}
      <button class="btn sm" data-act="pick-clear">✕</button>
    </div>` : "";
}
const pickedApps = () => (state.shown || []).filter((a) => state.picked.has(a.id));
function currentAppBase() {
  if (state.screen === "departments" && state.detail) return state.apps.filter((a) => a.department_id === state.detail);
  return scopedApps();
}

function renderDepartmentDetail(id) {
  const d = deptById(id);
  if (!d) { location.hash = "#/departments"; return; }
  const base = state.apps.filter((a) => a.department_id === id), live = base.filter((a) => !a.deleted);
  const officers = deptPeople(id);
  $("#view").innerHTML = `
    <a class="back" href="#/departments">← ${t("ਸਾਰੇ ਵਿਭਾਗ", "All departments")}</a>
    ${head(named(d), isMain() ? named(conById(d.constituency_id)) : "", isAdmin() ? `<button class="btn" data-act="export-apps">${t("Excel / PDF", "Export")}</button>` : "")}
    ${appStats(live, `data-dept="${esc(id)}" data-cid="${esc(d.constituency_id)}"`)}
    <h2 class="sec">${t("ਇਸ ਵਿਭਾਗ ਦੇ ਅਧਿਕਾਰੀ", "Officers in this department")}</h2>
    <div class="list">${officers.map((x) => {
      const mine = state.appOfficers.filter((o) => o.user_id === x.id).map((o) => live.find((a) => a.id === o.application_id)).filter(Boolean);
      return `<div class="row clicky" data-act="go-apps" data-officer="${esc(x.id)}" data-cid="${esc(d.constituency_id)}"><div class="row-main"><strong>${esc(x.full_name)}</strong><small><a href="tel:+91${esc(x.mobile)}">${esc(x.mobile)}</a></small></div>
        <span class="mini-counts"><span class="mc"><b>${countStatus(mine, ...OPEN)}</b><small>${p("ਖੁੱਲ੍ਹੀਆਂ", "open")}</small></span><span class="mc"><b>${countStatus(mine, "solved", "closed")}</b><small>${p("ਹੱਲ", "solved")}</small></span></span>
        ${onOff(x.active)}</div>`;
    }).join("") || `<div class="row"><em class="warn-text">${p("ਅਜੇ ਅਧਿਕਾਰੀ ਨਹੀਂ", "No officer yet")}</em></div>`}</div>
    <h2 class="sec">${t("ਇਸ ਵਿਭਾਗ ਦੀਆਂ ਅਰਜ਼ੀਆਂ", "Applications in this department")}</h2>
    <div id="app-tiles">${statusTiles(base)}</div>
    <section class="panel filters"><label class="fl grow"><span>${t("ਖੋਜੋ", "Search")}</span><input class="inp" id="af-q" type="search" value="${esc(state.af.q)}" placeholder="${esc(p("ਨਾਮ, ਮੋਬਾਈਲ, ਨੰਬਰ, ਪਿੰਡ", "name, mobile, no., village"))}"></label></section>
    <div id="app-results"></div>`;
  renderAppResults(base);
}

// ---------- applications: the form ----------
function listOptions(kind, current) {
  const items = itemsOf(kind).filter((i) => i.active || i.name === current);
  const known = items.some((i) => i.name === current);
  return opt("", p("ਚੁਣੋ", "Choose"), current || "") + (current && !known ? opt(current, current, current) : "") + items.map((i) => opt(i.name, plainName(i), current)).join("");
}
function renderAppForm(app = null) {
  if (state.me.role === "officer" || (app && !canEditApp(app))) { location.hash = app ? `#/applications/${app.id}` : "#/home"; return; }
  const v = app || {};
  const portal = safeUrl(state.settings.polling_portal_url);
  const field = (name, pa, en, attrs = "", extra = "") => `<label class="fl"><span>${t(pa, en)}${extra}</span><input class="inp" name="${name}" value="${esc(v[name])}" ${attrs}></label>`;
  const select = (name, pa, en, kind) => `<label class="fl"><span>${t(pa, en)}</span><select class="inp" name="${name}">${listOptions(kind, v[name] || "")}</select></label>`;
  const req = ` <b class="req" aria-hidden="true">*</b>`;
  const cid = v.constituency_id || (isMain() ? (state.cid !== "*" ? state.cid : "") : state.me.constituency_id);
  $("#view").innerHTML = `
    ${app ? `<a class="back" href="#/applications/${esc(app.id)}">← ${appNo(app)}</a>` : ""}
    ${head(app ? t("ਅਰਜ਼ੀ ਬਦਲੋ", "Edit application") : t("ਨਵੀਂ ਅਰਜ਼ੀ", "New application"), t("* ਵਾਲੇ ਖਾਨੇ ਲਾਜ਼ਮੀ ਹਨ।", "Fields marked * are required."))}
    <form class="panel app-form" id="app-form" novalidate>
      <div class="form-grid">
        ${field("name", "ਨਾਮ", "Name", 'maxlength="120" autocomplete="off"', req)}
        ${field("voter_id", "ਵੋਟਰ ਕਾਰਡ / EPIC ਨੰਬਰ", "Voter card / EPIC number", 'maxlength="20" autocomplete="off"')}
        ${field("father_name", "ਪਿਤਾ / ਪਤੀ ਦਾ ਨਾਮ", "Father / Husband name", 'maxlength="120" autocomplete="off"')}
        ${field("polling_station", "ਪੋਲਿੰਗ ਸਟੇਸ਼ਨ", "Polling station", 'maxlength="120" autocomplete="off"', portal ? ` <a class="portal" href="${esc(portal)}" target="_blank" rel="noopener noreferrer">${p("ਸਰਕਾਰੀ ਪੋਰਟਲ", "Govt. portal")} ↗</a>` : "")}
        ${field("mobile", "ਮੋਬਾਈਲ ਨੰਬਰ", "Mobile no.", 'inputmode="numeric" maxlength="10" autocomplete="off"', req)}
        ${isMain() && !app
          ? `<label class="fl"><span>${t("ਵਿਧਾਨ ਸਭਾ ਹਲਕਾ", "Assembly constituency")}${req}</span><select class="inp" name="constituency_id">${opt("", p("ਚੁਣੋ", "Choose"), cid)}${state.constituencies.filter((c) => c.active).map((c) => opt(c.id, plainName(c), cid)).join("")}</select></label>`
          : `<div class="fl"><span>${t("ਵਿਧਾਨ ਸਭਾ ਹਲਕਾ", "Assembly constituency")}</span><div class="fixed stack">${named(conById(cid))}</div></div>`}
        ${field("mobile2", "ਮੋਬਾਈਲ ਨੰਬਰ 2 (ਜੇ ਹੋਵੇ)", "Mobile no. 2 (optional)", 'inputmode="numeric" maxlength="10" autocomplete="off"')}
        ${select("parliamentary", "ਲੋਕ ਸਭਾ ਹਲਕਾ", "Parliamentary constituency", "parliamentary")}
        ${field("village", "ਪਿੰਡ / ਵਾਰਡ ਨੰਬਰ", "Village name / Ward no.", 'maxlength="120" autocomplete="off"')}
        ${select("category", "ਬੇਨਤੀ ਦੀ ਸ਼੍ਰੇਣੀ", "Request category", "category")}
        ${field("area", "ਇਲਾਕੇ ਦਾ ਨਾਮ", "Area name", 'maxlength="120" autocomplete="off"')}
        ${field("reference", "ਕੋਈ ਹਵਾਲਾ", "Any reference", 'maxlength="200" autocomplete="off"')}
        ${select("district", "ਜ਼ਿਲ੍ਹਾ", "District", "district")}
        ${select("revisit_time", "ਦੁਬਾਰਾ ਮਿਲਣ ਦਾ ਸਮਾਂ", "Re-visit time", "revisit")}
      </div>
      <div id="dup-warn"></div>
      <div class="fl full"><span>${t("ਜਾਣਕਾਰੀ / ਰਿਪੋਰਟ", "Information / Report")}${req}</span>
        <div class="rt-wrap">
          <div class="rt-bar" role="toolbar">
            <button type="button" data-cmd="bold" aria-label="Bold"><b>B</b></button>
            <button type="button" data-cmd="italic" aria-label="Italic"><i>I</i></button>
            <button type="button" data-cmd="underline" aria-label="Underline"><u>U</u></button>
            <button type="button" data-cmd="insertUnorderedList" aria-label="Bullet list">• ─</button>
            <button type="button" data-cmd="insertOrderedList" aria-label="Numbered list">1. ─</button>
          </div>
          <div class="rt" id="rt" contenteditable="true" role="textbox" aria-multiline="true">${sanitizeHtml(v.details || "")}</div>
        </div>
      </div>
      <div class="fl full"><span>${app ? t("ਹੋਰ ਤਸਵੀਰਾਂ ਜੋੜੋ", "Add more images") : t("ਅਰਜ਼ੀ ਦੀਆਂ ਤਸਵੀਰਾਂ", "Application images")}</span><div class="slots" id="slots"></div></div>
      <p class="err" id="form-msg" role="alert"></p>
      <div class="form-end"><button class="btn primary big" id="form-save">${app ? t("ਸੇਵ ਕਰੋ", "Save") : t("ਅਰਜ਼ੀ ਦਰਜ ਕਰੋ", "Submit")}</button></div>
    </form>`;
  const f = $("#app-form"), rt = $("#rt"), msg = $("#form-msg");
  const getFiles = photoSlots($("#slots"), 4);
  f.querySelector(".rt-bar").addEventListener("mousedown", (e) => e.preventDefault());
  f.querySelector(".rt-bar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (!b) return;
    rt.focus();
    document.execCommand(b.dataset.cmd);
  });
  const warnDup = () => {
    const mobile = f.mobile.value.trim(), voter = f.voter_id.value.trim().toUpperCase();
    const same = liveApps().filter((a) => a.id !== app?.id && OPEN.includes(a.status) && ((mobile.length === 10 && a.mobile === mobile) || (voter.length > 3 && a.voter_id === voter)));
    $("#dup-warn").innerHTML = same.length ? `<p class="warn-box">${p("ਇਸ ਮੋਬਾਈਲ ਜਾਂ ਵੋਟਰ ਕਾਰਡ ਦੀ ਅਰਜ਼ੀ ਪਹਿਲਾਂ ਹੀ ਖੁੱਲ੍ਹੀ ਹੈ", "An open application already exists for this mobile or voter card")}: ${same.slice(0, 3).map((a) => `<a href="#/applications/${esc(a.id)}">${appNo(a)}</a>`).join(", ")}</p>` : "";
  };
  f.mobile.addEventListener("input", warnDup);
  f.voter_id.addEventListener("input", warnDup);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    const keys = ["name", "voter_id", "father_name", "polling_station", "mobile", "mobile2", "parliamentary", "village", "category", "area", "reference", "district", "revisit_time"];
    const data = Object.fromEntries(keys.map((k) => [k, f[k].value.trim()]));
    data.details = sanitizeHtml(rt.innerHTML);
    if (f.constituency_id) data.constituency_id = f.constituency_id.value;
    const stop = (text) => { msg.textContent = text; msg.scrollIntoView({ block: "center" }); };
    if (!data.name) return stop(p("ਨਾਮ ਲਿਖੋ", "Enter the name"));
    if (!validMobile(data.mobile)) return stop(p("ਸਹੀ 10 ਅੰਕਾਂ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ ਲਿਖੋ", "Enter a valid 10-digit mobile number"));
    if (data.mobile2 && !validMobile(data.mobile2)) return stop(p("ਦੂਜਾ ਮੋਬਾਈਲ ਨੰਬਰ ਸਹੀ ਨਹੀਂ", "Mobile number 2 is not valid"));
    if (f.constituency_id && !data.constituency_id) return stop(p("ਹਲਕਾ ਚੁਣੋ", "Choose a constituency"));
    if (!plainText(data.details)) return stop(p("ਸਮੱਸਿਆ ਦਾ ਵੇਰਵਾ ਲਿਖੋ", "Enter the details of the problem"));
    const btn = $("#form-save");
    btn.disabled = true;
    try {
      const id = app ? (await api.updateApplication(app.id, data), app.id) : await api.createApplication(data);
      await reload();
      const saved = state.apps.find((a) => a.id === id);
      await uploadPhotos(saved, getFiles(), null);
      location.hash === `#/applications/${id}` ? route() : (app ? (location.hash = `#/applications/${id}`) : showSubmitted(saved));
      toast(SAVED, "ok");
    } catch (err) { stop(err.message); btn.disabled = false; }
  });
}
function showSubmitted(a) {
  $("#view").innerHTML = `<section class="panel done-card">
    <div class="done-tick">✓</div>
    <h1>${t("ਅਰਜ਼ੀ ਦਰਜ ਹੋ ਗਈ", "Application registered")}</h1>
    <p class="app-no big">${appNo(a)}</p>
    <p class="muted">${esc(a.name)} · ${esc(a.mobile)}</p>
    <div class="done-btns">
      ${canMove(state.me.role, a.status, "assigned") ? `<button class="btn primary" data-act="assign" data-id="${esc(a.id)}">${t("ਹੁਣੇ ਭੇਜੋ", "Send now")}</button>` : ""}
      <a class="btn" href="#/applications/${esc(a.id)}">${t("ਅਰਜ਼ੀ ਵੇਖੋ", "View application")}</a>
      <button class="btn" data-act="new-again">${t("ਇੱਕ ਹੋਰ ਅਰਜ਼ੀ", "Another application")}</button>
    </div></section>`;
  window.scrollTo({ top: 0 });
}

// ---------- applications: one application ----------
const detailRow = (pa, en, v, html) => (v ? `<div><span>${t(pa, en)}</span><b>${html || esc(v)}</b></div>` : "");
const waLink = (mobile, text) => `https://wa.me/91${encodeURIComponent(mobile)}?text=${encodeURIComponent(text)}`;
const appLink = (a) => `${location.origin}/#/applications/${a.id}`;
const NEXT_BTN = {
  solved: ["ਹੱਲ ਹੋ ਗਈ", "Mark solved"],
  returned: ["ਵਾਪਸ ਭੇਜੋ", "Send back"],
  closed: ["ਬੰਦ ਕਰੋ", "Close"]
};
function moveLabel(a, to) {
  if (to !== "in_progress") return NEXT_BTN[to];
  if (a.status === "assigned") return ["ਕੰਮ ਸ਼ੁਰੂ ਕਰੋ", "Start work"];
  if (a.status === "in_progress") return ["ਅੱਪਡੇਟ ਦਿਓ", "Give update"];
  return ["ਦੁਬਾਰਾ ਖੋਲ੍ਹੋ", "Reopen"];
}
function appActions(a) {
  const role = state.me.role, btn = (act, label, cls = "") => `<button class="btn ${cls}" data-act="${act}" data-id="${esc(a.id)}">${t(...label)}</button>`;
  if (a.deleted) return isAdmin() ? `<div class="action-bar"><p class="warn-box">${p("ਇਹ ਅਰਜ਼ੀ ਹਟਾਈ ਹੋਈ ਹੈ", "This application has been removed")}</p>${btn("restore-app", ["ਵਾਪਸ ਲਿਆਓ", "Restore"], "primary")}</div>` : "";
  const parts = [];
  ["in_progress", "solved", "closed", "returned"].forEach((to) => {
    if (canMove(role, a.status, to)) {
      const main = (role === "officer" || a.status === "solved") && (to === "in_progress" || to === "solved" || to === "closed");
      parts.push(`<button class="btn ${main && !parts.length ? "primary" : ""}" data-act="move" data-to="${to}" data-id="${esc(a.id)}">${t(...moveLabel(a, to))}</button>`);
    }
  });
  if (canMove(role, a.status, "assigned")) parts.push(btn("assign", a.department_id ? ["ਦੁਬਾਰਾ ਭੇਜੋ", "Send again"] : ["ਵਿਭਾਗ ਨੂੰ ਭੇਜੋ", "Send to department"], a.department_id ? "" : "primary"));
  if (canSend()) parts.push(btn("share", ["WhatsApp / ਕਾਪੀ", "Share"]));
  parts.push(btn("note", ["ਨੋਟ ਜੋੜੋ", "Add note"]));
  if (canEditApp(a)) parts.push(`<a class="btn" href="#/applications/${esc(a.id)}/edit">${t("ਬਦਲੋ", "Edit")}</a>`);
  if (isAdmin()) parts.push(btn("remove-app", ["ਹਟਾਓ", "Remove"], "danger"));
  return `<div class="action-bar">${parts.join("")}</div>`;
}

async function renderApplicationDetail(id) {
  const a = state.apps.find((x) => x.id === id);
  if (!a) { location.hash = "#/applications"; return; }
  const d = deptById(a.department_id), ppl = appPeople(id);
  const creator = state.people.find((x) => x.id === a.created_by);
  const stepAt = a.status === "returned" ? 2 : STEPS.indexOf(a.status);
  const tel = (m) => `<a href="tel:+91${esc(m)}">${esc(m)}</a>`;
  const backHref = d && canSend() ? `#/departments/${esc(d.id)}` : "#/applications";
  const summary = `${appNo(a)}\n${a.name} (${a.mobile})\n${a.village || ""}\n${plainText(a.details).slice(0, 300)}\n${appLink(a)}`;
  const status = p(...STATUS[a.status]);
  $("#view").innerHTML = `
    <a class="back" href="${backHref}">← ${d && canSend() ? t(esc(d.name_pa || d.name), esc(d.name)) : t("ਅਰਜ਼ੀਆਂ", "Applications")}</a>
    <div class="page-head"><div><span class="app-no">${appNo(a)}</span><h1>${esc(a.name)}</h1>
      <p class="muted small">${esc(fmtDate(a.created_at))}${creator ? ` · ${p("ਦਰਜ ਕੀਤੀ", "Registered by")}: ${esc(creator.full_name)}` : ""}</p></div>${statusBadge(a.status)}</div>
    <ol class="stepper${a.status === "returned" ? " back-state" : ""}">
      ${STEPS.map((s, i) => `<li class="${i < stepAt ? "done" : i === stepAt ? "now" : ""}"><i>${i < stepAt ? "✓" : i + 1}</i><span class="stack">${t(...STATUS[s])}</span></li>`).join("")}
    </ol>
    ${a.status === "returned" && !a.deleted ? `<p class="warn-box">${p("ਅਧਿਕਾਰੀ ਨੇ ਇਹ ਅਰਜ਼ੀ ਵਾਪਸ ਭੇਜੀ ਹੈ, ਇਸਨੂੰ ਦੁਬਾਰਾ ਸੌਂਪਣ ਦੀ ਲੋੜ ਹੈ", "The officer sent this back. It needs to be assigned again.")}</p>` : ""}
    ${appActions(a)}
    <div class="detail-grid">
      <div>
        <section class="panel"><h2>${t("ਹੁਣ ਕਿਸ ਕੋਲ ਹੈ", "Who has it now")}</h2><div class="details one">
          ${detailRow("ਹਲਕਾ", "Constituency", plainName(conById(a.constituency_id)))}
          <div><span>${t("ਵਿਭਾਗ", "Department")}</span><b>${d ? esc(plainName(d)) : `<em class="warn-text">${p("ਅਜੇ ਨਹੀਂ ਸੌਂਪੀ", "Not assigned yet")}</em>`}</b></div>
          ${ppl.length ? `<div><span>${t("ਅਧਿਕਾਰੀ", "Officers")}</span><b class="officer-lines">${ppl.map((x) => `<span>${esc(x.full_name)} (${tel(x.mobile)}) <a class="wa" href="${esc(waLink(x.mobile, summary))}" target="_blank" rel="noopener noreferrer">WhatsApp</a></span>`).join("")}</b></div>` : ""}
          ${detailRow("ਦੁਬਾਰਾ ਮਿਲਣ ਦਾ ਸਮਾਂ", "Re-visit time", a.revisit_time ? `${a.revisit_time}${a.revisit_on ? ` (${a.revisit_on})` : ""}` : "")}
        </div></section>
        <section class="panel"><h2>${t("ਸਮੱਸਿਆ", "The problem")}</h2>
          <div class="rich">${sanitizeHtml(a.details) || "—"}</div>
          <div class="details top-gap">
            ${detailRow("ਸ਼੍ਰੇਣੀ", "Category", a.category)}
            ${detailRow("ਹਵਾਲਾ", "Reference", a.reference)}
          </div>
        </section>
        <section class="panel"><h2>${t("ਤਸਵੀਰਾਂ", "Images")}</h2><div id="app-images" class="muted small">…</div></section>
        <section class="panel"><h2>${t("ਅਰਜ਼ੀਕਰਤਾ", "Applicant")}</h2><div class="details">
          ${detailRow("ਨਾਮ", "Name", a.name)}
          ${detailRow("ਪਿਤਾ / ਪਤੀ ਦਾ ਨਾਮ", "Father / Husband", a.father_name)}
          ${detailRow("ਮੋਬਾਈਲ", "Mobile", a.mobile, a.mobile && `${tel(a.mobile)} <a class="wa" href="${esc(waLink(a.mobile, `${appNo(a)}: ${status}`))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`)}
          ${detailRow("ਮੋਬਾਈਲ 2", "Mobile 2", a.mobile2, a.mobile2 && tel(a.mobile2))}
          ${detailRow("ਵੋਟਰ ਕਾਰਡ", "Voter card / EPIC", a.voter_id)}
          ${detailRow("ਪਿੰਡ / ਵਾਰਡ", "Village / Ward", a.village)}
          ${detailRow("ਇਲਾਕਾ", "Area", a.area)}
          ${detailRow("ਜ਼ਿਲ੍ਹਾ", "District", a.district)}
          ${detailRow("ਪੋਲਿੰਗ ਸਟੇਸ਼ਨ", "Polling station", a.polling_station)}
          ${detailRow("ਲੋਕ ਸਭਾ ਹਲਕਾ", "Parliamentary constituency", a.parliamentary)}
        </div></section>
      </div>
      <section class="panel timeline-panel"><h2>${t("ਪੂਰਾ ਇਤਿਹਾਸ", "Full history")}</h2><div id="timeline" class="muted small">…</div></section>
    </div>`;
  try {
    const [events, images] = await Promise.all([api.listEvents(id), api.listImages(id)]);
    const urls = await api.imageUrls(images.map((i) => i.path));
    const tl = $("#timeline"), box = $("#app-images");
    if (!tl || state.detail !== id) return;
    const thumb = (i) => `<button type="button" class="thumb" data-act="view-image" data-src="${esc(urls[i.path] || "")}"><img src="${esc(urls[i.path] || "")}" alt="" loading="lazy"></button>`;
    const main = images.filter((i) => !i.event_id);
    box.className = "";
    box.innerHTML = images.length
      ? `<div class="thumbs">${(main.length ? main : images).map(thumb).join("")}</div>`
      : `<p class="muted small">${p("ਕੋਈ ਤਸਵੀਰ ਨਹੀਂ", "No images")}</p>`;
    tl.className = "";
    tl.innerHTML = `<ol class="timeline">${events.map((e) => {
      const pics = images.filter((i) => String(i.event_id) === String(e.id));
      return `<li>
      <i class="tl-dot st-${e.to_status || "note"}"></i>
      <div>${e.to_status ? statusBadge(e.to_status) : `<span class="st st-note">${t("ਨੋਟ", "Note")}</span>`}
        ${e.note ? `<p class="pre">${esc(e.note)}</p>` : ""}
        ${pics.length ? `<div class="thumbs small">${pics.map(thumb).join("")}</div>` : ""}
        <small>${esc(e.actor_name || "—")}${e.actor_role ? ` (${esc(ROLE_LABELS[e.actor_role][1])})` : ""} · ${esc(fmtDate(e.at))}</small>
      </div></li>`;
    }).join("") || `<li class="muted">${p("ਅਜੇ ਕੁਝ ਨਹੀਂ", "Nothing yet")}</li>`}</ol>`;
  } catch (err) { toast(err.message, "err"); }
}

// Dialog for a status change or a note, with optional photos.
function noteDialog(a, { title, required, save }) {
  dlg.innerHTML = `<form method="dialog" id="note-form" class="dlg" novalidate>
    <header><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <p class="muted small">${appNo(a)} · ${esc(a.name)}</p>
      <label class="fl"><span>${t(required ? "ਨੋਟ (ਲਾਜ਼ਮੀ)" : "ਨੋਟ (ਜੇ ਲੋੜ ਹੋਵੇ)", required ? "Note (required)" : "Note (optional)")}</span><textarea class="inp area" name="note" maxlength="2000" rows="4"></textarea></label>
      <div class="fl"><span>${t("ਤਸਵੀਰਾਂ (ਜੇ ਲੋੜ ਹੋਵੇ)", "Images (optional)")}</span><div class="slots two" id="note-slots"></div></div>
      <p class="err" id="note-msg" role="alert"></p>
    </div>
    <footer><button type="button" class="btn" data-close>${p("ਰੱਦ ਕਰੋ", "Cancel")}</button><button class="btn primary" id="note-save">${p("ਸੇਵ ਕਰੋ", "Save")}</button></footer>
  </form>`;
  const f = $("#note-form"), getFiles = photoSlots($("#note-slots"), 2);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = f.note.value.trim(), msg = $("#note-msg"), btn = $("#note-save");
    if (required && !note) { msg.textContent = p("ਕਿਰਪਾ ਕਰਕੇ ਨੋਟ ਲਿਖੋ", "Please write a note"); return; }
    btn.disabled = true;
    try {
      const eventId = await save(note);
      await uploadPhotos(a, getFiles(), eventId);
      await reload();
      dlg.close();
      toast(SAVED, "ok");
      route();
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
  dlg.showModal();
}

function assignDialog(appsIn) {
  const apps = Array.isArray(appsIn) ? appsIn : [appsIn], a = apps[0];
  const movable = apps.filter((x) => !x.deleted && canMove(state.me.role, x.status, "assigned"));
  if (new Set(apps.map((x) => x.constituency_id)).size > 1) return toast(p("ਇੱਕ ਵਾਰ ਵਿੱਚ ਇੱਕੋ ਹਲਕੇ ਦੀਆਂ ਅਰਜ਼ੀਆਂ ਚੁਣੋ", "Select applications from one constituency at a time"), "err");
  if (!movable.length) return toast(p("ਇਹ ਅਰਜ਼ੀਆਂ ਇਸ ਸਮੇਂ ਭੇਜੀਆਂ ਨਹੀਂ ਜਾ ਸਕਦੀਆਂ", "These applications can't be sent right now"), "err");
  const many = apps.length > 1;
  const depts = deptsOf(a.constituency_id).filter((d) => d.active || d.id === a.department_id);
  const suggested = (!many && a.department_id) || (depts.find((d) => d.name === a.category)?.id) || "";
  const officers = new Set(many ? [] : state.appOfficers.filter((o) => o.application_id === a.id).map((o) => o.user_id));
  dlg.innerHTML = `<form method="dialog" id="assign-form" class="dlg" novalidate>
    <header><h2>${t("ਵਿਭਾਗ ਅਤੇ ਅਧਿਕਾਰੀ ਨੂੰ ਭੇਜੋ", "Send to department and officer")}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <p class="muted small">${many ? `${movable.length} ${p("ਅਰਜ਼ੀਆਂ", "applications")}${movable.length < apps.length ? ` (${apps.length - movable.length} ${p("ਭੇਜੀਆਂ ਨਹੀਂ ਜਾ ਸਕਦੀਆਂ", "can't be sent")})` : ""}` : `${appNo(a)} · ${esc(a.name)}`}</p>
      <label class="fl"><span>${t("ਵਿਭਾਗ", "Department")}</span><select class="inp" name="dept">${opt("", p("ਚੁਣੋ", "Choose"), suggested)}${depts.map((d) => opt(d.id, plainName(d), suggested)).join("")}</select></label>
      <div id="assign-officers"></div>
      <label class="fl"><span>${t("ਨੋਟ (ਜੇ ਲੋੜ ਹੋਵੇ)", "Note (optional)")}</span><textarea class="inp area" name="note" maxlength="2000" rows="3"></textarea></label>
      <p class="err" id="assign-msg" role="alert"></p>
    </div>
    <footer><button type="button" class="btn" data-close>${p("ਰੱਦ ਕਰੋ", "Cancel")}</button><button class="btn primary" id="assign-save">${p("ਭੇਜੋ", "Send")}</button></footer>
  </form>`;
  const f = $("#assign-form");
  const draw = () => {
    const box = $("#assign-officers"), list = deptPeople(f.dept.value).filter((x) => x.active);
    box.innerHTML = !f.dept.value ? "" : `<fieldset class="checks one"><legend>${t("ਅਧਿਕਾਰੀ (ਇੱਕ ਜਾਂ ਵੱਧ)", "Officers (one or more)")}</legend>
      ${list.map((x) => `<label class="check"><input type="checkbox" value="${esc(x.id)}" ${officers.has(x.id) ? "checked" : ""}> ${esc(x.full_name)}</label>`).join("")
        || `<p class="warn-box">${p("ਇਸ ਵਿਭਾਗ ਵਿੱਚ ਅਜੇ ਕੋਈ ਅਧਿਕਾਰੀ ਨਹੀਂ", "No officers in this department yet")}</p>`}
    </fieldset>`;
  };
  draw();
  f.dept.addEventListener("change", () => { officers.clear(); draw(); });
  f.addEventListener("change", (e) => { if (e.target.matches(".check input")) e.target.checked ? officers.add(e.target.value) : officers.delete(e.target.value); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#assign-msg"), btn = $("#assign-save");
    if (!f.dept.value) { msg.textContent = p("ਵਿਭਾਗ ਚੁਣੋ", "Choose a department"); return; }
    btn.disabled = true;
    let done = 0, firstErr = "";
    for (const x of movable) {
      try { await api.assignApplication(x.id, f.dept.value, [...officers], f.note.value.trim()); done++; }
      catch (err) { firstErr ||= err.message; }
    }
    try { await reload(); } catch (err) { firstErr ||= err.message; }
    if (!done) { msg.textContent = firstErr; btn.disabled = false; return; }
    dlg.close();
    state.picked.clear();
    toast(`${done} ${p("ਅਰਜ਼ੀਆਂ ਭੇਜੀਆਂ ਗਈਆਂ", "sent")}${firstErr ? ` · ${firstErr}` : ""}`, firstErr ? "err" : "ok");
    if ($("#view .done-card")) location.hash = `#/applications/${a.id}`; else route();
  });
  dlg.showModal();
}

const shareText = (a) => [
  `${appNo(a)} (${p(...STATUS[a.status])})`,
  `${a.name} · ${a.mobile}`,
  [a.village, a.area].filter(Boolean).join(", "),
  deptById(a.department_id) ? plainName(deptById(a.department_id)) : "",
  plainText(a.details).slice(0, 400),
  appLink(a)
].filter(Boolean).join("\n");
function shareDialog(apps) {
  const text = apps.map(shareText).join("\n\n");
  const cid = apps[0].constituency_id;
  const contacts = state.people.filter((x) => x.active && x.constituency_id === cid && x.id !== state.me.id && x.role !== "main_admin");
  const single = apps.length === 1 ? apps[0] : null;
  dlg.innerHTML = `<div class="dlg">
    <header><h2>${t("ਅਰਜ਼ੀ ਸਾਂਝੀ ਕਰੋ", "Share application")}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <label class="fl"><span>${t("ਕਿਸ ਨੂੰ", "Send to")}</span><select class="inp" id="share-to">
        ${single?.mobile ? opt(single.mobile, `${p("ਅਰਜ਼ੀਕਰਤਾ", "Applicant")}: ${single.name}`, "") : ""}
        ${contacts.map((x) => opt(x.mobile, `${x.full_name} (${ROLE_LABELS[x.role][1]})`, "")).join("")}
        ${opt("other", p("ਕੋਈ ਹੋਰ ਨੰਬਰ", "Another number"), "")}
      </select></label>
      <label class="fl" id="share-other" hidden><span>${t("ਮੋਬਾਈਲ ਨੰਬਰ", "Mobile number")}</span><input class="inp" id="share-num" inputmode="numeric" maxlength="10"></label>
      <label class="fl"><span>${t("ਸੁਨੇਹਾ", "Message")}</span><textarea class="inp area" id="share-text" rows="7">${esc(text)}</textarea></label>
      <p class="warn-box">${p("ਇਸ ਵਿੱਚ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਹੈ। ਭੇਜਣ ਤੋਂ ਪਹਿਲਾਂ ਨੰਬਰ ਚੈੱਕ ਕਰੋ", "This has personal details. Check the number before sending.")}</p>
    </div>
    <footer><button type="button" class="btn" id="share-copy">${p("ਕਾਪੀ", "Copy")}</button><button type="button" class="btn primary" id="share-wa">WhatsApp</button></footer>
  </div>`;
  const sel = $("#share-to"), other = $("#share-other");
  const syncOther = () => { other.hidden = sel.value !== "other"; };
  sel.addEventListener("change", syncOther);
  syncOther();
  const copy = async () => {
    try { await navigator.clipboard.writeText($("#share-text").value); return true; } catch { return false; }
  };
  $("#share-copy").addEventListener("click", async () => {
    (await copy()) ? toast(p("ਕਾਪੀ ਹੋ ਗਿਆ", "Copied"), "ok") : toast(p("ਕਾਪੀ ਨਹੀਂ ਹੋਇਆ", "Could not copy"), "err");
  });
  $("#share-wa").addEventListener("click", async () => {
    const num = sel.value === "other" ? $("#share-num").value.trim() : sel.value;
    if (!validMobile(num)) return toast(p("ਸਹੀ 10 ਅੰਕਾਂ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ ਲਿਖੋ", "Enter a valid 10-digit mobile number"), "err");
    const url = waLink(num, $("#share-text").value);
    if (url.length <= 6000) { window.open(url, "_blank", "noopener"); return dlg.close(); }
    const copied = await copy();
    window.open(`https://wa.me/91${num}`, "_blank", "noopener");
    toast(copied ? p("ਸੁਨੇਹਾ ਲੰਬਾ ਹੈ, ਕਾਪੀ ਹੋ ਗਿਆ, ਪੇਸਟ ਕਰੋ", "Long message: copied, please paste it") : p("ਸੁਨੇਹਾ ਬਹੁਤ ਲੰਬਾ ਹੈ", "The message is too long"), copied ? "ok" : "err");
  });
  dlg.showModal();
}

// ---------- exports ----------
const APP_COLS = [
  ["no", "ਨੰਬਰ", "No.", (a) => appNo(a)],
  ["date", "ਤਾਰੀਖ", "Date", (a) => fmtDate(a.created_at)],
  ["status", "ਸਥਿਤੀ", "Status", (a) => p(...STATUS[a.status])],
  ["con", "ਹਲਕਾ", "Constituency", (a) => plainName(conById(a.constituency_id))],
  ["dept", "ਵਿਭਾਗ", "Department", (a) => (deptById(a.department_id) ? plainName(deptById(a.department_id)) : "")],
  ["officers", "ਅਧਿਕਾਰੀ", "Officers", (a) => appPeople(a.id).map((x) => x.full_name).join(", ")],
  ["name", "ਨਾਮ", "Name", (a) => a.name],
  ["father", "ਪਿਤਾ / ਪਤੀ", "Father / Husband", (a) => a.father_name],
  ["mobile", "ਮੋਬਾਈਲ", "Mobile", (a) => a.mobile],
  ["mobile2", "ਮੋਬਾਈਲ 2", "Mobile 2", (a) => a.mobile2],
  ["voter", "ਵੋਟਰ ਕਾਰਡ", "Voter card", (a) => a.voter_id],
  ["village", "ਪਿੰਡ / ਵਾਰਡ", "Village / Ward", (a) => a.village],
  ["area", "ਇਲਾਕਾ", "Area", (a) => a.area],
  ["district", "ਜ਼ਿਲ੍ਹਾ", "District", (a) => a.district],
  ["polling", "ਪੋਲਿੰਗ ਸਟੇਸ਼ਨ", "Polling station", (a) => a.polling_station],
  ["pc", "ਲੋਕ ਸਭਾ ਹਲਕਾ", "Parliamentary", (a) => a.parliamentary],
  ["category", "ਸ਼੍ਰੇਣੀ", "Category", (a) => a.category],
  ["reference", "ਹਵਾਲਾ", "Reference", (a) => a.reference],
  ["revisit", "ਦੁਬਾਰਾ ਮਿਲਣਾ", "Re-visit", (a) => a.revisit_on || a.revisit_time],
  ["details", "ਜਾਣਕਾਰੀ", "Information", (a) => plainText(a.details)],
  ["updated", "ਆਖਰੀ ਬਦਲਾਅ", "Last updated", (a) => fmtDate(a.updated_at)]
];
const fileStamp = () => new Date().toISOString().slice(0, 10);
function downloadCSV(name, header, rows) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formulas
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${fileStamp()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function printTable(title, sub, header, rows) {
  const w = window.open("", "_blank");
  if (!w) return toast(p("ਪੌਪ-ਅੱਪ ਬਲੌਕ ਹੈ, ਇਜਾਜ਼ਤ ਦਿਓ", "Pop-up blocked. Please allow pop-ups for this site."), "err");
  w.document.write(`<!doctype html><html lang="pa"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Noto+Sans+Gurmukhi:wght@400;600&display=swap" rel="stylesheet">
<style>@page{size:A4 landscape;margin:10mm}body{font-family:Inter,"Noto Sans Gurmukhi",sans-serif;font-size:9.5px;color:#111;margin:0}h1{font-size:15px;margin:0 0 2px}p{margin:0 0 8px;color:#555;font-size:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #b9c0c8;padding:4px 5px;text-align:left;vertical-align:top}th{background:#e9eef4}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>
<h1>${esc(title)}</h1><p>${esc(sub)}</p><table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
  w.document.close();
  const go = () => w.print();
  (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 300));
}
function exportDialog() {
  const picked = pickedApps();
  const list = picked.length ? picked : filterApps(currentAppBase());
  dlg.innerHTML = `<div class="dlg">
    <header><h2>${t("Excel / PDF ਡਾਊਨਲੋਡ", "Download the list")}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <p class="muted small">${list.length} ${p("ਅਰਜ਼ੀਆਂ", "applications")} (${picked.length ? p("ਚੁਣੀਆਂ ਹੋਈਆਂ", "selected") : p("ਹੁਣ ਦਿਖ ਰਹੀਆਂ", "as currently shown")})</p>
      <fieldset class="checks">
        <legend>${t("ਕਾਲਮ ਚੁਣੋ", "Choose columns")}</legend>
        ${APP_COLS.map(([k, pa, en]) => `<label class="check"><input type="checkbox" value="${k}" ${k === "details" || k === "voter" ? "" : "checked"}> <span class="stack">${t(pa, en)}</span></label>`).join("")}
      </fieldset>
      <p class="warn-box">${p("ਇਸ ਫਾਈਲ ਵਿੱਚ ਲੋਕਾਂ ਦੀ ਨਿੱਜੀ ਜਾਣਕਾਰੀ ਹੈ, ਸੰਭਾਲ ਕੇ ਰੱਖੋ", "This file contains people's personal details. Keep it safe.")}</p>
    </div>
    <footer><button type="button" class="btn" id="x-pdf">PDF</button><button type="button" class="btn primary" id="x-csv">⬇ Excel</button></footer>
  </div>`;
  const pick = () => {
    const keys = new Set([...dlg.querySelectorAll(".checks input:checked")].map((i) => i.value));
    return APP_COLS.filter(([k]) => keys.has(k));
  };
  const table = (cols) => ({ header: cols.map(([, pa, en]) => p(pa, en)), rows: list.map((a) => cols.map(([, , , fn]) => fn(a) ?? "")) });
  $("#x-csv").addEventListener("click", () => {
    const cols = pick();
    if (!cols.length) return toast(p("ਘੱਟੋ-ਘੱਟ ਇੱਕ ਕਾਲਮ ਚੁਣੋ", "Choose at least one column"), "err");
    const { header, rows } = table(cols);
    downloadCSV("applications", header, rows);
    dlg.close();
    toast(`${rows.length} ${p("ਅਰਜ਼ੀਆਂ ਡਾਊਨਲੋਡ ਹੋਈਆਂ", "applications downloaded")}`, "ok");
  });
  $("#x-pdf").addEventListener("click", () => {
    const cols = pick();
    if (!cols.length) return toast(p("ਘੱਟੋ-ਘੱਟ ਇੱਕ ਕਾਲਮ ਚੁਣੋ", "Choose at least one column"), "err");
    const { header, rows } = table(cols);
    dlg.close();
    printTable(p("ਅਰਜ਼ੀਆਂ", "Applications"), `${rows.length} · ${new Date().toLocaleString("en-IN")}`, header, rows);
  });
  dlg.showModal();
}

// ---------- reports ----------
function reportRow(label, list, attrs = "") {
  const live = list.filter((a) => !a.deleted);
  return { label, attrs, cells: [live.length, countStatus(live, "new"), countStatus(live, "assigned", "in_progress"), countStatus(live, "returned"), countStatus(live, "solved", "closed"), live.filter(isDelayed).length, live.filter(isRevisitDue).length] };
}
const REPORT_HEAD = [["ਕੁੱਲ", "Total"], ["ਨਵੀਆਂ", "New"], ["ਕੰਮ ਜਾਰੀ", "In progress"], ["ਵਾਪਸ", "Sent back"], ["ਹੱਲ", "Solved"], ["ਦੇਰੀ", "Delayed"], ["ਦੁਬਾਰਾ ਮਿਲਣਾ", "Re-visit due"]];
function reportTable(id, firstHead, rows) {
  return `<div class="table-wrap"><table class="report" id="${id}"><thead><tr><th>${t(...firstHead)}</th>${REPORT_HEAD.map((h) => `<th class="num">${t(...h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr ${r.attrs ? `class="clicky" data-act="go-apps" tabindex="0" ${r.attrs}` : ""}><td data-label="">${esc(r.label)}</td>${r.cells.map((c, i) => `<td class="num${i === 5 && c ? " late" : ""}" data-label="${esc(REPORT_HEAD[i][1])}">${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="8" class="muted">${p("ਅਜੇ ਕੁਝ ਨਹੀਂ", "Nothing yet")}</td></tr>`}</tbody></table></div>`;
}
const reportData = {};
function renderReports() {
  const all = isMain() && state.cid === "*";
  const cid = isMain() ? (state.cid === "*" ? "" : state.cid) : state.me.constituency_id;
  const scoped = cid ? state.apps.filter((a) => a.constituency_id === cid) : state.apps;
  reportData.con = all ? state.constituencies.map((c) => reportRow(plainName(c), state.apps.filter((a) => a.constituency_id === c.id), `data-cid="${esc(c.id)}"`)) : [];
  reportData.dept = cid ? deptsOf(cid).map((d) => reportRow(plainName(d), scoped.filter((a) => a.department_id === d.id), `data-dept="${esc(d.id)}" data-cid="${esc(cid)}"`)) : [];
  const none = scoped.filter((a) => !a.department_id);
  if (cid && none.length) reportData.dept.push(reportRow(p("ਅਜੇ ਨਹੀਂ ਸੌਂਪੀ", "Not assigned yet"), none));
  reportData.off = cid ? state.people.filter((x) => x.role === "officer" && x.constituency_id === cid).map((x) => {
    const ids = new Set(state.appOfficers.filter((o) => o.user_id === x.id).map((o) => o.application_id));
    return reportRow(x.full_name, scoped.filter((a) => ids.has(a.id)), `data-officer="${esc(x.id)}" data-cid="${esc(cid)}"`);
  }) : [];
  const dl = (key, label) => `<button class="btn sm" data-act="report-csv" data-key="${key}" data-name="${esc(label)}">⬇ Excel</button>`;
  $("#view").innerHTML = `
    ${head(t("ਰਿਪੋਰਟਾਂ", "Reports"), t(`${DELAY_DAYS} ਦਿਨਾਂ ਤੋਂ ਬਿਨਾਂ ਅੱਪਡੇਟ ਖੁੱਲ੍ਹੀ ਅਰਜ਼ੀ ਨੂੰ "ਦੇਰੀ" ਗਿਣਿਆ ਜਾਂਦਾ ਹੈ।`, `An open application with no update for ${DELAY_DAYS} days counts as delayed.`))}
    ${conPicker(true)}
    ${appStats(scoped.filter((a) => !a.deleted), `data-cid="${esc(state.cid)}"`)}
    ${all ? `<div class="sec-row"><h2 class="sec">${t("ਹਲਕੇ ਮੁਤਾਬਕ", "By constituency")}</h2>${dl("con", "constituencies")}</div>${reportTable("r-con", ["ਹਲਕਾ", "Constituency"], reportData.con)}
      <p class="muted small top-note">${p("ਵਿਭਾਗ ਅਤੇ ਅਧਿਕਾਰੀ ਵੇਖਣ ਲਈ ਉੱਪਰ ਇੱਕ ਹਲਕਾ ਚੁਣੋ", "Choose one constituency above to see departments and officers")}</p>` : ""}
    ${cid ? `<div class="sec-row"><h2 class="sec">${t("ਵਿਭਾਗ ਮੁਤਾਬਕ", "By department")}</h2>${dl("dept", "departments")}</div>${reportTable("r-dept", ["ਵਿਭਾਗ", "Department"], reportData.dept)}
      <div class="sec-row"><h2 class="sec">${t("ਅਧਿਕਾਰੀ ਮੁਤਾਬਕ", "By officer")}</h2>${dl("off", "officers")}</div>${reportTable("r-off", ["ਅਧਿਕਾਰੀ", "Officer"], reportData.off)}` : ""}`;
}

// ---------- lists ----------
const LIST_KINDS = {
  category: ["ਬੇਨਤੀ ਦੀ ਸ਼੍ਰੇਣੀ", "Request category"],
  revisit: ["ਦੁਬਾਰਾ ਮਿਲਣ ਦਾ ਸਮਾਂ", "Re-visit time"],
  district: ["ਜ਼ਿਲ੍ਹੇ", "Districts"],
  parliamentary: ["ਲੋਕ ਸਭਾ ਹਲਕੇ", "Parliamentary constituencies"]
};
function renderLists() {
  const kind = state.listKind, items = itemsOf(kind), isRevisit = kind === "revisit";
  $("#view").innerHTML = `
    ${head(t("ਸੂਚੀਆਂ", "Lists"), t("ਅਰਜ਼ੀ ਫਾਰਮ ਦੀਆਂ ਡ੍ਰੌਪਡਾਊਨ ਸੂਚੀਆਂ ਇੱਥੋਂ ਬਦਲੋ।", "Change the dropdown lists used in the application form."))}
    <div class="seg">${Object.entries(LIST_KINDS).map(([k, l]) => `<button class="${k === kind ? "on" : ""}" data-act="list-kind" data-kind="${k}">${t(...l)}</button>`).join("")}</div>
    <form class="panel add-row" data-form="add-item">
      <input class="inp" name="name_pa" placeholder="ਪੰਜਾਬੀ ਨਾਮ" maxlength="80">
      <input class="inp" name="name" placeholder="English name" maxlength="80" required>
      ${isRevisit ? `<input class="inp days" name="days" type="number" min="0" max="3650" placeholder="${esc(p("ਦਿਨ", "Days"))}">` : ""}
      <button class="btn primary">+ ${t("ਜੋੜੋ", "Add")}</button>
    </form>
    <div class="list">${items.map((i) => `<div class="row${i.active ? "" : " is-off"}">
      <div class="row-main stack"><strong>${named(i)}</strong>${isRevisit && i.days != null ? `<small>${i.days} ${p("ਦਿਨ", "days")}</small>` : ""}</div>
      ${onOff(i.active)}
      <div class="row-btns">
        <button class="btn sm" data-act="edit-item" data-id="${esc(i.id)}">${p("ਬਦਲੋ", "Edit")}</button>
        <button class="btn sm" data-act="toggle-item" data-id="${esc(i.id)}">${i.active ? p("ਬੰਦ ਕਰੋ", "Switch off") : p("ਚਾਲੂ ਕਰੋ", "Switch on")}</button>
      </div></div>`).join("") || `<div class="row muted">${p("ਅਜੇ ਕੁਝ ਨਹੀਂ", "Nothing yet")}</div>`}</div>
    <form class="panel narrow setting" data-form="portal" novalidate>
      <h2>${t("ਪੋਲਿੰਗ ਸਟੇਸ਼ਨ ਪੋਰਟਲ ਦਾ ਲਿੰਕ", "Polling station portal link")}</h2>
      <input class="inp" name="url" type="url" value="${esc(state.settings.polling_portal_url)}" placeholder="https://">
      <button class="btn primary">${t("ਸੇਵ ਕਰੋ", "Save")}</button>
    </form>`;
}

// ---------- constituencies ----------
function renderConstituencies() {
  $("#view").innerHTML = `
    ${head(t("ਹਲਕੇ", "Constituencies"), t("ਹਰ ਹਲਕੇ ਦਾ ਆਪਣਾ ਐਡਮਿਨ, ਵਿਭਾਗ, ਲੋਕ ਅਤੇ ਡਾਟਾ ਹੁੰਦਾ ਹੈ।", "Each constituency has its own admin, departments, people and data."))}
    <form class="panel add-row" data-form="add-con">
      <input class="inp" name="name_pa" placeholder="ਹਲਕੇ ਦਾ ਨਾਮ (ਪੰਜਾਬੀ)" maxlength="120">
      <input class="inp" name="name" placeholder="Constituency name (English)" maxlength="120" required>
      <button class="btn primary">+ ${t("ਜੋੜੋ", "Add")}</button>
    </form>
    <div class="list">${state.constituencies.map((c) => {
      const admins = state.people.filter((x) => x.role === "constituency_admin" && x.constituency_id === c.id && x.active);
      return `<div class="row${c.active ? "" : " is-off"}">
        <div class="row-main stack"><strong>${named(c)}</strong>
        <small>${admins.length ? `${p("ਐਡਮਿਨ", "Admin")}: ${admins.map((x) => esc(x.full_name)).join(", ")}` : `<em class="warn-text">${p("ਅਜੇ ਐਡਮਿਨ ਨਹੀਂ", "No admin yet")}</em>`}</small></div>
        ${onOff(c.active)}
        <div class="row-btns">
          <button class="btn sm" data-act="open-con" data-id="${esc(c.id)}">${p("ਖੋਲ੍ਹੋ", "Open")}</button>
          <button class="btn sm" data-act="edit-con" data-id="${esc(c.id)}">${p("ਬਦਲੋ", "Edit")}</button>
          <button class="btn sm" data-act="toggle-con" data-id="${esc(c.id)}">${c.active ? p("ਬੰਦ ਕਰੋ", "Switch off") : p("ਚਾਲੂ ਕਰੋ", "Switch on")}</button>
        </div></div>`;
    }).join("") || `<div class="row muted">${p("ਉੱਪਰ ਪਹਿਲਾ ਹਲਕਾ ਜੋੜੋ", "Add the first one above")}</div>`}</div>`;
}

// ---------- departments ----------
function renderDepartments() {
  const cid = workingCid(), canEdit = isAdmin(), list = deptsOf(cid);
  $("#view").innerHTML = `
    ${head(t("ਵਿਭਾਗ", "Departments"), canEdit ? t("ਕਿਸੇ ਵਿਭਾਗ 'ਤੇ ਕਲਿੱਕ ਕਰਕੇ ਉਸਦੀਆਂ ਅਰਜ਼ੀਆਂ ਅਤੇ ਅਧਿਕਾਰੀ ਵੇਖੋ।", "Click a department to see its applications and officers.") : named(conById(cid)))}
    ${conPicker()}
    ${!cid ? `<div class="empty panel"><h2>${t("ਅਜੇ ਕੋਈ ਹਲਕਾ ਨਹੀਂ", "No constituency yet")}</h2></div>` : `
    ${canEdit ? `<form class="panel add-row" data-form="add-dept">
      <input class="inp" name="name_pa" placeholder="ਵਿਭਾਗ ਦਾ ਨਾਮ (ਪੰਜਾਬੀ)" maxlength="80">
      <input class="inp" name="name" placeholder="Department name (English)" maxlength="80" required>
      <button class="btn primary">+ ${t("ਜੋੜੋ", "Add")}</button>
    </form>` : ""}
    <div class="list">${list.map((d) => {
      const ppl = deptPeople(d.id);
      const main = `<strong>${named(d)}</strong><small>${ppl.length ? ppl.map((x) => esc(x.full_name)).join(", ") : p("ਅਜੇ ਅਧਿਕਾਰੀ ਨਹੀਂ", "No officer yet")}</small>`;
      return `<div class="row${d.active ? "" : " is-off"}">
        ${canEdit ? `<a class="row-main stack row-link" href="#/departments/${esc(d.id)}">${main}</a>${deptCounts(d.id)}${onOff(d.active)}
        <div class="row-btns">
          <a class="btn sm" href="#/departments/${esc(d.id)}">${p("ਅਰਜ਼ੀਆਂ", "Applications")}</a>
          <button class="btn sm" data-act="edit-dept" data-id="${esc(d.id)}">${p("ਨਾਮ ਬਦਲੋ", "Rename")}</button>
          <button class="btn sm" data-act="toggle-dept" data-id="${esc(d.id)}">${d.active ? p("ਬੰਦ ਕਰੋ", "Switch off") : p("ਚਾਲੂ ਕਰੋ", "Switch on")}</button>
        </div>` : `<a class="row-main stack row-link" href="#/departments/${esc(d.id)}">${main}</a>${deptCounts(d.id)}`}
      </div>`;
    }).join("") || `<div class="row muted">${p("ਅਜੇ ਕੋਈ ਵਿਭਾਗ ਨਹੀਂ", "No departments yet")}</div>`}</div>`}`;
}

// ---------- people ----------
function peopleFiltered() {
  const needle = state.q.trim().toLowerCase();
  const inCon = isMain() ? (state.cid === "*" ? null : state.cid) : state.me.constituency_id;
  return state.people.filter((x) => {
    if (inCon && x.constituency_id !== inCon) return false;
    if (state.role && x.role !== state.role) return false;
    if (state.status && String(x.active) !== state.status) return false;
    if (state.dept && !state.links.some((l) => l.user_id === x.id && l.department_id === state.dept)) return false;
    if (needle && !(x.full_name + " " + x.mobile).toLowerCase().includes(needle)) return false;
    return true;
  });
}
function renderPeople() {
  const cid = isMain() ? state.cid : state.me.constituency_id;
  $("#view").innerHTML = `
    ${head(t("ਲੋਕ", "People"), t("ਸਟਾਫ਼, ਅਧਿਕਾਰੀ ਅਤੇ ਐਡਮਿਨ ਇੱਥੇ ਦਰਜ ਕਰੋ। ਕੋਈ ਖੁਦ ਸਾਈਨ-ਅੱਪ ਨਹੀਂ ਕਰ ਸਕਦਾ।", "Register staff, officers and admins here. Nobody can sign up on their own."), `<button class="btn primary" data-act="add-person">+ ${t("ਨਵਾਂ ਵਿਅਕਤੀ", "Register a person")}</button>`)}
    <section class="panel filters">
      ${conPicker(true)}
      <label class="fl grow"><span>${t("ਖੋਜੋ", "Search")}</span><input class="inp" id="f-q" type="search" placeholder="${esc(p("ਨਾਮ ਜਾਂ ਮੋਬਾਈਲ", "name or mobile"))}" value="${esc(state.q)}"></label>
      <label class="fl"><span>${t("ਪੱਧਰ", "Level")}</span><select class="inp" id="f-role">${opt("", p("ਸਾਰੇ", "All"), state.role)}${["constituency_admin", "staff", "officer"].filter((r) => isMain() || r !== "constituency_admin").map((r) => opt(r, roleText(r), state.role)).join("")}</select></label>
      ${cid && cid !== "*" ? `<label class="fl"><span>${t("ਵਿਭਾਗ", "Department")}</span><select class="inp" id="f-dept">${opt("", p("ਸਾਰੇ", "All"), state.dept)}${deptsOf(cid).map((d) => opt(d.id, plainName(d), state.dept)).join("")}</select></label>` : ""}
      <label class="fl"><span>${t("ਸਥਿਤੀ", "Status")}</span><select class="inp" id="f-status">${opt("", p("ਸਾਰੇ", "All"), state.status)}${opt("true", p("ਚਾਲੂ", "Active"), state.status)}${opt("false", p("ਬੰਦ", "Off"), state.status)}</select></label>
    </section>
    <div id="people-list"></div>`;
  renderPeopleList();
}
function renderPeopleList() {
  const el = $("#people-list");
  if (!el) return;
  const list = peopleFiltered().filter((x) => x.role !== "main_admin");
  el.innerHTML = `<p class="muted small result-count">${list.length} ${p("ਲੋਕ", "people")}</p>
    <div class="list">${list.map((x) => {
      const can = !checkTarget(state.me, x), depts = personDepts(x.id);
      return `<div class="row person${x.active ? "" : " is-off"}">
        <div class="row-main">
          <strong>${esc(x.full_name)}</strong>
          <small><a href="tel:+91${esc(x.mobile)}">${esc(x.mobile)}</a>${isMain() ? ` · ${esc(plainName(conById(x.constituency_id)))}` : ""}</small>
          ${depts.length ? `<div class="chips tight">${depts.map((d) => `<span class="chip">${esc(plainName(d))}</span>`).join("")}</div>` : ""}
        </div>
        ${roleBadge(x.role)}${onOff(x.active)}
        ${can ? `<div class="row-btns">
          <button class="btn sm" data-act="edit-person" data-id="${esc(x.id)}">${p("ਬਦਲੋ", "Edit")}</button>
          <button class="btn sm" data-act="reset-person" data-id="${esc(x.id)}">${p("ਪਾਸਵਰਡ ਰੀਸੈੱਟ", "Reset password")}</button>
          <button class="btn sm" data-act="toggle-person" data-id="${esc(x.id)}">${x.active ? p("ਬੰਦ ਕਰੋ", "Switch off") : p("ਚਾਲੂ ਕਰੋ", "Switch on")}</button>
        </div>` : ""}
      </div>`;
    }).join("") || `<div class="row muted">${p("ਕੋਈ ਨਹੀਂ ਮਿਲਿਆ", "Nobody matches")}</div>`}</div>`;
}

function personDialog(person) {
  const roles = assignableRoles(state.me);
  const form = {
    role: person?.role || (isMain() ? "constituency_admin" : "officer"),
    cid: person?.constituency_id || (isMain() ? (state.cid === "*" ? state.constituencies[0]?.id : state.cid) : state.me.constituency_id) || "",
    depts: new Set(person ? state.links.filter((l) => l.user_id === person.id).map((l) => l.department_id) : [])
  };
  dlg.innerHTML = `<form method="dialog" id="person-form" class="dlg" novalidate>
    <header><h2>${person ? t("ਵਿਅਕਤੀ ਦੀ ਜਾਣਕਾਰੀ ਬਦਲੋ", "Edit person") : t("ਨਵਾਂ ਵਿਅਕਤੀ ਦਰਜ ਕਰੋ", "Register a person")}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <label class="fl"><span>${t("ਪੂਰਾ ਨਾਮ", "Full name")}</span><input class="inp" name="full_name" maxlength="120" value="${esc(person?.full_name)}" required></label>
      <label class="fl"><span>${t("ਮੋਬਾਈਲ ਨੰਬਰ", "Mobile number (this is their login)")}</span><input class="inp" name="mobile" inputmode="numeric" maxlength="10" value="${esc(person?.mobile)}" required></label>
      <label class="fl"><span>${t("ਪੱਧਰ", "Level")}</span><select class="inp" name="role">${roles.map((r) => opt(r, roleText(r), form.role)).join("")}</select></label>
      ${isMain() ? `<label class="fl"><span>${t("ਹਲਕਾ", "Constituency")}</span><select class="inp" name="constituency_id">${state.constituencies.filter((c) => c.active || c.id === form.cid).map((c) => opt(c.id, plainName(c), form.cid)).join("")}</select></label>` : ""}
      <div id="dept-box"></div>
      <p class="err" id="person-msg" role="alert"></p>
    </div>
    <footer><button type="button" class="btn" data-close>${p("ਰੱਦ ਕਰੋ", "Cancel")}</button><button class="btn primary" id="person-save">${person ? p("ਸੇਵ ਕਰੋ", "Save") : p("ਦਰਜ ਕਰੋ", "Register")}</button></footer>
  </form>`;
  const f = $("#person-form");
  const drawDepts = () => {
    const box = $("#dept-box");
    if (form.role !== "officer") { box.innerHTML = ""; return; }
    const list = deptsOf(form.cid).filter((d) => d.active || form.depts.has(d.id));
    box.innerHTML = `<fieldset class="checks"><legend>${t("ਵਿਭਾਗ (ਇੱਕ ਜਾਂ ਵੱਧ)", "Departments (one or more)")}</legend>
      ${list.map((d) => `<label class="check"><input type="checkbox" value="${esc(d.id)}" ${form.depts.has(d.id) ? "checked" : ""}> <span class="stack">${named(d)}</span></label>`).join("") || `<p class="muted small">${p("ਅਜੇ ਕੋਈ ਵਿਭਾਗ ਨਹੀਂ", "No departments yet")}</p>`}
    </fieldset>`;
  };
  drawDepts();
  f.addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "role") { form.role = el.value; drawDepts(); }
    if (el.name === "constituency_id") { form.cid = el.value; form.depts.clear(); drawDepts(); }
    if (el.matches(".check input")) { el.checked ? form.depts.add(el.value) : form.depts.delete(el.value); }
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#person-msg"), btn = $("#person-save");
    msg.textContent = "";
    const selectedRole = f.elements.namedItem("role").value;
    const selectedCid = isMain() ? f.elements.namedItem("constituency_id").value : state.me.constituency_id;
    const body = {
      full_name: f.full_name.value.trim(),
      mobile: f.mobile.value.trim(),
      role: selectedRole,
      constituency_id: selectedCid,
      department_ids: selectedRole === "officer"
        ? [...f.querySelectorAll("#dept-box input[type=checkbox]:checked")].map((input) => input.value)
        : []
    };
    let password;
    if (person) body.user_id = person.id;
    else body.password = password = makePassword();
    btn.disabled = true;
    try {
      await api.manage(person ? "update" : "create", body);
      await reload();
      if (person) { dlg.close(); toast(SAVED, "ok"); } else showPassword(body.full_name, body.mobile, password, p("ਦਰਜ ਹੋ ਗਿਆ", "Registered"));
      route();
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
  dlg.showModal();
}

function showPassword(name, mobile, password, verb) {
  dlg.innerHTML = `<div class="dlg">
    <header><h2>${esc(verb)}: ${esc(name)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <p class="stack">${t(`ਇਹ ਜਾਣਕਾਰੀ ${esc(name)} ਨੂੰ ਦਿਓ। ਪਹਿਲੀ ਵਾਰ ਲੌਗਇਨ ਕਰਨ 'ਤੇ ਉਹ ਆਪਣਾ ਪਾਸਵਰਡ ਬਣਾਉਣਗੇ।`, `Give these details to ${esc(name)}. They'll set their own password at first login.`)}</p>
      <div class="cred"><span>${p("ਮੋਬਾਈਲ", "Mobile")}</span><b>${esc(mobile)}</b><span>${p("ਆਰਜ਼ੀ ਪਾਸਵਰਡ", "Temporary password")}</span><b id="temp-pw">${esc(password)}</b></div>
      <p class="warn-box">${p("ਇਹ ਪਾਸਵਰਡ ਸਿਰਫ਼ ਇੱਕ ਵਾਰ ਦਿਖਦਾ ਹੈ। ਹੁਣੇ ਕਾਪੀ ਕਰ ਲਓ", "This password is shown only once. Copy it now.")}</p>
    </div>
    <footer><button type="button" class="btn" id="copy-cred">${p("ਕਾਪੀ ਕਰੋ", "Copy details")}</button><button type="button" class="btn primary" data-close>${p("ਹੋ ਗਿਆ", "Done")}</button></footer>
  </div>`;
  $("#copy-cred").addEventListener("click", async () => {
    const text = `dsidein Office\n${location.origin}\nMobile: ${mobile}\nTemporary password: ${password}`;
    try { await navigator.clipboard.writeText(text); toast(p("ਕਾਪੀ ਹੋ ਗਿਆ", "Copied"), "ok"); }
    catch { toast(p("ਕਾਪੀ ਨਹੀਂ ਹੋਇਆ, ਲਿਖ ਲਓ", "Could not copy. Please note it down."), "err"); }
  });
  if (!dlg.open) dlg.showModal();
}

function nameDialog(title, value, save) {
  dlg.innerHTML = `<form method="dialog" id="name-form" class="dlg" novalidate>
    <header><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="dlg-body">
      <label class="fl"><span>${t("ਨਾਮ (ਪੰਜਾਬੀ)", "Name (Punjabi)")}</span><input class="inp" name="name_pa" maxlength="120" value="${esc(value.name_pa)}"></label>
      <label class="fl"><span>${t("ਨਾਮ (ਅੰਗਰੇਜ਼ੀ)", "Name (English)")}</span><input class="inp" name="name" maxlength="120" value="${esc(value.name)}"></label>
      ${"days" in value ? `<label class="fl"><span>${t("ਦਿਨ", "Days")}</span><input class="inp" name="days" type="number" min="0" max="3650" value="${esc(value.days)}"></label>` : ""}
      <p class="err" id="name-msg" role="alert"></p>
    </div>
    <footer><button type="button" class="btn" data-close>${p("ਰੱਦ ਕਰੋ", "Cancel")}</button><button class="btn primary">${p("ਸੇਵ ਕਰੋ", "Save")}</button></footer>
  </form>`;
  const f = $("#name-form");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (!name) { $("#name-msg").textContent = p("ਅੰਗਰੇਜ਼ੀ ਨਾਮ ਲਿਖੋ", "Enter the English name"); return; }
    try {
      await save({ name, name_pa: f.name_pa.value.trim() || null, ...(f.days ? { days: f.days.value === "" ? null : Number(f.days.value) } : {}) });
      await reload();
      dlg.close();
      toast(SAVED, "ok");
      route();
    } catch (err) { $("#name-msg").textContent = err.message; }
  });
  dlg.showModal();
}
dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) dlg.close(); });

// ---------- activity ----------
const ACTION = {
  added: "ਜੋੜਿਆ · added", edited: "ਬਦਲਿਆ · edited", registered: "ਦਰਜ ਕੀਤਾ · registered",
  "switched on": "ਚਾਲੂ ਕੀਤਾ · switched on", "switched off": "ਬੰਦ ਕੀਤਾ · switched off", "reset the password of": "ਪਾਸਵਰਡ ਰੀਸੈੱਟ ਕੀਤਾ · reset the password of"
};
const ENTITY = { people: "ਵਿਅਕਤੀ / person", departments: "ਵਿਭਾਗ / department", constituencies: "ਹਲਕਾ / constituency", list_items: "ਸੂਚੀ / list" };
async function renderActivity() {
  const view = $("#view");
  const title = head(t("ਗਤੀਵਿਧੀ", "Activity"), t("ਕਿਸਨੇ ਕੀ ਬਦਲਿਆ, ਇਸਦਾ ਪੱਕਾ ਰਿਕਾਰਡ। ਇਸਨੂੰ ਬਦਲਿਆ ਨਹੀਂ ਜਾ ਸਕਦਾ।", "A permanent record of who changed what. It can't be edited."));
  view.innerHTML = `${title}<div class="list"><div class="row muted">…</div></div>`;
  try {
    const rows = await api.listActivity();
    if (state.screen !== "activity") return;
    view.innerHTML = `${title}
      <div class="list">${rows.map((a) => `<div class="row log">
        <div class="row-main"><span><strong>${esc(a.actor_name || "System")}</strong> — ${esc(ACTION[a.action] || a.action)} ${a.action.endsWith(" of") ? "" : `<span class="muted">${esc(ENTITY[a.entity] || a.entity)}</span>`} <strong>${esc(a.details?.name)}</strong>${a.details?.old_name ? ` (${esc(a.details.old_name)})` : ""}</span>
        <small>${fmtDate(a.at)}${isMain() && a.constituency_id ? " · " + esc(plainName(conById(a.constituency_id))) : ""}</small></div>
      </div>`).join("") || `<div class="row muted">${p("ਅਜੇ ਕੁਝ ਨਹੀਂ", "Nothing yet")}</div>`}</div>`;
  } catch (err) { toast(err.message, "err"); }
}

// ---------- my account ----------
function renderAccount() {
  const me = state.me, depts = personDepts(me.id);
  $("#view").innerHTML = `
    ${head(t("ਮੇਰਾ ਖਾਤਾ", "My account"))}
    <section class="panel"><div class="details">
      <div><span>${t("ਨਾਮ", "Name")}</span><b>${esc(me.full_name)}</b></div>
      <div><span>${t("ਮੋਬਾਈਲ", "Mobile (login)")}</span><b>${esc(me.mobile)}</b></div>
      <div><span>${t("ਪੱਧਰ", "Level")}</span><b>${esc(roleText(me.role))}</b></div>
      ${me.constituency_id ? `<div><span>${t("ਹਲਕਾ", "Constituency")}</span><b>${esc(plainName(conById(me.constituency_id)))}</b></div>` : ""}
      ${depts.length ? `<div><span>${t("ਵਿਭਾਗ", "Departments")}</span><b>${depts.map((d) => esc(plainName(d))).join(", ")}</b></div>` : ""}
    </div></section>
    <form class="panel narrow" data-form="change-pw" novalidate>
      <h2>${t("ਪਾਸਵਰਡ ਬਦਲੋ", "Change password")}</h2>
      <label class="fl"><span>${t("ਨਵਾਂ ਪਾਸਵਰਡ", "New password (at least 8 characters)")}</span><input class="inp" name="pw1" type="password" autocomplete="new-password"></label>
      <label class="fl"><span>${t("ਦੁਬਾਰਾ ਲਿਖੋ", "Type it again")}</span><input class="inp" name="pw2" type="password" autocomplete="new-password"></label>
      <button class="btn primary">${t("ਸੇਵ ਕਰੋ", "Save password")}</button>
    </form>`;
}

// ---------- events ----------
function onInput(e) {
  const el = e.target;
  const toggle = el.tagName === "SELECT" || el.type === "checkbox";
  if (toggle !== (e.type === "change")) return;
  if (el.dataset.pick) {
    el.checked ? state.picked.add(el.dataset.pick) : state.picked.delete(el.dataset.pick);
    el.closest(".app-row")?.classList.toggle("picked", el.checked);
    return updatePickbar();
  }
  if (el.id === "pick-con") { state.cid = el.value; state.dept = ""; state.af.dept = ""; return route(); }
  if (el.id === "f-q") { state.q = el.value; return renderPeopleList(); }
  if (el.id === "f-role") { state.role = el.value; return renderPeopleList(); }
  if (el.id === "f-dept") { state.dept = el.value; return renderPeopleList(); }
  if (el.id === "f-status") { state.status = el.value; return renderPeopleList(); }
  if (el.id === "af-q") { state.af.q = el.value; return renderAppResults(currentAppBase()); }
  if (el.id === "af-dept") { state.af.dept = el.value; return renderAppResults(currentAppBase()); }
  if (el.id === "af-cat") { state.af.cat = el.value; return renderAppResults(currentAppBase()); }
}

async function onClick(e) {
  const rowLink = e.target.closest("[data-href]");
  if (rowLink && !e.target.closest("a, button, label, input")) { location.hash = rowLink.dataset.href; return; }
  if (e.target.closest("a") && e.target.closest("[data-act='go-apps']")) return; // a phone link inside a row
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id;
  try {
    switch (act) {
      case "refresh-online": await reload(); return route();
      case "new-again": renderAppForm(); return window.scrollTo({ top: 0 });
      case "go-apps": return goApps({ status: b.dataset.status || "", dept: b.dataset.dept || "", officer: b.dataset.officer || "", cid: b.dataset.cid });
      case "go-people":
        state.role = b.dataset.role || ""; state.dept = ""; state.status = ""; state.q = "";
        if (isMain() && state.section) state.cid = "*";
        location.hash = "#/people";
        return;
      case "clear-af": state.af = blankAppFilter(); return route();
      case "pick-all": {
        const list = state.shown || [], all = list.every((a) => state.picked.has(a.id));
        list.forEach((a) => (all ? state.picked.delete(a.id) : state.picked.add(a.id)));
        return renderAppResults(currentAppBase());
      }
      case "pick-clear": state.picked.clear(); return renderAppResults(currentAppBase());
      case "pick-assign": return assignDialog(pickedApps());
      case "pick-share": return shareDialog(pickedApps());
      case "share": return shareDialog([state.apps.find((a) => a.id === id)]);
      case "export-apps": return exportDialog();
      case "assign": return assignDialog(state.apps.find((a) => a.id === id));
      case "view-image": return b.dataset.src ? showImage(b.dataset.src) : undefined;
      case "move": {
        const a = state.apps.find((x) => x.id === id), to = b.dataset.to;
        return noteDialog(a, { title: t(...moveLabel(a, to)), required: noteNeeded(state.me.role, a.status, to), save: (note) => api.changeStatus(a.id, to, note) });
      }
      case "note": {
        const a = state.apps.find((x) => x.id === id);
        return noteDialog(a, { title: t("ਨੋਟ ਜੋੜੋ", "Add note"), required: true, save: (note) => api.addNote(a.id, note) });
      }
      case "remove-app": {
        const a = state.apps.find((x) => x.id === id);
        if (!confirm(`${appNo(a)} · ${a.name}\n\nਇਹ ਅਰਜ਼ੀ ਸੂਚੀ ਵਿੱਚੋਂ ਹਟਾਉਣੀ ਹੈ? ਐਡਮਿਨ ਇਸਨੂੰ ਵਾਪਸ ਲਿਆ ਸਕਦੇ ਹਨ।\nRemove this application from the list? Admins can restore it.`)) return;
        await run(b, () => api.removeApplication(id, ""));
        break;
      }
      case "restore-app": await run(b, () => api.restoreApplication(id)); break;
      case "report-csv": {
        const head2 = [b.dataset.name, ...REPORT_HEAD.map((h) => p(...h))];
        return downloadCSV(`report-${b.dataset.name}`, head2, reportData[b.dataset.key].map((r) => [r.label, ...r.cells]));
      }
      case "list-kind": state.listKind = b.dataset.kind; return renderLists();
      case "edit-item": {
        const it = state.lists.find((x) => x.id === id);
        const value = { name: it.name, name_pa: it.name_pa, ...(it.kind === "revisit" ? { days: it.days } : {}) };
        return nameDialog(t("ਸੂਚੀ ਬਦਲੋ", "Edit list item"), value, (v) => api.updateListItem(id, v));
      }
      case "toggle-item": {
        const it = state.lists.find((x) => x.id === id);
        await run(b, () => api.updateListItem(id, { active: !it.active }));
        break;
      }
      case "af-status": {
        state.af.status = state.af.status === b.dataset.status ? "" : b.dataset.status;
        const base = currentAppBase();
        $("#app-tiles").innerHTML = statusTiles(base);
        return renderAppResults(base);
      }
      case "open-con":
        state.cid = id;
        location.hash = "#/departments";
        return;
      case "edit-con": {
        const c = conById(id);
        return nameDialog(t("ਹਲਕਾ ਬਦਲੋ", "Edit constituency"), { name: c.name, name_pa: c.name_pa }, (v) => api.updateConstituency(id, v));
      }
      case "toggle-con": {
        const c = conById(id);
        if (c.active && !confirm(`${plainName(c)}\n\nਇਸ ਹਲਕੇ ਦੇ ਸਾਰੇ ਲੋਕਾਂ ਦੀ ਪਹੁੰਚ ਬੰਦ ਹੋ ਜਾਵੇਗੀ। ਕੋਈ ਡਾਟਾ ਨਹੀਂ ਮਿਟੇਗਾ।\nEveryone in this constituency will lose access. No data is deleted.`)) return;
        await run(b, () => api.updateConstituency(id, { active: !c.active }));
        break;
      }
      case "edit-dept": {
        const d = deptById(id);
        return nameDialog(t("ਵਿਭਾਗ ਦਾ ਨਾਮ ਬਦਲੋ", "Rename department"), { name: d.name, name_pa: d.name_pa }, (v) => api.updateDepartment(id, v));
      }
      case "toggle-dept": {
        const d = deptById(id);
        await run(b, () => api.updateDepartment(id, { active: !d.active }));
        break;
      }
      case "add-person":
        if (isMain() && !state.constituencies.some((c) => c.active)) return toast(p("ਪਹਿਲਾਂ ਹਲਕਾ ਜੋੜੋ", "Add a constituency first"), "err");
        return personDialog(null);
      case "edit-person":
        return personDialog(state.people.find((x) => x.id === id));
      case "toggle-person": {
        const x = state.people.find((y) => y.id === id);
        if (x.active && !confirm(`${x.full_name}\n\nਇਸ ਵਿਅਕਤੀ ਦੀ ਪਹੁੰਚ ਤੁਰੰਤ ਬੰਦ ਹੋ ਜਾਵੇਗੀ। ਪੁਰਾਣਾ ਕੰਮ ਰਿਕਾਰਡ ਵਿੱਚ ਰਹੇਗਾ।\nThey will lose access straight away. Their past work stays in the records.`)) return;
        await run(b, () => api.manage("set_active", { user_id: id, active: !x.active }));
        break;
      }
      case "reset-person": {
        const x = state.people.find((y) => y.id === id);
        if (!confirm(`${x.full_name}\n\nਪਾਸਵਰਡ ਰੀਸੈੱਟ ਕਰਨਾ ਹੈ?\nReset this password?`)) return;
        const password = makePassword();
        await run(b, () => api.manage("reset_password", { user_id: id, password }));
        await reload();
        route();
        return showPassword(x.full_name, x.mobile, password, p("ਪਾਸਵਰਡ ਰੀਸੈੱਟ", "Password reset"));
      }
      default: return;
    }
    await reload();
    route();
    toast(SAVED, "ok");
  } catch { /* run() already showed the message */ }
}

async function onSubmit(e) {
  const f = e.target, kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const btn = f.querySelector("button.primary");
  const ENTER = p("ਅੰਗਰੇਜ਼ੀ ਨਾਮ ਲਿਖੋ", "Enter the English name");
  try {
    if (kind === "add-con") {
      const name = f.name.value.trim();
      if (!name) return toast(ENTER, "err");
      await run(btn, () => api.addConstituency({ name, name_pa: f.name_pa.value.trim() || null }));
      await reload();
      state.cid = state.constituencies.find((c) => c.name === name)?.id || state.cid;
      toast(p("ਹਲਕਾ ਅਤੇ ਮੁੱਢਲੇ ਵਿਭਾਗ ਜੁੜ ਗਏ", "Constituency added with its starting departments"), "ok");
    } else if (kind === "add-dept") {
      const name = f.name.value.trim();
      if (!name) return toast(ENTER, "err");
      await run(btn, () => api.addDepartment({ constituency_id: workingCid(), name, name_pa: f.name_pa.value.trim() || null }));
      await reload();
      toast(p("ਵਿਭਾਗ ਜੁੜ ਗਿਆ", "Department added"), "ok");
    } else if (kind === "add-item") {
      const name = f.name.value.trim();
      if (!name) return toast(ENTER, "err");
      await run(btn, () => api.addListItem({ kind: state.listKind, name, name_pa: f.name_pa.value.trim() || null, ...(f.days?.value ? { days: Number(f.days.value) } : {}), sort_order: 99 }));
      await reload();
      toast(SAVED, "ok");
    } else if (kind === "portal") {
      const url = f.url.value.trim();
      if (url && !safeUrl(url)) return toast(p("ਲਿੰਕ https:// ਨਾਲ ਸ਼ੁਰੂ ਹੋਵੇ", "The link must start with https://"), "err");
      await run(btn, () => api.saveSetting("polling_portal_url", url));
      await reload();
      toast(SAVED, "ok");
    } else if (kind === "change-pw") {
      const a = f.pw1.value, b = f.pw2.value;
      if (!validPassword(a)) return toast(PW_SHORT, "err");
      if (a !== b) return toast(PW_DIFF, "err");
      await run(btn, () => api.changePassword(a));
      toast(SAVED, "ok");
    }
    route();
  } catch { /* run() already showed the message */ }
}

// ---------- start ----------
async function start() {
  try {
    state.me = await api.getMe();
  } catch (err) {
    state.me = null;
    return showLogin(err.message);
  }
  if (!state.me) return showLogin();
  if (state.me.must_change_password) return showChangePassword();
  try {
    await reload();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<main class="login"><div class="login-card"><h1>${t("ਲੋਡ ਨਹੀਂ ਹੋਇਆ", "Could not load")}</h1><p class="muted">${esc(err.message)}</p><button class="btn primary wide" id="retry">${t("ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ", "Try again")}</button></div></main>`;
    $("#retry").addEventListener("click", start);
    return;
  }
  shell();
  route();
}

start();
