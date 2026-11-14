import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

const assertAdmin = (context) => {
  if (context.user?.role !== "admin") throw new Error("শুধুমাত্র অ্যাডমিন এই কাজ করতে পারেন");
};

// "https://github.com/owner/repo.git" বা "owner/repo" — দুটোই চলবে
const normalizeRepo = (value) =>
  String(value || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,100}$/;

const safePath = (value) =>
  value.length <= 300 &&
  /^[\w.$@+\- /]+$/.test(value) &&
  !value.startsWith("/") &&
  !value.split("/").some((part) => part === ".." || part === "." || part === "" || part.toLowerCase() === ".git");

const publicConfig = (config) => ({
  repo_full_name: config?.repo_full_name || "",
  branch: config?.branch || "main",
  token_set: Boolean(config?.token),
  token_hint: config?.token ? `••••${String(config.token).slice(-4)}` : "",
  last_sync_at: config?.last_sync_at || "",
  last_commit_url: config?.last_commit_url || "",
  last_file_count: config?.last_file_count || 0,
});

export const getGithubConfig = createServerFn({ method: "GET" }).middleware([requireUser]).handler(async ({ context }) => {
  assertAdmin(context);
  const { loadGithubConfig } = await import("@/lib/github.server");
  return publicConfig(await loadGithubConfig(context.getBase44()));
});

export const saveGithubConfig = createServerFn({ method: "POST" }).middleware([requireUser]).validator(z.object({
  repo_full_name: z.string().trim().min(3).max(220),
  branch: z.string().trim().max(100).optional().default("main"),
  token: z.string().trim().max(300).optional().default(""),
})).handler(async ({ data, context }) => {
  assertAdmin(context);
  const repo = normalizeRepo(data.repo_full_name);
  if (!REPO_PATTERN.test(repo)) throw new Error("রিপজিটরির নাম owner/repo আকারে দিন, যেমন: myname/al-ahsan-foundation");
  const branch = data.branch || "main";
  if (!BRANCH_PATTERN.test(branch) || branch.includes("..")) throw new Error("ব্রাঞ্চের নাম সঠিক নয়।");

  const base44 = context.getBase44();
  const { loadGithubConfig } = await import("@/lib/github.server");
  const existing = await loadGithubConfig(base44);
  if (!existing?.token && !data.token) throw new Error("GitHub টোকেন দিতে হবে।");

  const patch = { repo_full_name: repo, branch };
  if (data.token) patch.token = data.token;
  const saved = existing
    ? await base44.asServiceRole.entities.GithubConfig.update(existing.id, patch)
    : await base44.asServiceRole.entities.GithubConfig.create(patch);
  return publicConfig({ ...(existing || {}), ...patch, ...(saved || {}) });
});

export const testGithubConnection = createServerFn({ method: "POST" }).middleware([requireUser]).handler(async ({ context }) => {
  assertAdmin(context);
  const { loadGithubConfig, requireGithub, testGithub } = await import("@/lib/github.server");
  const config = requireGithub(await loadGithubConfig(context.getBase44()));
  return testGithub(config);
});

export const uploadGithubBlobs = createServerFn({ method: "POST" }).middleware([requireUser]).validator(z.object({
  files: z.array(z.object({
    path: z.string().max(300).refine(safePath, "ফাইলের পাথ সঠিক নয়"),
    content: z.string().max(4_000_000),
  })).min(1).max(40),
})).handler(async ({ data, context }) => {
  assertAdmin(context);
  const { loadGithubConfig, requireGithub, uploadBlobs } = await import("@/lib/github.server");
  const config = requireGithub(await loadGithubConfig(context.getBase44()));
  return uploadBlobs(config, data.files);
});

export const commitGithubFiles = createServerFn({ method: "POST" }).middleware([requireUser]).validator(z.object({
  entries: z.array(z.object({
    path: z.string().max(300).refine(safePath, "ফাইলের পাথ সঠিক নয়"),
    sha: z.string().regex(/^[0-9a-f]{40}$/),
  })).min(1).max(2000),
  message: z.string().trim().min(1).max(200),
  prune: z.boolean().optional().default(false),
})).handler(async ({ data, context }) => {
  assertAdmin(context);
  const base44 = context.getBase44();
  const { loadGithubConfig, requireGithub, commitEntries } = await import("@/lib/github.server");
  const config = requireGithub(await loadGithubConfig(base44));
  const result = await commitEntries(config, data);
  await base44.asServiceRole.entities.GithubConfig.update(config.id, {
    last_sync_at: new Date().toISOString(),
    last_commit_sha: result.commit_sha,
    last_commit_url: result.commit_url,
    last_file_count: data.entries.length,
  });
  return result;
});
