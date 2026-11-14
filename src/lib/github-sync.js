// প্রজেক্টের সব সোর্স ফাইল সংগ্রহ করে একটি কমিট হিসেবে GitHub-এ পাঠায়।
// ফাইল সংগ্রহের কাজ জিপ ডাউনলোডের কোডই ব্যবহার করে, তাই দুটো সবসময় একই ফাইল তালিকা পায়।

import { uploadGithubBlobs, commitGithubFiles } from "@/lib/github-fns";

function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const MAX_BATCH_FILES = 25;
const MAX_BATCH_CHARS = 700_000;

function makeBatches(items) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const item of items) {
    if (current.length && (current.length >= MAX_BATCH_FILES || size + item.content.length > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.content.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function pushProjectToGithub({ onProgress } = {}) {
  const report = (percent, label) => onProgress?.({ percent: Math.min(100, Math.round(percent)), label });

  report(1, "ফাইল সংগ্রহ হচ্ছে…");
  const zipModule = await import("@/lib/zip-export");
  if (typeof zipModule.collectFiles !== "function") {
    throw new Error("পেজের পুরনো সংস্করণ লোড হয়ে আছে। ব্রাউজারে হার্ড রিফ্রেশ (Ctrl+Shift+R) বা পেজ রিলোড করে আবার চেষ্টা করুন।");
  }
  const { files, skipped } = await zipModule.collectFiles((p) => report(p * 0.3, "ফাইল সংগ্রহ হচ্ছে…"));
  if (files.length < 20) {
    throw new Error("প্রজেক্টের ফাইল তালিকা অসম্পূর্ণ মনে হচ্ছে, তাই GitHub-এ পাঠানো বন্ধ রাখা হয়েছে। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।");
  }

  const items = files.map((file) => ({ path: file.name, content: toBase64(file.data) }));
  const batches = makeBatches(items);

  const entries = [];
  for (let i = 0; i < batches.length; i++) {
    report(30 + (i / batches.length) * 60, `আপলোড হচ্ছে… (${i + 1}/${batches.length})`);
    const uploaded = await uploadGithubBlobs({ data: { files: batches[i] } });
    entries.push(...uploaded);
  }

  // কোনো src/ ফাইল পড়া না গেলে GitHub থেকে কিছুই মোছা হবে না
  const prune = !skipped.some((name) => name.startsWith("src/"));

  report(93, "কমিট তৈরি হচ্ছে…");
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const result = await commitGithubFiles({
    data: { entries, message: `Sync from Al Ahsan Foundation admin (${stamp} UTC)`, prune },
  });
  report(100, "সম্পন্ন");
  return { ...result, total: files.length, skipped };
}
