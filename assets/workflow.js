// What may move where: [level, from, to, is a note required].
// The database enforces the same table (workflow_transitions); a test checks they match.
export const TRANSITIONS = [
  ["officer", "assigned", "in_progress", false],
  ["officer", "assigned", "solved", true],
  ["officer", "assigned", "returned", true],
  ["officer", "in_progress", "in_progress", true],
  ["officer", "in_progress", "solved", true],
  ["officer", "in_progress", "returned", true],
  ["staff", "new", "assigned", false],
  ["staff", "assigned", "assigned", false],
  ["staff", "returned", "assigned", false],
  ["admin", "new", "assigned", false],
  ["admin", "assigned", "assigned", false],
  ["admin", "in_progress", "assigned", false],
  ["admin", "returned", "assigned", false],
  ["admin", "solved", "assigned", false],
  ["admin", "assigned", "in_progress", false],
  ["admin", "in_progress", "in_progress", true],
  ["admin", "assigned", "solved", true],
  ["admin", "in_progress", "solved", true],
  ["admin", "assigned", "returned", true],
  ["admin", "in_progress", "returned", true],
  ["admin", "solved", "closed", false],
  ["admin", "new", "closed", true],
  ["admin", "assigned", "closed", true],
  ["admin", "in_progress", "closed", true],
  ["admin", "returned", "closed", true],
  ["admin", "solved", "in_progress", true],
  ["admin", "closed", "in_progress", true]
];

export const wfRole = (role) => (role === "main_admin" || role === "constituency_admin" ? "admin" : role);
export const findStep = (role, from, to) => TRANSITIONS.find(([r, f, t]) => r === wfRole(role) && f === from && t === to);
export const canMove = (role, from, to) => !!findStep(role, from, to);
export const noteNeeded = (role, from, to) => !!findStep(role, from, to)?.[3];
