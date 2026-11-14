// সার্ভার-সাইড ফাইলগুলো (*.server.*, API রুট) ক্লায়েন্টে সরাসরি আনা যায় না,
// তাই এগুলো শুধু সার্ভারে পড়া হয় এবং অ্যাডমিনকে পাঠানো হয়।

const serverFiles = import.meta.glob(
  ["/src/**/*.server.*", "/src/server.js", "/src/routes/api/**/*.js"],
  { query: "?raw", import: "default" }
);

import selfFiles from "@/lib/source-self.server";

export async function readServerSourceFiles() {
  const out = [];
  for (const [path, load] of [...Object.entries(serverFiles), ...Object.entries(selfFiles)]) {
    try {
      out.push({ name: path.replace(/^\//, ""), text: String(await load()) });
    } catch {
      /* এই ফাইলটি বাদ গেল */
    }
  }
  return out;
}
