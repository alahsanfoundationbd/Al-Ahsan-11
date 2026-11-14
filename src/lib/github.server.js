// সার্ভার-সাইড GitHub সিঙ্ক: টোকেন কখনো ব্রাউজারে যায় না।
// GitHub Git Data API দিয়ে ফাইল আপলোড করে একটি কমিট তৈরি করা হয়।

const API = "https://api.github.com";

export async function loadGithubConfig(base44) {
  const page = await base44.asServiceRole.entities.GithubConfig.list({ sort: "-updated_date", limit: 1 });
  return page.items?.[0] || null;
}

export const isGithubReady = (config) =>
  Boolean(String(config?.repo_full_name || "").trim() && String(config?.token || "").trim());

export function requireGithub(config) {
  if (!isGithubReady(config)) throw new Error("আগে রিপজিটরির নাম ও GitHub টোকেন সংরক্ষণ করুন।");
  return config;
}

const refPath = (branch) => String(branch).split("/").map(encodeURIComponent).join("/");

function friendlyError(status, json, text, path) {
  const detail = json?.message || String(text || "").slice(0, 200);
  if (status === 401) return "GitHub টোকেন ভুল বা মেয়াদ শেষ হয়ে গেছে। নতুন টোকেন দিন।";
  if (status === 403) {
    if (/rate limit/i.test(detail)) return "GitHub-এর অনুরোধ সীমা পূর্ণ হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
    return "টোকেনের অনুমতি নেই। টোকেনে এই রিপজিটরির জন্য \"Contents: Read and write\" অনুমতি দিন।";
  }
  if (status === 404) return "রিপজিটরি বা ব্রাঞ্চ পাওয়া যায়নি, অথবা টোকেনের এই রিপজিটরিতে অ্যাক্সেস নেই। নাম ও টোকেনের Repository access যাচাই করুন।";
  if (status === 409) {
    if (/empty/i.test(detail)) return "রিপজিটরিটি সম্পূর্ণ খালি। GitHub-এ গিয়ে \"Add a README file\" দিয়ে একটি প্রথম কমিট তৈরি করুন, তারপর আবার চেষ্টা করুন।";
    return `GitHub-এ দ্বন্দ্ব হয়েছে: ${detail}`;
  }
  if (status === 422) return `GitHub অনুরোধটি নিতে পারেনি: ${detail}`;
  return `GitHub ত্রুটি (${status}) ${path || ""}: ${detail}`;
}

async function gh(config, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${String(config.token).trim()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "al-ahsan-foundation-sync",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok) {
    const error = new Error(friendlyError(response.status, json, text, path));
    error.status = response.status;
    throw error;
  }
  return json;
}

const post = (config, path, body) => gh(config, path, { method: "POST", body: JSON.stringify(body) });

export async function testGithub(config) {
  const repo = await gh(config, `/repos/${config.repo_full_name}`);
  const branch = config.branch || repo.default_branch || "main";
  let branchExists = true;
  try {
    await gh(config, `/repos/${config.repo_full_name}/git/ref/heads/${refPath(branch)}`);
  } catch (error) {
    if (error.status === 404 || error.status === 409) branchExists = false;
    else throw error;
  }
  return {
    full_name: repo.full_name,
    is_private: Boolean(repo.private),
    default_branch: repo.default_branch,
    can_push: repo.permissions ? Boolean(repo.permissions.push) : true,
    branch,
    branch_exists: branchExists,
    html_url: repo.html_url,
  };
}

async function inBatches(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return out;
}

export async function uploadBlobs(config, files) {
  return inBatches(files, 6, async (file) => {
    const blob = await post(config, `/repos/${config.repo_full_name}/git/blobs`, {
      content: file.content,
      encoding: "base64",
    });
    return { path: file.path, sha: blob.sha };
  });
}

// src/ ফোল্ডারের যে ধরনের ফাইল জিপে যায়, শুধু সেগুলো মুছে ফেলা নিরাপদ।
const PRUNE_PATTERN = /^src\/.+\.(js|jsx|ts|tsx|css|json|md|html|svg|txt)$/;

export async function commitEntries(config, { entries, message, prune }) {
  const repoPath = `/repos/${config.repo_full_name}`;
  const repo = await gh(config, repoPath);
  const branch = config.branch || repo.default_branch || "main";

  let headSha = null;
  let branchExists = true;
  try {
    headSha = (await gh(config, `${repoPath}/git/ref/heads/${refPath(branch)}`)).object.sha;
  } catch (error) {
    if (error.status !== 404 && error.status !== 409) throw error;
    branchExists = false;
  }
  if (!branchExists) {
    // নতুন ব্রাঞ্চ: ডিফল্ট ব্রাঞ্চ থেকে শুরু
    headSha = (await gh(config, `${repoPath}/git/ref/heads/${refPath(repo.default_branch)}`)).object.sha;
  }

  const baseCommit = await gh(config, `${repoPath}/git/commits/${headSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  const existing = new Map();
  let compared = false;
  try {
    const tree = await gh(config, `${repoPath}/git/trees/${baseTreeSha}?recursive=1`);
    if (!tree.truncated) {
      for (const item of tree.tree || []) if (item.type === "blob") existing.set(item.path, item.sha);
      compared = true;
    }
  } catch { compared = false; }

  const wanted = new Set(entries.map((e) => e.path));
  const changed = compared ? entries.filter((e) => existing.get(e.path) !== e.sha) : entries;
  const removed = compared && prune
    ? [...existing.keys()].filter((p) => PRUNE_PATTERN.test(p) && p !== "src/routeTree.gen.ts" && !wanted.has(p))
    : [];

  if (changed.length === 0 && removed.length === 0 && branchExists) {
    return { unchanged: true, branch, commit_sha: headSha, commit_url: `${repo.html_url}/commit/${headSha}`, changed: 0, removed: 0 };
  }

  const tree = [
    ...changed.map((e) => ({ path: e.path, mode: "100644", type: "blob", sha: e.sha })),
    ...removed.map((p) => ({ path: p, mode: "100644", type: "blob", sha: null })),
  ];

  const newTree = await post(config, `${repoPath}/git/trees`, { base_tree: baseTreeSha, tree });
  const commit = await post(config, `${repoPath}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [headSha],
  });

  if (branchExists) {
    await gh(config, `${repoPath}/git/refs/heads/${refPath(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await post(config, `${repoPath}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  }

  return {
    unchanged: false,
    branch,
    commit_sha: commit.sha,
    commit_url: `${repo.html_url}/commit/${commit.sha}`,
    changed: changed.length,
    removed: removed.length,
  };
}
