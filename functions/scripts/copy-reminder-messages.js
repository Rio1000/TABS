// Predeploy hook (firebase.json -> functions.predeploy): copies the repo-root
// reminder-messages.json — the single source of truth the website also
// fetches — into functions/ so index.js can require() it in the deployed
// bundle. The copy is gitignored. Paths are resolved from this file, so the
// working directory doesn't matter. Fails the deploy if the file is missing
// or malformed rather than shipping functions with no reminder templates.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "..", "reminder-messages.json");
const dest = path.resolve(__dirname, "..", "reminder-messages.json");

const raw = fs.readFileSync(src, "utf8");
const parsed = JSON.parse(raw);
if (
  !Array.isArray(parsed.messages) ||
  parsed.messages.length === 0 ||
  !parsed.messages.every((m) => typeof m === "string" && m.length > 0)
) {
  throw new Error(`${src}: "messages" must be a non-empty array of strings`);
}
fs.writeFileSync(dest, raw);
console.log(`Copied ${parsed.messages.length} reminder templates to ${dest}`);
