// Who may register or change whom. Each function returns an error message, or null if allowed.
// The same file is used by the server function and the website (web/assets/rules.js);
// the server's copy is the one that actually protects the data.

export const ROLE_LABELS = {
  main_admin: ["ਸੁਪਰ ਐਡਮਿਨ", "Super Admin"],
  constituency_admin: ["ਹਲਕਾ ਐਡਮਿਨ", "Constituency Admin"],
  staff: ["ਸਟਾਫ਼", "Staff"],
  officer: ["ਅਰਜ਼ੀ ਅਧਿਕਾਰੀ", "Application Officer"]
};

export const toEmail = (mobile) => `${mobile}@users.office.dsidein.com`;
export const validMobile = (m) => /^[6-9][0-9]{9}$/.test(String(m || ""));
export const validPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 72;

const BAD_PASSWORD = "ਪਾਸਵਰਡ ਘੱਟੋ-ਘੱਟ 8 ਅੱਖਰਾਂ ਦਾ ਹੋਵੇ · The password must be at least 8 characters";

// Roles this person may hand out.
export function assignableRoles(caller) {
  if (caller.role === "main_admin") return ["constituency_admin", "staff", "officer"];
  if (caller.role === "constituency_admin") return ["staff", "officer"];
  return [];
}

function checkDetails(caller, d) {
  if (!String(d.full_name || "").trim()) return "ਨਾਮ ਲਿਖੋ · Enter the person's name";
  if (String(d.full_name).trim().length > 120) return "ਨਾਮ ਬਹੁਤ ਲੰਬਾ ਹੈ · The name is too long";
  if (!validMobile(d.mobile)) return "ਸਹੀ 10 ਅੰਕਾਂ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ ਲਿਖੋ · Enter a valid 10-digit mobile number";
  if (!assignableRoles(caller).includes(d.role)) return "ਤੁਸੀਂ ਇਹ ਪੱਧਰ ਨਹੀਂ ਦੇ ਸਕਦੇ · You can't give this level to anyone";
  if (!d.constituency_id) return "ਹਲਕਾ ਚੁਣੋ · Choose a constituency";
  if (caller.role !== "main_admin" && d.constituency_id !== caller.constituency_id) {
    return "ਤੁਸੀਂ ਸਿਰਫ਼ ਆਪਣੇ ਹਲਕੇ ਦੇ ਲੋਕ ਦੇਖ-ਸੰਭਾਲ ਸਕਦੇ ਹੋ · You can only manage people in your own constituency";
  }
  if (d.role === "officer" && !(d.department_ids || []).length) return "ਅਧਿਕਾਰੀ ਲਈ ਘੱਟੋ-ਘੱਟ ਇੱਕ ਵਿਭਾਗ ਚੁਣੋ · Choose at least one department for an officer";
  return null;
}

// May the caller touch this existing person at all?
export function checkTarget(caller, target) {
  if (!target) return "ਇਹ ਵਿਅਕਤੀ ਨਹੀਂ ਮਿਲਿਆ · This person was not found";
  if (target.id === caller.id) return "ਤੁਸੀਂ ਆਪਣੀ ਪਹੁੰਚ ਨਹੀਂ ਬਦਲ ਸਕਦੇ · You can't change your own access";
  if (target.role === "main_admin") return "ਸੁਪਰ ਐਡਮਿਨ ਨੂੰ ਇੱਥੋਂ ਨਹੀਂ ਬਦਲਿਆ ਜਾ ਸਕਦਾ · The Super Admin can't be changed here";
  if (caller.role === "main_admin") return null;
  if (caller.role === "constituency_admin"
    && target.constituency_id === caller.constituency_id
    && ["staff", "officer"].includes(target.role)) return null;
  return "ਤੁਹਾਨੂੰ ਇਸ ਵਿਅਕਤੀ ਨੂੰ ਬਦਲਣ ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ · You don't have permission to change this person";
}

export function checkCreate(caller, d) {
  const err = checkDetails(caller, d);
  if (err) return err;
  return validPassword(d.password) ? null : BAD_PASSWORD;
}

export function checkUpdate(caller, target, d) {
  return checkTarget(caller, target) || checkDetails(caller, d);
}

export function checkReset(caller, target, password) {
  return checkTarget(caller, target) || (validPassword(password) ? null : BAD_PASSWORD);
}
