#!/usr/bin/env node
/**
 * Secret scan. Fails (exit 1) when:
 *  1. a file contains something that looks like an API key / token / private key,
 *  2. the real values from .env.local appear in any tracked file or in dist/ (the browser bundle),
 *  3. a .env file is tracked by git,
 *  4. client code reads a VITE_* variable named like a secret (those are shipped to every browser).
 * Add "check-secrets:ignore" on a line to silence a deliberate false positive.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel", "coverage"]);
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|html|css|yml|yaml|txt|map|env|example)$/i;
const PATTERNS = [
  ["Tavily API key", /tvly-[A-Za-z0-9_-]{16,}/],
  ["JWT-like token (Nebius keys look like this)", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Hard-coded secret assignment", /(api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-.]{24,}["']/i],
  ["Bearer token literal", /Bearer\s+[A-Za-z0-9_\-.]{24,}/],
  ["Secret-looking VITE_ variable (would ship to the browser)", /import\.meta\.env\.VITE_[A-Z0-9_]*(KEY|TOKEN|SECRET)/],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function gitFiles() {
  try {
    return execSync("git ls-files -co --exclude-standard", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

function isTracked(file) {
  try {
    execSync(`git ls-files --error-unmatch "${file}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function envSecrets() {
  if (!existsSync(".env.local")) return [];
  return readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(l))
    .filter((m) => m && /KEY|TOKEN|SECRET/.test(m[1]) && m[2].trim().length >= 12)
    .map((m) => ({ name: m[1], value: m[2].trim() }));
}

const files = new Set(gitFiles() ?? walk(ROOT).map((f) => relative(ROOT, f)));
if (existsSync("dist")) for (const f of walk(join(ROOT, "dist"))) files.add(relative(ROOT, f));
const secrets = envSecrets();
const findings = [];
let scanned = 0;

for (const f of files) {
  const base = f.split("/").pop() ?? f;
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
    if (isTracked(f)) findings.push(`${f}: .env file is tracked by git (add it to .gitignore and rotate the keys)`);
    continue;
  }
  if (!TEXT_EXT.test(f) || !existsSync(f) || statSync(f).size > 5_000_000) continue;
  scanned += 1;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("check-secrets:ignore")) return;
    for (const [label, re] of PATTERNS) if (re.test(line)) findings.push(`${f}:${i + 1}: ${label}`);
    for (const s of secrets) if (line.includes(s.value)) findings.push(`${f}:${i + 1}: contains the value of ${s.name}`);
  });
}

if (findings.length > 0) {
  console.error(`Secret scan FAILED (${findings.length} finding(s)):`);
  for (const x of findings) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${scanned} files checked, ${secrets.length} .env.local value(s) cross-checked.`);
