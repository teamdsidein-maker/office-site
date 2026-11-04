// Enhance native selects while leaving their values and change events in place for forms.
const enhanced = new Set();
let active = null;
let serial = 0;

function labelParts(label) {
  const at = label.indexOf(" · ");
  return at < 0 ? [label, ""] : [label.slice(0, at), label.slice(at + 3)];
}

function setLabel(control) {
  const option = control.select.selectedOptions[0];
  const [main, sub] = labelParts(option?.textContent?.trim() || "");
  control.value.replaceChildren();
  const first = document.createElement("span");
  first.textContent = main;
  control.value.append(first);
  if (sub) {
    const second = document.createElement("small");
    second.textContent = sub;
    control.value.append(second);
  }
  control.button.classList.toggle("cs-empty", !control.select.value);
  control.button.disabled = control.select.disabled;
}

function close(focus = false) {
  if (!active) return;
  const { button, menu } = active;
  active = null;
  button.setAttribute("aria-expanded", "false");
  button.classList.remove("cs-open");
  if (menu.matches(":popover-open")) menu.hidePopover();
  menu.remove();
  if (focus && button.isConnected) button.focus();
}

function position(control) {
  const rect = control.button.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  const openUp = below < 240 && above > below;
  const room = Math.max(120, Math.min(320, (openUp ? above : below) - 12));
  control.menu.style.width = `${Math.min(rect.width, window.innerWidth - 24)}px`;
  control.menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`;
  control.menu.style.maxHeight = `${room}px`;
  control.menu.style.top = openUp ? `${Math.max(8, rect.top - Math.min(control.menu.scrollHeight, room) - 6)}px` : `${rect.bottom + 6}px`;
}

function choose(control, option) {
  if (option.disabled) return;
  const previous = control.select.value;
  control.select.value = option.value;
  setLabel(control);
  close(true);
  if (previous !== option.value) control.select.dispatchEvent(new Event("change", { bubbles: true }));
}

function open(control) {
  if (active === control) return close(true);
  close();
  const menu = document.createElement("div");
  menu.className = "cs-menu";
  menu.id = `${control.id}-list`;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("popover", "manual");
  const options = [...control.select.options];
  options.forEach((option, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cs-option";
    row.id = `${control.id}-option-${index}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(option.selected));
    row.disabled = option.disabled;
    const [main, sub] = labelParts(option.textContent.trim());
    const title = document.createElement("span");
    title.textContent = main;
    row.append(title);
    if (sub) {
      const detail = document.createElement("small");
      detail.textContent = sub;
      row.append(detail);
    }
    row.addEventListener("click", () => choose(control, option));
    menu.append(row);
  });
  (control.button.closest("dialog[open]") || document.body).append(menu);
  control.menu = menu;
  active = control;
  control.button.setAttribute("aria-expanded", "true");
  control.button.classList.add("cs-open");
  menu.showPopover();
  position(control);
  const selected = options.findIndex((option) => option.selected && !option.disabled);
  (menu.children[selected >= 0 ? selected : 0])?.focus({ preventScroll: true });
}

function onKeys(event, control) {
  const rows = [...control.menu.children].filter((row) => !row.disabled);
  const index = rows.indexOf(document.activeElement);
  if (event.key === "Escape") { event.preventDefault(); close(true); return; }
  if (event.key === "Tab") { close(); return; }
  let next = -1;
  if (event.key === "ArrowDown") next = Math.min(index + 1, rows.length - 1);
  else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = rows.length - 1;
  if (next >= 0) { event.preventDefault(); rows[next]?.focus(); rows[next]?.scrollIntoView({ block: "nearest" }); return; }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const match = rows.find((row) => row.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
    match?.focus();
  }
}

function enhance(select) {
  if (enhanced.has(select)) return;
  enhanced.add(select);
  const wrap = document.createElement("span");
  wrap.className = "cs-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cs-trigger inp";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const id = `cs-${++serial}`;
  button.setAttribute("aria-controls", `${id}-list`);
  const fieldLabel = select.closest("label")?.querySelector(":scope > span")?.textContent?.trim();
  button.setAttribute("aria-label", fieldLabel || select.getAttribute("aria-label") || "Choose an option");
  const value = document.createElement("span");
  value.className = "cs-value";
  const chevron = document.createElement("span");
  chevron.className = "cs-chevron";
  chevron.setAttribute("aria-hidden", "true");
  button.append(value, chevron);
  select.before(wrap);
  wrap.append(select, button);
  select.classList.add("cs-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const control = { id, select, button, value, menu: null };
  setLabel(control);
  button.addEventListener("click", () => open(control));
  button.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End", " ", "Enter"].includes(event.key)) { event.preventDefault(); open(control); }
  });
  select.addEventListener("change", () => setLabel(control));
  select.addEventListener("invalid", () => button.focus());
}

function scan() {
  document.querySelectorAll("select.inp").forEach(enhance);
  for (const select of enhanced) {
    if (!select.isConnected) { enhanced.delete(select); continue; }
    const button = select.nextElementSibling;
    if (button?.classList.contains("cs-trigger")) {
      const value = button.querySelector(".cs-value");
      if (value) setLabel({ select, button, value });
    }
  }
  if (active && !active.button.isConnected) close();
}

if (typeof HTMLElement.prototype.showPopover === "function") {
  new MutationObserver((changes) => {
    if (changes.some((change) => change.target instanceof HTMLSelectElement || change.target instanceof HTMLOptionElement ||
      [...change.addedNodes].some((node) => node.nodeType === 1 && (node.matches?.("select.inp") || node.querySelector?.("select.inp"))))) scan();
  }).observe(document.body, { childList: true, subtree: true });
  scan();
  document.addEventListener("pointerdown", (event) => {
    if (active && !active.button.contains(event.target) && !active.menu.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (active && active.menu.contains(event.target)) onKeys(event, active);
  });
  window.addEventListener("resize", () => close());
  window.addEventListener("scroll", (event) => { if (active && event.target !== active.menu) close(); }, true);
}
