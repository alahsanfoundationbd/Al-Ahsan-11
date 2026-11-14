import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Github, Loader2, RefreshCw, Save, ShieldCheck, UploadCloud } from "lucide-react";
import { getGithubConfig, saveGithubConfig, testGithubConnection } from "@/lib/github-fns";

const EMPTY = { repo_full_name: "", branch: "main", token: "", token_set: false, token_hint: "", last_sync_at: "", last_commit_url: "", last_file_count: 0 };

const formatTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
};

export default function GithubSyncCard() {
  const load = useServerFn(getGithubConfig);
  const save = useServerFn(saveGithubConfig);
  const test = useServerFn(testGithubConnection);

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testInfo, setTestInfo] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, label: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load().then((data) => setForm({ ...EMPTY, ...data })).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const ready = form.token_set && form.repo_full_name;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setTestInfo(null);
    try {
      const saved = await save({ data: { repo_full_name: form.repo_full_name, branch: form.branch || "main", token: form.token } });
      setForm({ ...EMPTY, ...saved, token: "" });
      toast.success("GitHub সেটিংস সংরক্ষিত হয়েছে।");
    } catch (e) {
      toast.error(e?.message || "সংরক্ষণ করা যায়নি।");
    } finally { setSaving(false); }
  };

  const runTest = async () => {
    setTesting(true);
    setError("");
    setTestInfo(null);
    try {
      setTestInfo(await test());
    } catch (e) {
      setError(e?.message || "সংযোগ যাচাই করা যায়নি।");
    } finally { setTesting(false); }
  };

  const push = async () => {
    setPushing(true);
    setError("");
    setResult(null);
    setProgress({ percent: 0, label: "শুরু হচ্ছে…" });
    try {
      const { pushProjectToGithub } = await import("@/lib/github-sync");
      const info = await pushProjectToGithub({ onProgress: setProgress });
      setResult(info);
      const fresh = await load();
      setForm((current) => ({ ...current, ...fresh, token: "" }));
      toast.success(info.unchanged ? "GitHub আগে থেকেই হালনাগাদ আছে।" : "GitHub-এ সফলভাবে আপডেট হয়েছে।");
    } catch (e) {
      setError(e?.message || "GitHub-এ পাঠানো যায়নি। আবার চেষ্টা করুন।");
      console.error(e);
    } finally { setPushing(false); }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-secondary" />;

  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Github className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-heading text-[17px] font-semibold text-primary">সরাসরি GitHub সিঙ্ক</h2>
          <p className="text-[12.5px] text-muted-foreground">এক ক্লিকে সব সোর্স কোড আপনার রিপজিটরিতে</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm font-medium">রিপজিটরি (owner/repo অথবা পুরো লিংক)
          <input value={form.repo_full_name} onChange={(e) => set("repo_full_name", e.target.value)} placeholder="যেমন: myname/al-ahsan-foundation" className="input-app mt-2" required />
        </label>
        <label className="block text-sm font-medium">ব্রাঞ্চ
          <input value={form.branch} onChange={(e) => set("branch", e.target.value)} placeholder="main" className="input-app mt-2" />
        </label>
        <label className="block text-sm font-medium">GitHub টোকেন (Personal Access Token)
          <input type="password" autoComplete="off" value={form.token} onChange={(e) => set("token", e.target.value)} placeholder={form.token_hint || "github_pat_..."} className="input-app mt-2" />
          <span className="mt-1 block text-xs text-muted-foreground">
            {form.token_set ? `বর্তমানে সংরক্ষিত: ${form.token_hint} — বদলাতে চাইলে নতুন টোকেন লিখুন।` : "টোকেন শুধু সার্ভারে সংরক্ষিত থাকে, শুধু অ্যাডমিন ব্যবহার করতে পারেন।"}
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="btn-primary-app disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}সংরক্ষণ করুন
          </button>
          <button type="button" onClick={runTest} disabled={!ready || testing} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-[13.5px] font-semibold text-primary transition hover:bg-secondary disabled:opacity-50">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}সংযোগ যাচাই
          </button>
        </div>
      </form>

      {testInfo && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] leading-relaxed text-emerald-800">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />সংযোগ ঠিক আছে — {testInfo.full_name}</p>
          <p className="mt-1">{testInfo.is_private ? "প্রাইভেট" : "পাবলিক"} রিপজিটরি · লেখার অনুমতি: {testInfo.can_push ? "আছে" : "নেই (টোকেনে Contents: Read and write দিন)"}</p>
          {!testInfo.branch_exists && <p className="mt-1">ব্রাঞ্চ "{testInfo.branch}" এখনো নেই — প্রথম সিঙ্কে নতুন ব্রাঞ্চ তৈরি হবে।</p>}
        </div>
      )}

      <div className="mt-6 border-t border-border pt-6">
        <button
          type="button"
          onClick={push}
          disabled={!ready || pushing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {pushing ? `${progress.label} ${progress.percent}%` : "এখনই GitHub-এ আপডেট করুন"}
        </button>
        {!ready && <p className="mt-2 text-center text-xs text-muted-foreground">আগে রিপজিটরি ও টোকেন সংরক্ষণ করুন।</p>}

        {pushing && (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] leading-relaxed text-emerald-800">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              {result.unchanged ? "কোনো পরিবর্তন নেই — GitHub আগে থেকেই হালনাগাদ।" : "সফলভাবে GitHub-এ আপডেট হয়েছে।"}
            </p>
            <p className="mt-1">
              মোট {result.total}টি ফাইল যাচাই · {result.changed}টি নতুন/পরিবর্তিত{result.removed > 0 ? ` · ${result.removed}টি মোছা হয়েছে` : ""} · ব্রাঞ্চ: {result.branch}
            </p>
            <a href={result.commit_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
              GitHub-এ কমিট দেখুন <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {result.skipped?.length > 0 && (
              <p className="mt-2 text-xs text-emerald-900/80">প্রিভিউ মোডে {result.skipped.length}টি ফাইল (যেমন base44/ কনফিগ) পাঠানো যায়নি।</p>
            )}
          </div>
        )}

        {!result && form.last_sync_at && (
          <p className="mt-4 text-[12.5px] text-muted-foreground">
            সর্বশেষ সিঙ্ক: {formatTime(form.last_sync_at)}
            {form.last_commit_url && (
              <> · <a href={form.last_commit_url} target="_blank" rel="noreferrer" className="text-primary underline">কমিট দেখুন</a></>
            )}
          </p>
        )}

        {error && <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-[13px] leading-relaxed text-destructive">{error}</p>}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-secondary/50 p-4 text-[12.5px] leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">একবারের সেটআপ (৩ মিনিট)</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>github.com-এ নতুন একটি Repository বানান এবং "Add a README file" টিক দিন (খালি রিপজিটরি চলবে না)।</li>
          <li>GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token।</li>
          <li>Repository access-এ শুধু ওই রিপজিটরিটি বেছে নিন; Permissions → Repository permissions → <b>Contents: Read and write</b> দিন।</li>
          <li>টোকেনটি কপি করে উপরের ঘরে বসান, সংরক্ষণ করুন, তারপর "সংযোগ যাচাই" চাপুন।</li>
        </ol>
        <p className="mt-3 flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />টোকেন কাউকে দেবেন না। সন্দেহ হলে GitHub-এ গিয়ে টোকেনটি বাতিল (Revoke) করে নতুন বানান।</p>
      </div>
    </div>
  );
}
