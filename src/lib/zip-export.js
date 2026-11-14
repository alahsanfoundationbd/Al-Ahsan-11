// প্রজেক্টের সোর্স কোড ZIP আকারে ব্রাউজার থেকেই ডাউনলোড করার সাহায্যকারী।
// কোনো বাইরের লাইব্রেরি লাগে না — "store" পদ্ধতিতে সরাসরি ZIP ফাইল তৈরি হয়।

import { getServerSourceFiles } from "@/lib/export-fns";
import selfFiles from "@/lib/zip-self";

const srcFiles = import.meta.glob(
  [
    "/src/**/*.{js,jsx,ts,tsx,css,json,md,html,svg,txt}",
    "!/src/routeTree.gen.ts",
    "!/src/**/*.server.*",
    "!/src/server.js",
    "!/src/routes/api/**",
  ],
  { query: "?raw", import: "default" }
);

const rootFiles = import.meta.glob(
  [
    "/package.json",
    "/package-lock.json",
    "/README.md",
    "/AGENTS.md",
    "/CLAUDE.md",
    "/components.json",
    "/eslint.config.js",
    "/jsconfig.json",
    "/postcss.config.js",
    "/tailwind.config.js",
    "/vite.config.js",
    "/wrangler.jsonc",
    "/base44/**/*.{json,jsonc}",
  ],
  { query: "?raw", import: "default" }
);

// public ফোল্ডারের টেক্সট ফাইল সোর্স থেকে পড়া হয় (সাইট থেকে নামালে প্ল্যাটফর্ম HTML-এ স্ক্রিপ্ট ঢুকিয়ে দেয়)
const publicTextFiles = import.meta.glob("/public/*.{html,webmanifest,js,json,txt,xml}", {
  query: "?raw",
  import: "default",
});

// ছবি জাতীয় বাইনারি ফাইল সাইট থেকে নামানো হয়
const PUBLIC_BINARY_FILES = ["icon-512.png"];

const GITIGNORE = `node_modules
dist
.wrangler
.tanstack
.env
.env.*
!.env.example
.dev.vars*
*.log
*.local
.DS_Store
.vscode/*
!.vscode/extensions.json
.idea
src/routeTree.gen.ts
base44/.app.jsonc
`;

const WRANGLER = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "base44-tanstack-app",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.js"
}
`;

const encoder = new TextEncoder();
let crcTable = null;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 ফাইলনাম
    local.setUint16(8, 0, true); // store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, file.data);

    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, time, true);
    head.setUint16(14, date, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, size, true);
    head.setUint32(24, size, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);

    offset += 30 + name.length + size;
  }

  let centralSize = 0;
  for (const chunk of central) centralSize += chunk.length;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

export async function collectFiles(onProgress) {
  const files = [];
  const textEntries = [...Object.entries(rootFiles), ...Object.entries(srcFiles), ...Object.entries(selfFiles)];
  const skipped = [];
  const publicTextEntries = Object.entries(publicTextFiles);
  const total = textEntries.length + publicTextEntries.length + PUBLIC_BINARY_FILES.length + 2;
  let done = 0;
  const tick = () => onProgress?.(Math.round((++done / total) * 100));

  for (const [path, load] of textEntries) {
    try {
      const text = await load();
      files.push({ name: path.replace(/^\//, ""), data: encoder.encode(String(text)) });
    } catch {
      skipped.push(path.replace(/^\//, ""));
    }
    tick();
  }

  // wrangler.jsonc ডেভ প্রিভিউতে পড়া যায় না, তাই স্থির কপি যোগ করা হয়
  if (!files.some((f) => f.name === "wrangler.jsonc")) {
    files.push({ name: "wrangler.jsonc", data: encoder.encode(WRANGLER) });
    const i = skipped.indexOf("wrangler.jsonc");
    if (i >= 0) skipped.splice(i, 1);
  }

  // সার্ভার-সাইড ফাইল (অ্যাডমিন যাচাই সহ)
  const serverSide = await getServerSourceFiles();
  for (const item of serverSide) {
    files.push({ name: item.name, data: encoder.encode(item.text) });
  }
  tick();

  for (const [path, load] of publicTextEntries) {
    try {
      files.push({ name: path.replace(/^\//, ""), data: encoder.encode(String(await load())) });
    } catch {
      skipped.push(path.replace(/^\//, ""));
    }
    tick();
  }

  for (const name of PUBLIC_BINARY_FILES) {
    try {
      const res = await fetch("/" + name);
      const type = res.headers.get("content-type") || "";
      if (res.ok && !type.includes("text/html")) {
        files.push({ name: "public/" + name, data: new Uint8Array(await res.arrayBuffer()) });
      } else {
        skipped.push("public/" + name);
      }
    } catch {
      skipped.push("public/" + name);
    }
    tick();
  }

  files.push({ name: ".gitignore", data: encoder.encode(GITIGNORE) });
  tick();

  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, skipped };
}

export async function downloadProjectZip(onProgress) {
  const { files, skipped } = await collectFiles(onProgress);
  const blob = buildZip(files);
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `al-ahsan-foundation-${stamp}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { count: files.length, bytes: blob.size, skipped };
}
