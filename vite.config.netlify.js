import { readFileSync } from "node:fs";
import base44 from "@base44/vite-plugin";
import netlify from "@netlify/vite-plugin-tanstack-start";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const NOT_PREBUNDLED = new Set(["react", "react-dom", "@base44/vite-plugin", "@tanstack/react-start", "@tanstack/react-router", "@tanstack/react-router-ssr-query", "tailwindcss-animate"]);
const { dependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const PREBUNDLE = Object.keys(dependencies).filter((name) => !NOT_PREBUNDLED.has(name));

// Netlify-তে "cloudflare:workers" নেই, তাই ফাঁকা নকল দেওয়া হলো
const cloudflareStub = {
  name: "cloudflare-workers-stub",
  enforce: "pre",
  resolveId(id) {
    if (id === "cloudflare:workers") return "\0cloudflare-workers-stub";
  },
  load(id) {
    if (id === "\0cloudflare-workers-stub") {
      return "export const env = {}; export const waitUntil = (p) => { try { Promise.resolve(p).catch(() => {}); } catch {} };";
    }
  },
};

export default defineConfig({
  optimizeDeps: { include: PREBUNDLE },
  plugins: [
    cloudflareStub,
    base44({ hmrNotifier: false, navigationNotifier: false, analyticsTracker: false, visualEditAgent: false }),
    tanstackStart({ srcDirectory: "src" }),
    netlify(),
    react(),
  ],
});
