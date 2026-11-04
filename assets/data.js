// Data layer: Supabase when configured, otherwise a browser-only demo with the same behaviour.
import { supabaseUrl, supabaseAnonKey } from "./config.js";
import { toEmail, checkCreate, checkUpdate, checkTarget, checkReset } from "./rules.js";
import { canMove, noteNeeded, wfRole } from "./workflow.js";

export const isDemo = !supabaseUrl || supabaseUrl.startsWith("PASTE");
export const LIMITS = { dbBytes: 500 * 1024 * 1024, imageBytes: 1024 * 1024 * 1024 };
const BUCKET = "application-images";

const MSG = {
  taken: "ਇਹ ਨਾਮ ਪਹਿਲਾਂ ਹੀ ਮੌਜੂਦ ਹੈ · This name already exists",
  wrong: "ਮੋਬਾਈਲ ਨੰਬਰ ਜਾਂ ਪਾਸਵਰਡ ਗਲਤ ਹੈ · Wrong mobile number or password",
  off: "ਤੁਹਾਡੀ ਪਹੁੰਚ ਬੰਦ ਹੈ। ਆਪਣੇ ਐਡਮਿਨ ਨਾਲ ਗੱਲ ਕਰੋ · Your access is switched off. Contact your admin.",
  net: "ਲੋਡ ਨਹੀਂ ਹੋਇਆ। ਇੰਟਰਨੈੱਟ ਚੈੱਕ ਕਰੋ · Could not load. Check your internet connection.",
  failed: "ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ। ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ · Something went wrong. Please try again.",
  samePw: "ਪੁਰਾਣੇ ਤੋਂ ਵੱਖਰਾ ਪਾਸਵਰਡ ਚੁਣੋ · Choose a different password from the old one",
  mobile: "ਇਹ ਮੋਬਾਈਲ ਨੰਬਰ ਪਹਿਲਾਂ ਹੀ ਦਰਜ ਹੈ · This mobile number is already registered",
  denied: "ਇਜਾਜ਼ਤ ਨਹੀਂ · Not allowed",
  noteNeeded: "ਕਿਰਪਾ ਕਰਕੇ ਨੋਟ ਲਿਖੋ · Please write a note",
  badMove: "ਇਹ ਬਦਲਾਅ ਨਹੀਂ ਹੋ ਸਕਦਾ · This change is not allowed",
  storage: "ਡੈਮੋ ਦੀ ਥਾਂ ਭਰ ਗਈ, ਤਸਵੀਰ ਸੇਵ ਨਹੀਂ ਹੋਈ · Demo storage is full, the image was not saved"
};

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// =====================================================================
// Supabase
// =====================================================================
let client;
function sb() {
  if (client) return Promise.resolve(client);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "assets/vendor/supabase.js";
    s.onload = () => { client = window.supabase.createClient(supabaseUrl, supabaseAnonKey); resolve(client); };
    s.onerror = () => reject(new Error(MSG.net));
    document.head.append(s);
  });
}
function must({ data, error }) {
  if (error) {
    if (error.code === "23505") throw new Error(MSG.taken);
    throw new Error(error.message);
  }
  return data;
}

const real = {
  async signIn(mobile, password) {
    const c = await sb();
    const { error } = await c.auth.signInWithPassword({ email: toEmail(mobile), password });
    if (error) {
      if (/banned/i.test(error.message)) throw new Error(MSG.off);
      if (/invalid/i.test(error.message)) throw new Error(MSG.wrong);
      throw new Error(error.message);
    }
  },
  async signOut() { const c = await sb(); await c.auth.signOut(); },
  async getMe() {
    const c = await sb();
    const { data: { session } } = await c.auth.getSession();
    if (!session) return null;
    const me = must(await c.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
    const role = must(await c.rpc("my_role"));
    if (!me || !role) {
      await c.auth.signOut();
      throw new Error(MSG.off);
    }
    return me;
  },
  async changePassword(password) {
    const c = await sb();
    const { error } = await c.auth.updateUser({ password });
    if (error) throw new Error(/different/i.test(error.message) ? MSG.samePw : error.message);
    must(await c.rpc("password_changed"));
  },
  async listConstituencies() { const c = await sb(); return must(await c.from("constituencies").select("*").order("name")); },
  async listDepartments() { const c = await sb(); return must(await c.from("departments").select("*").order("name")); },
  async listPeople() { const c = await sb(); return must(await c.from("profiles").select("*").order("full_name")); },
  async listLinks() { const c = await sb(); return must(await c.from("officer_departments").select("*")); },
  async listActivity() { const c = await sb(); return must(await c.from("audit_log").select("*").order("at", { ascending: false }).limit(300)); },
  async listApplications() { const c = await sb(); return must(await c.from("applications").select("*").order("created_at", { ascending: false })); },
  async listApplicationOfficers() { const c = await sb(); return must(await c.from("application_officers").select("*")); },
  async listEvents(applicationId) { const c = await sb(); return must(await c.from("application_events").select("*").eq("application_id", applicationId).order("at")); },
  async listRecentEvents(limit) { const c = await sb(); return must(await c.from("application_events").select("*").order("at", { ascending: false }).limit(limit)); },
  async addConstituency(row) { const c = await sb(); must(await c.from("constituencies").insert(row)); },
  async updateConstituency(id, patch) { const c = await sb(); must(await c.from("constituencies").update(patch).eq("id", id)); },
  async addDepartment(row) { const c = await sb(); must(await c.from("departments").insert(row)); },
  async updateDepartment(id, patch) { const c = await sb(); must(await c.from("departments").update(patch).eq("id", id)); },
  async dbUsage() { const c = await sb(); return must(await c.rpc("db_usage")); },
  async storageUsage() { const c = await sb(); return must(await c.rpc("storage_usage")); },
  async listItems() { const c = await sb(); return must(await c.from("list_items").select("*").order("sort_order").order("name")); },
  async addListItem(row) { const c = await sb(); must(await c.from("list_items").insert(row)); },
  async updateListItem(id, patch) { const c = await sb(); must(await c.from("list_items").update(patch).eq("id", id)); },
  async getSettings() { const c = await sb(); return Object.fromEntries(must(await c.from("app_settings").select("*")).map((r) => [r.key, r.value])); },
  async saveSetting(key, value) { const c = await sb(); must(await c.from("app_settings").update({ value }).eq("key", key)); },
  async createApplication(p) { const c = await sb(); return must(await c.rpc("create_application", { p })); },
  async updateApplication(p_app, p) { const c = await sb(); must(await c.rpc("update_application", { p_app, p })); },
  async assignApplication(p_app, p_department, p_officers, p_note) { const c = await sb(); return must(await c.rpc("assign_application", { p_app, p_department, p_officers, p_note })); },
  async changeStatus(p_app, p_status, p_note) { const c = await sb(); return must(await c.rpc("change_status", { p_app, p_status, p_note })); },
  async addNote(p_app, p_note) { const c = await sb(); return must(await c.rpc("add_note", { p_app, p_note })); },
  async removeApplication(p_app, p_note) { const c = await sb(); must(await c.rpc("remove_application", { p_app, p_note })); },
  async restoreApplication(p_app) { const c = await sb(); must(await c.rpc("restore_application", { p_app })); },
  async listImages(appId) { const c = await sb(); return must(await c.from("application_images").select("*").eq("application_id", appId).order("at")); },
  async imageUrls(paths) {
    if (!paths.length) return {};
    const c = await sb();
    const rows = must(await c.storage.from(BUCKET).createSignedUrls(paths, 3600));
    return Object.fromEntries(rows.map((r) => [r.path, r.signedUrl]));
  },
  async uploadImage(app, blob, eventId) {
    const c = await sb();
    const path = `${app.constituency_id}/${app.id}/${crypto.randomUUID()}.jpg`;
    must(await c.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
    const p_size = blob.size;
    must(await c.rpc("add_image", { p_app: app.id, p_path: path, p_size, p_event: eventId ?? null }));
  },
  async manage(action, body) {
    const c = await sb();
    const { data, error } = await c.functions.invoke("admin-users", { body: { action, ...body } });
    if (error) {
      let msg = MSG.failed;
      try { msg = (await error.context.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return data;
  }
};

// =====================================================================
// Demo (localStorage)
// =====================================================================
const KEY = "ofc_demo_v3";
const TEMPLATES = [["Water", "ਪਾਣੀ"], ["Electricity", "ਬਿਜਲੀ"], ["Drugs", "ਨਸ਼ਾ"], ["Roads", "ਸੜਕਾਂ"], ["Health", "ਸਿਹਤ"], ["Education", "ਸਿੱਖਿਆ"], ["Revenue", "ਮਾਲ ਵਿਭਾਗ"], ["Police", "ਪੁਲਿਸ"], ["Pension", "ਪੈਨਸ਼ਨ"], ["Other", "ਹੋਰ"]];
const daysAgo = (n, h = 0) => new Date(Date.now() - n * 864e5 - h * 36e5).toISOString();
const item = (kind, name, name_pa, sort_order, days = null) => ({ id: uid(), kind, name, name_pa, days, active: true, sort_order, created_at: now() });
const DEMO_LISTS = [
  ...TEMPLATES.map(([n, pa], i) => item("category", n, pa, i)),
  ...[["1 week", "1 ਹਫ਼ਤਾ", 7], ["15 days", "15 ਦਿਨ", 15], ["1 month", "1 ਮਹੀਨਾ", 30], ["3 months", "3 ਮਹੀਨੇ", 90]].map(([n, pa, d], i) => item("revisit", n, pa, i, d)),
  ...[["Fatehgarh Sahib", "ਫ਼ਤਹਿਗੜ੍ਹ ਸਾਹਿਬ"], ["Ludhiana", "ਲੁਧਿਆਣਾ"], ["Patiala", "ਪਟਿਆਲਾ"]].map(([n, pa], i) => item("district", n, pa, i)),
  ...[["Fatehgarh Sahib", "ਫ਼ਤਹਿਗੜ੍ਹ ਸਾਹਿਬ"], ["Ludhiana", "ਲੁਧਿਆਣਾ"], ["Patiala", "ਪਟਿਆਲਾ"]].map(([n, pa], i) => item("parliamentary", n, pa, i))
];

function seedDemo() {
  const con = (name, name_pa) => ({ id: uid(), name, name_pa, active: true, created_at: now() });
  const a = con("Samrala", "ਸਮਰਾਲਾ"), b = con("Rajpura", "ਰਾਜਪੁਰਾ");
  const departments = [a, b].flatMap((c) => TEMPLATES.map(([name, name_pa]) => ({ id: uid(), constituency_id: c.id, name, name_pa, active: true, created_at: now() })));
  const p = (full_name, mobile, role, constituency_id) => ({ id: uid(), full_name, mobile, role, constituency_id, active: true, must_change_password: false, created_at: now() });
  const people = [
    p("Demo Super Admin", "9000000001", "main_admin", null),
    p("Demo Samrala Admin", "9000000002", "constituency_admin", a.id),
    p("Demo Rajpura Admin", "9000000003", "constituency_admin", b.id),
    p("Demo Samrala Staff", "9000000004", "staff", a.id),
    p("Demo Water Officer", "9000000005", "officer", a.id),
    p("Demo Road Officer", "9000000006", "officer", a.id),
    p("Demo Rajpura Officer", "9000000007", "officer", b.id)
  ];
  const [, adminA, adminB, staffA, waterOfficer, roadOfficer, officerB] = people;
  const dept = (cid, n) => departments.find((d) => d.constituency_id === cid && d.name === n).id;
  const links = [
    { user_id: waterOfficer.id, department_id: dept(a.id, "Water"), constituency_id: a.id },
    { user_id: waterOfficer.id, department_id: dept(a.id, "Drugs"), constituency_id: a.id },
    { user_id: roadOfficer.id, department_id: dept(a.id, "Roads"), constituency_id: a.id },
    { user_id: officerB.id, department_id: dept(b.id, "Water"), constituency_id: b.id }
  ];

  // Sample applications so the Applications section can be tried. All names are examples.
  const applications = [], application_officers = [], events = [];
  let no = 0;
  const ev = (app, at, who, to_status, note) => events.push({ id: uid(), application_id: app.id, at, actor_id: who?.id, actor_name: who?.full_name, actor_role: who?.role, to_status, note });
  const add = (cid, dname, category, details, status, day, officers = []) => {
    no += 1;
    const app = {
      id: uid(), no, constituency_id: cid, department_id: dname ? dept(cid, dname) : null, status,
      name: `Sample Person ${no}`, father_name: `Sample Father ${no}`, voter_id: `ABC${String(no).padStart(7, "0")}`,
      mobile: `90000100${String(no).padStart(2, "0")}`, mobile2: no % 3 === 0 ? `90000200${String(no).padStart(2, "0")}` : "",
      village: `Sample Village ${(no % 4) + 1}`, area: `Ward ${(no % 6) + 1}`, district: cid === a.id ? "Ludhiana" : "Patiala",
      polling_station: `Booth ${10 + no}`, parliamentary: cid === a.id ? "Fatehgarh Sahib" : "Patiala",
      category, reference: no % 2 ? "Sarpanch" : "", revisit_time: ["1 week", "15 days", "1 month"][no % 3],
      revisit_on: daysAgo(day - [7, 15, 30][no % 3]).slice(0, 10), deleted: false, details,
      created_by: staffA.id, created_at: daysAgo(day), updated_at: daysAgo(Math.max(0, day - 3))
    };
    applications.push(app);
    officers.forEach((o) => application_officers.push({ application_id: app.id, user_id: o.id, constituency_id: cid }));
    return app;
  };
  const steps = (app, day, adminWho, officer, notes) => {
    ev(app, daysAgo(day), staffA, "new", "ਅਰਜ਼ੀ ਦਰਜ ਕੀਤੀ · Application registered");
    if (app.status === "new") return;
    ev(app, daysAgo(day, -4), adminWho, "assigned", `${officer?.full_name || "ਵਿਭਾਗ"} ਨੂੰ ਸੌਂਪੀ · Assigned`);
    if (app.status === "returned") return ev(app, daysAgo(day - 1), officer, "returned", notes[0]);
    if (app.status === "assigned") return;
    ev(app, daysAgo(day - 1), officer, "in_progress", notes[0]);
    if (notes[1]) ev(app, daysAgo(day - 2), officer, "in_progress", notes[1]);
    if (app.status === "in_progress") return;
    ev(app, daysAgo(day - 3), officer, "solved", notes[2] || "ਕੰਮ ਪੂਰਾ ਹੋਇਆ · Work completed");
    if (app.status === "closed") ev(app, daysAgo(Math.max(0, day - 4)), adminWho, "closed", "ਜਾਂਚ ਕੀਤੀ, ਅਰਜ਼ੀ ਬੰਦ · Checked and closed");
  };
  const mk = (cid, dname, cat, details, status, day, officer, notes = []) => {
    const app = add(cid, dname, cat, details, status, day, officer ? [officer] : []);
    steps(app, day, cid === a.id ? adminA : adminB, officer, notes);
  };
  mk(a.id, null, "Water", "ਪਿੰਡ ਵਿੱਚ ਤਿੰਨ ਦਿਨਾਂ ਤੋਂ ਪਾਣੀ ਨਹੀਂ ਆ ਰਿਹਾ। · No water supply in the village for three days.", "new", 1);
  mk(a.id, "Water", "Water", "ਗਲੀ ਵਿੱਚ ਪਾਈਪ ਲੀਕ ਹੈ। · A pipe is leaking in the street.", "assigned", 3, waterOfficer);
  mk(a.id, "Water", "Water", "ਟਿਊਬਵੈੱਲ ਦੀ ਮੋਟਰ ਖਰਾਬ ਹੈ। · The tubewell motor is not working.", "in_progress", 8, waterOfficer, ["ਮੌਕੇ 'ਤੇ ਜਾਂਚ ਕੀਤੀ · Inspected the site", "ਨਵੀਂ ਮੋਟਰ ਮੰਗਵਾਈ · New motor ordered"]);
  mk(a.id, "Roads", "Roads", "ਮੁੱਖ ਸੜਕ 'ਤੇ ਵੱਡੇ ਟੋਏ ਹਨ। · Large potholes on the main road.", "in_progress", 12, roadOfficer, ["ਵਿਭਾਗ ਨੂੰ ਅੰਦਾਜ਼ਾ ਭੇਜਿਆ · Estimate sent to the department"]);
  mk(a.id, "Roads", "Roads", "ਸਕੂਲ ਕੋਲ ਸੜਕ ਟੁੱਟੀ ਹੈ। · The road near the school is broken.", "solved", 20, roadOfficer, ["ਕੰਮ ਸ਼ੁਰੂ ਕੀਤਾ · Work started", null, "ਸੜਕ ਠੀਕ ਕਰ ਦਿੱਤੀ · Road repaired"]);
  mk(a.id, "Drugs", "Drugs", "ਇਲਾਕੇ ਵਿੱਚ ਨਸ਼ੇ ਦੀ ਸ਼ਿਕਾਇਤ। · Complaint about drugs in the area.", "closed", 26, waterOfficer, ["ਪੁਲਿਸ ਨਾਲ ਗੱਲ ਕੀਤੀ · Spoke with the police", null, "ਕਾਰਵਾਈ ਹੋਈ · Action taken"]);
  mk(a.id, "Water", "Electricity", "ਬਿਜਲੀ ਦੇ ਖੰਭੇ ਦੀ ਸ਼ਿਕਾਇਤ। · Complaint about an electricity pole.", "returned", 5, waterOfficer, ["ਇਹ ਬਿਜਲੀ ਵਿਭਾਗ ਦਾ ਕੰਮ ਹੈ · This belongs to the Electricity department"]);
  mk(b.id, "Water", "Water", "ਵਾਰਡ ਵਿੱਚ ਗੰਦਾ ਪਾਣੀ ਆ ਰਿਹਾ ਹੈ। · Dirty water supply in the ward.", "in_progress", 6, officerB, ["ਸੈਂਪਲ ਲਏ · Water samples taken"]);
  mk(b.id, null, "Pension", "ਬੁਢਾਪਾ ਪੈਨਸ਼ਨ ਨਹੀਂ ਮਿਲ ਰਹੀ। · Old-age pension not received.", "new", 0);
  return { constituencies: [a, b], departments, people, links, applications, application_officers, events, images: [], lists: DEMO_LISTS, settings: { polling_portal_url: "https://electoralsearch.eci.gov.in/" }, nextNo: no + 1, activity: [], me: null };
}
function store() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch {}
  const s = seedDemo();
  saveStore(s);
  return s;
}
function saveStore(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch { throw new Error(MSG.storage); }
}
const pause = () => new Promise((r) => setTimeout(r, 120));
const byName = (k) => (x, y) => String(x[k]).localeCompare(String(y[k]));

function demoMe(s) {
  const me = s.people.find((p) => p.id === s.me);
  if (!me?.active) return null;
  if (me.constituency_id && !s.constituencies.find((c) => c.id === me.constituency_id)?.active) return null;
  return me;
}
const inScope = (me, cid) => me.role === "main_admin" || me.constituency_id === cid;
const isAdminOf = (me, cid) => me.role === "main_admin" || (me.role === "constituency_admin" && me.constituency_id === cid);
function canReadApp(s, me, app) {
  if (app.deleted && !["main_admin", "constituency_admin"].includes(me.role)) return false;
  if (me.role === "main_admin") return true;
  if (["constituency_admin", "staff"].includes(me.role)) return app.constituency_id === me.constituency_id;
  return s.links.some((l) => l.user_id === me.id && l.department_id === app.department_id);
}
function logDemo(s, action, entity, row, cid) {
  const me = demoMe(s);
  s.activity.unshift({ id: uid(), at: now(), actor_id: me?.id, actor_name: me?.full_name, action, entity, entity_id: row.id, constituency_id: cid, details: { name: row.name || row.full_name, role: row.role } });
}
function checkFields(p) {
  if (!String(p.name || "").trim()) throw new Error("ਨਾਮ ਲਿਖੋ · Enter the name");
  if (!/^[6-9][0-9]{9}$/.test(p.mobile || "")) throw new Error("ਸਹੀ 10 ਅੰਕਾਂ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ ਲਿਖੋ · Enter a valid 10-digit mobile number");
  if (p.mobile2 && !/^[6-9][0-9]{9}$/.test(p.mobile2)) throw new Error("ਦੂਜਾ ਮੋਬਾਈਲ ਨੰਬਰ ਸਹੀ ਨਹੀਂ · Mobile number 2 is not valid");
  if (!String(p.details || "").trim()) throw new Error("ਸਮੱਸਿਆ ਦਾ ਵੇਰਵਾ ਲਿਖੋ · Enter the details of the problem");
}
function fieldsOf(s, p, from) {
  const days = s.lists.find((i) => i.kind === "revisit" && i.name === p.revisit_time)?.days;
  const revisit_on = days == null ? null : new Date(from.getTime() + days * 864e5).toISOString().slice(0, 10);
  const keep = ["father_name", "mobile", "mobile2", "village", "area", "district", "polling_station", "parliamentary", "category", "reference", "revisit_time", "details"];
  return { ...Object.fromEntries(keep.map((k) => [k, p[k] || ""])), name: p.name.trim(), voter_id: (p.voter_id || "").trim().toUpperCase(), revisit_on };
}
function loadApp(s, me, id) {
  const a = s.applications.find((x) => x.id === id);
  if (!a || !canReadApp(s, me, a)) throw new Error("ਅਰਜ਼ੀ ਨਹੀਂ ਮਿਲੀ ਜਾਂ ਇਜਾਜ਼ਤ ਨਹੀਂ · Application not found or not allowed");
  return a;
}
function demoEvent(s, app, to_status, note) {
  const me = demoMe(s), id = uid();
  s.events.push({ id, application_id: app.id, at: now(), actor_id: me.id, actor_name: me.full_name, actor_role: me.role, to_status, note: (note || "").trim() || null });
  return id;
}
const nameTaken = (list, name, id) => list.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.trim().toLowerCase());

const demo = {
  async signIn(mobile) {
    await pause();
    const s = store();
    const p = s.people.find((x) => x.mobile === mobile);
    if (!p) throw new Error(MSG.wrong);
    if (!p.active) throw new Error(MSG.off);
    s.me = p.id;
    saveStore(s);
  },
  async signOut() { const s = store(); s.me = null; saveStore(s); },
  async getMe() {
    const s = store();
    if (!s.me) return null;
    const me = demoMe(s);
    if (!me) { s.me = null; saveStore(s); throw new Error(MSG.off); }
    return me;
  },
  async changePassword() { await pause(); const s = store(); demoMe(s).must_change_password = false; saveStore(s); },
  async listConstituencies() {
    const s = store(), me = demoMe(s);
    return s.constituencies.filter((c) => inScope(me, c.id)).sort(byName("name"));
  },
  async listDepartments() {
    const s = store(), me = demoMe(s);
    return s.departments.filter((d) => inScope(me, d.constituency_id)).sort(byName("name"));
  },
  async listPeople() {
    const s = store(), me = demoMe(s);
    const seeAll = ["constituency_admin", "staff"].includes(me.role);
    return s.people.filter((p) => p.id === me.id || me.role === "main_admin" || (seeAll && p.constituency_id === me.constituency_id)).sort(byName("full_name"));
  },
  async listLinks() {
    const s = store(), me = demoMe(s);
    const seeAll = ["constituency_admin", "staff"].includes(me.role);
    return s.links.filter((l) => l.user_id === me.id || me.role === "main_admin" || (seeAll && l.constituency_id === me.constituency_id));
  },
  async listActivity() {
    const s = store(), me = demoMe(s);
    if (me.role === "main_admin") return s.activity.slice(0, 300);
    return me.role === "constituency_admin" ? s.activity.filter((a) => a.constituency_id === me.constituency_id).slice(0, 300) : [];
  },
  async listApplications() {
    const s = store(), me = demoMe(s);
    return s.applications.filter((a) => canReadApp(s, me, a)).sort((x, y) => y.created_at.localeCompare(x.created_at));
  },
  async listApplicationOfficers() {
    const s = store(), me = demoMe(s);
    const seen = new Set(s.applications.filter((a) => canReadApp(s, me, a)).map((a) => a.id));
    return s.application_officers.filter((o) => seen.has(o.application_id));
  },
  async listRecentEvents(limit) {
    const s = store(), me = demoMe(s);
    const seen = new Set(s.applications.filter((a) => canReadApp(s, me, a)).map((a) => a.id));
    return s.events.filter((e) => seen.has(e.application_id)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  },
  async listEvents(applicationId) {
    const s = store(), me = demoMe(s);
    const app = s.applications.find((a) => a.id === applicationId);
    if (!app || !canReadApp(s, me, app)) return [];
    return s.events.filter((e) => e.application_id === applicationId).sort((x, y) => x.at.localeCompare(y.at));
  },
  async addConstituency(row) {
    await pause();
    const s = store();
    if (demoMe(s).role !== "main_admin") throw new Error(MSG.denied);
    if (nameTaken(s.constituencies, row.name)) throw new Error(MSG.taken);
    const c = { id: uid(), active: true, created_at: now(), ...row };
    s.constituencies.push(c);
    TEMPLATES.forEach(([name, name_pa]) => s.departments.push({ id: uid(), constituency_id: c.id, name, name_pa, active: true, created_at: now() }));
    logDemo(s, "added", "constituencies", c, c.id);
    saveStore(s);
  },
  async updateConstituency(id, patch) {
    await pause();
    const s = store();
    if (demoMe(s).role !== "main_admin") throw new Error(MSG.denied);
    const c = s.constituencies.find((x) => x.id === id);
    if (patch.name && nameTaken(s.constituencies, patch.name, id)) throw new Error(MSG.taken);
    const action = "active" in patch && patch.active !== c.active ? (patch.active ? "switched on" : "switched off") : "edited";
    Object.assign(c, patch);
    logDemo(s, action, "constituencies", c, c.id);
    saveStore(s);
  },
  async addDepartment(row) {
    await pause();
    const s = store();
    if (!isAdminOf(demoMe(s), row.constituency_id)) throw new Error(MSG.denied);
    if (nameTaken(s.departments.filter((d) => d.constituency_id === row.constituency_id), row.name)) throw new Error(MSG.taken);
    const d = { id: uid(), active: true, created_at: now(), ...row };
    s.departments.push(d);
    logDemo(s, "added", "departments", d, d.constituency_id);
    saveStore(s);
  },
  async updateDepartment(id, patch) {
    await pause();
    const s = store();
    const d = s.departments.find((x) => x.id === id);
    if (!isAdminOf(demoMe(s), d.constituency_id)) throw new Error(MSG.denied);
    if (patch.name && nameTaken(s.departments.filter((x) => x.constituency_id === d.constituency_id), patch.name, id)) throw new Error(MSG.taken);
    const action = "active" in patch && patch.active !== d.active ? (patch.active ? "switched on" : "switched off") : "edited";
    Object.assign(d, patch);
    logDemo(s, action, "departments", d, d.constituency_id);
    saveStore(s);
  },
  async dbUsage() { return demoMe(store()).role === "main_admin" ? 14 * 1024 * 1024 : null; },
  async storageUsage() {
    const s = store();
    return demoMe(s).role === "main_admin" ? s.images.reduce((n, i) => n + i.size_bytes, 0) : null;
  },
  async listItems() { return store().lists.slice().sort((x, y) => x.sort_order - y.sort_order); },
  async addListItem(row) {
    await pause();
    const s = store();
    if (demoMe(s).role !== "main_admin") throw new Error(MSG.denied);
    if (nameTaken(s.lists.filter((i) => i.kind === row.kind), row.name)) throw new Error(MSG.taken);
    const it = { id: uid(), active: true, created_at: now(), name_pa: null, days: null, sort_order: 99, ...row };
    s.lists.push(it);
    logDemo(s, "added", "list_items", it, null);
    saveStore(s);
  },
  async updateListItem(id, patch) {
    await pause();
    const s = store();
    if (demoMe(s).role !== "main_admin") throw new Error(MSG.denied);
    const it = s.lists.find((i) => i.id === id);
    if (patch.name && nameTaken(s.lists.filter((i) => i.kind === it.kind), patch.name, id)) throw new Error(MSG.taken);
    Object.assign(it, patch);
    logDemo(s, "edited", "list_items", it, null);
    saveStore(s);
  },
  async getSettings() { return { ...store().settings }; },
  async saveSetting(key, value) {
    const s = store();
    if (demoMe(s).role !== "main_admin") throw new Error(MSG.denied);
    s.settings[key] = value;
    saveStore(s);
  },
  async createApplication(p) {
    await pause();
    const s = store(), me = demoMe(s);
    if (me.role === "officer") throw new Error(MSG.denied);
    const cid = me.role === "main_admin" ? p.constituency_id : me.constituency_id;
    if (!s.constituencies.some((c) => c.id === cid && c.active)) throw new Error("ਹਲਕਾ ਚੁਣੋ · Choose a constituency");
    checkFields(p);
    const app = { ...fieldsOf(s, p, new Date()), id: uid(), no: s.nextNo++, constituency_id: cid, department_id: null, status: "new", deleted: false, created_by: me.id, created_at: now(), updated_at: now() };
    s.applications.push(app);
    demoEvent(s, app, "new", "ਅਰਜ਼ੀ ਦਰਜ ਕੀਤੀ · Application registered");
    saveStore(s);
    return app.id;
  },
  async updateApplication(id, p) {
    await pause();
    const s = store(), me = demoMe(s), app = loadApp(s, me, id);
    if (!(wfRole(me.role) === "admin" || (me.role === "staff" && app.status === "new"))) throw new Error(MSG.denied);
    checkFields(p);
    Object.assign(app, fieldsOf(s, p, new Date(app.created_at)), { updated_at: now() });
    demoEvent(s, app, null, "ਅਰਜ਼ੀ ਦੀ ਜਾਣਕਾਰੀ ਬਦਲੀ · Application details edited");
    saveStore(s);
  },
  async assignApplication(id, deptId, officers, note) {
    await pause();
    const s = store(), me = demoMe(s), app = loadApp(s, me, id);
    if (app.deleted || !canMove(me.role, app.status, "assigned")) throw new Error("ਇਸ ਸਮੇਂ ਸੌਂਪੀ ਨਹੀਂ ਜਾ ਸਕਦੀ · This application can't be assigned right now");
    const d = s.departments.find((x) => x.id === deptId && x.constituency_id === app.constituency_id && x.active);
    if (!d) throw new Error("ਇਸ ਹਲਕੇ ਦਾ ਵਿਭਾਗ ਚੁਣੋ · Choose a department in this constituency");
    const ok = officers.every((o) => s.links.some((l) => l.user_id === o && l.department_id === deptId) && s.people.find((x) => x.id === o)?.active);
    if (!ok) throw new Error("ਅਧਿਕਾਰੀ ਇਸ ਵਿਭਾਗ ਦਾ ਨਹੀਂ · An officer is not in this department");
    Object.assign(app, { department_id: deptId, status: "assigned", updated_at: now() });
    s.application_officers = s.application_officers.filter((o) => o.application_id !== id);
    officers.forEach((user_id) => s.application_officers.push({ application_id: id, user_id, constituency_id: app.constituency_id }));
    const names = officers.map((o) => s.people.find((x) => x.id === o)?.full_name).join(", ");
    const eid = demoEvent(s, app, "assigned", [d.name + (names ? ": " + names : ""), (note || "").trim()].filter(Boolean).join("\n"));
    saveStore(s);
    return eid;
  },
  async changeStatus(id, status, note) {
    await pause();
    const s = store(), me = demoMe(s), app = loadApp(s, me, id);
    if (app.deleted || status === "assigned" || !canMove(me.role, app.status, status)) throw new Error(MSG.badMove);
    if (noteNeeded(me.role, app.status, status) && !(note || "").trim()) throw new Error(MSG.noteNeeded);
    Object.assign(app, { status, updated_at: now() });
    const eid = demoEvent(s, app, status, note);
    saveStore(s);
    return eid;
  },
  async addNote(id, note) {
    await pause();
    const s = store(), me = demoMe(s), app = loadApp(s, me, id);
    if (!(note || "").trim()) throw new Error(MSG.noteNeeded);
    app.updated_at = now();
    const eid = demoEvent(s, app, null, note);
    saveStore(s);
    return eid;
  },
  async removeApplication(id, note) {
    await pause();
    const s = store(), me = demoMe(s), app = loadApp(s, me, id);
    if (wfRole(me.role) !== "admin") throw new Error(MSG.denied);
    Object.assign(app, { deleted: true, updated_at: now() });
    demoEvent(s, app, null, ["ਅਰਜ਼ੀ ਹਟਾਈ · Application removed", (note || "").trim()].filter(Boolean).join("\n"));
    saveStore(s);
  },
  async restoreApplication(id) {
    await pause();
    const s = store(), me = demoMe(s), app = loadApp(s, me, id);
    if (wfRole(me.role) !== "admin") throw new Error(MSG.denied);
    Object.assign(app, { deleted: false, updated_at: now() });
    demoEvent(s, app, null, "ਅਰਜ਼ੀ ਵਾਪਸ ਲਿਆਂਦੀ · Application restored");
    saveStore(s);
  },
  async listImages(appId) {
    const s = store(), me = demoMe(s);
    const app = s.applications.find((a) => a.id === appId);
    return app && canReadApp(s, me, app) ? s.images.filter((i) => i.application_id === appId) : [];
  },
  // In the demo the "path" is the picture itself.
  async imageUrls(paths) { return Object.fromEntries(paths.map((x) => [x, x])); },
  async uploadImage(app, blob, eventId) {
    const s = store(), me = demoMe(s);
    loadApp(s, me, app.id);
    const path = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error(MSG.storage));
      r.readAsDataURL(blob);
    });
    s.images.push({ id: uid(), application_id: app.id, event_id: eventId ?? null, path, size_bytes: blob.size, uploaded_by: me.id, uploaded_by_name: me.full_name, at: now() });
    saveStore(s);
  },
  async manage(action, b) {
    await pause();
    const s = store(), me = demoMe(s);
    const refuse = (m) => { if (m) throw new Error(m); };
    const setLinks = (p, ids) => {
      s.links = s.links.filter((l) => l.user_id !== p.id);
      if (p.role === "officer") (ids || []).forEach((department_id) => s.links.push({ user_id: p.id, department_id, constituency_id: p.constituency_id }));
    };
    const target = s.people.find((p) => p.id === b.user_id);
    if (action === "create") {
      refuse(checkCreate(me, b));
      if (s.people.some((p) => p.mobile === b.mobile)) refuse(MSG.mobile);
      const p = { id: uid(), full_name: b.full_name.trim(), mobile: b.mobile, role: b.role, constituency_id: b.constituency_id, active: true, must_change_password: true, created_at: now() };
      s.people.push(p);
      setLinks(p, b.department_ids);
      logDemo(s, "registered", "people", p, p.constituency_id);
    } else if (action === "update") {
      refuse(checkUpdate(me, target, b));
      if (s.people.some((p) => p.mobile === b.mobile && p.id !== target.id)) refuse(MSG.mobile);
      Object.assign(target, { full_name: b.full_name.trim(), mobile: b.mobile, role: b.role, constituency_id: b.constituency_id });
      setLinks(target, b.department_ids);
      logDemo(s, "edited", "people", target, target.constituency_id);
    } else if (action === "set_active") {
      refuse(checkTarget(me, target));
      target.active = !!b.active;
      logDemo(s, b.active ? "switched on" : "switched off", "people", target, target.constituency_id);
    } else if (action === "reset_password") {
      refuse(checkReset(me, target, b.password));
      target.must_change_password = true;
      logDemo(s, "reset the password of", "people", target, target.constituency_id);
    }
    saveStore(s);
    return {};
  }
};

export const api = isDemo ? demo : real;
