import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const routeFiles = [
  "app/api/carriers/route.ts",
  "app/api/expenses/route.ts",
  "app/api/freights/route.ts",
];

test("data routes authenticate before accessing Supabase", () => {
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    const authIndex = source.indexOf("if (!isAuthorized(request)) return unauthorized()");
    const supabaseIndex = source.indexOf("getSupabaseAdmin()", source.indexOf("export async function"));
    assert.notEqual(authIndex, -1, `${file} must enforce signed-session authorization`);
    assert.ok(supabaseIndex === -1 || authIndex < supabaseIndex, `${file} must authorize before querying Supabase`);
  }
});

test("server errors never expose raw backend messages", () => {
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Response\.json\(\{ error: error\.message \}/, `${file} leaks raw backend errors`);
    assert.doesNotMatch(source, /status: clientError \? 400 : 500[\s\S]{0,120}error: message/, `${file} leaks unknown backend errors`);
  }
});

test("client code does not reference server secrets", () => {
  const clientFiles = [
    "app/Dashboard.tsx",
    "app/ExpensesModule.tsx",
    "app/LoginGate.tsx",
    "app/ThemeToggle.tsx",
  ];
  for (const file of clientFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|GALVAO_ACCESS_PIN|GALVAO_SESSION_SECRET|supabase-admin/);
  }
});

test("local secrets and internal project notes are ignored", () => {
  const privatePaths = [
    ".env.local",
    ".vercel/project.json",
    ".superpowers/sdd/progress.md",
    "PROJECT_CONTEXT.md",
    "HANDOFF_PROJETO.md",
    "docs/superpowers/specs/private.md",
  ];
  const result = spawnSync("git", ["check-ignore", "--no-index", ...privatePaths], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const ignored = new Set(result.stdout.trim().split(/\r?\n/).filter(Boolean));
  for (const path of privatePaths) {
    assert.ok(ignored.has(path), `${path} must be ignored before public release`);
  }

  const example = spawnSync("git", ["check-ignore", "--no-index", ".env.example"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(example.status, 1, ".env.example must remain publishable");
});

test("Next.js sends baseline browser security headers", () => {
  const source = readFileSync("next.config.ts", "utf8");
  for (const header of [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) {
    assert.match(source, new RegExp(header), `${header} must be configured`);
  }
});

test("publishable files contain no credential-shaped values", () => {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(listed.status, 0, listed.stderr);
  const files = listed.stdout.split("\0").filter(Boolean);
  const forbiddenPaths = /(^|\/)(\.env\.(?!example$)|\.vercel|\.netlify|\.next|node_modules|PROJECT_CONTEXT\.md|HANDOFF_PROJETO\.md|docs\/superpowers)(\/|$)/;
  const credentialPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bgh[opusr]_[A-Za-z0-9_]{30,}\b/,
    /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
    /\bsb_secret_[A-Za-z0-9_-]{24,}\b/,
  ];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const normalized = file.replaceAll("\\", "/");
    assert.doesNotMatch(normalized, forbiddenPaths, `${normalized} is private and must not be published`);
    if (normalized === ".env.example") continue;
    const source = readFileSync(file, "utf8");
    for (const pattern of credentialPatterns) {
      assert.doesNotMatch(source, pattern, `${normalized} contains a credential-shaped value`);
    }
  }
});
