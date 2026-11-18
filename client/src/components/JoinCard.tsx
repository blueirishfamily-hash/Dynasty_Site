// Joining a league (mockup option A): one centered card. The invite code is asked first, then the league PIN
// if the league has one (digit boxes that bring up the phone number pad), then you land in the league and pick
// your team. The league never appears in a list: it shows up only after its exact code is entered.
import { useState, type FormEvent } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PinBoxes } from "@/components/UnlockDialog";
import { cn } from "@/lib/utils";

/** Set when someone joins, so the league opens the team picker on arrival. */
export const PICK_TEAM_AFTER_JOIN_KEY = "pick_team_after_join";

type Notice = { tone: "danger" | "warning"; text: string } | null;

function timeOf(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({} as any));
  return { res, data };
}

function noticeFor(res: Response, data: any, wrong: string): Notice {
  if (res.status === 429 && data.pausedUntil) return { tone: "warning", text: `Too many wrong tries. Paused until ${timeOf(data.pausedUntil)}.` };
  if (data.code === "wrong_secret") {
    const left = typeof data.triesLeft === "number" ? ` · ${data.triesLeft} ${data.triesLeft === 1 ? "try" : "tries"} left` : "";
    return { tone: "danger", text: `${wrong}${left}` };
  }
  return { tone: "danger", text: data.error || "Something went wrong. Try again." };
}

export default function JoinCard({ expectedSlug, expectedName }: { expectedSlug?: string; expectedName?: string }) {
  const [step, setStep] = useState<"code" | "pin">("code");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [league, setLeague] = useState<{ slug: string; name: string } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const finish = (slug: string) => {
    try {
      sessionStorage.setItem(PICK_TEAM_AFTER_JOIN_KEY, slug);
    } catch {
      /* the picker just won't open by itself */
    }
    // A full load so the new device cookie is used from the first request.
    window.location.assign(`/l/${slug}`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      if (step === "code") {
        if (code.trim().length < 6) return setNotice({ tone: "danger", text: "Invite codes are at least 6 letters and digits." });
        const { res, data } = await post("/api/registry/join/check", { inviteCode: code });
        if (!res.ok) return setNotice(noticeFor(res, data, "That code doesn't match a league."));
        if (expectedSlug && data.slug !== expectedSlug) {
          return setNotice({ tone: "danger", text: `That code is for ${data.name}, not ${expectedName ?? "this league"}.` });
        }
        setLeague({ slug: data.slug, name: data.name });
        if (!data.pinRequired) {
          const joined = await post("/api/registry/join", { inviteCode: code });
          if (!joined.res.ok) return setNotice(noticeFor(joined.res, joined.data, "That code doesn't match a league."));
          return finish(data.slug);
        }
        setStep("pin");
        return;
      }
      if (pin.length < 4) return setNotice({ tone: "danger", text: "Enter the league PIN (4 to 8 digits)." });
      const { res, data } = await post("/api/registry/join", { inviteCode: code, leaguePin: pin });
      if (!res.ok) {
        setPin("");
        return setNotice(noticeFor(res, data, "Wrong league PIN."));
      }
      finish(data.slug);
    } catch {
      setNotice({ tone: "danger", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const title = step === "pin" ? `${league?.name} league PIN` : expectedName ? `Join ${expectedName}` : "Join a league";
  const hint =
    step === "pin"
      ? "The commissioner set a PIN for this league."
      : expectedName
        ? "Enter the invite code from your commissioner to open this league."
        : "Enter the invite code from your commissioner";

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm" data-testid="card-join">
        <Trophy className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="mt-2 text-lg font-semibold">{title}</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{hint}</p>
        {step === "code" ? (
          <Input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32)); setNotice(null); }}
            placeholder="JOINCODE"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Invite code"
            className="text-center font-mono tracking-widest"
            data-testid="input-invite-code"
          />
        ) : (
          <PinBoxes value={pin} onChange={(v) => { setPin(v); setNotice(null); }} autoFocus label="League PIN" invalid={notice?.tone === "danger"} />
        )}
        {notice && (
          <p
            role="alert"
            className={cn("mt-3 rounded-md px-3 py-2 text-sm", notice.tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600 dark:text-amber-400")}
          >
            {notice.text}
          </p>
        )}
        <Button type="submit" className="mt-4 w-full" disabled={busy} data-testid="button-join">
          {step === "code" ? "Continue" : "Join league"}
        </Button>
        {step === "pin" && (
          <Button type="button" variant="ghost" className="mt-1 w-full" onClick={() => { setStep("code"); setPin(""); setNotice(null); }}>
            Use a different code
          </Button>
        )}
        <p className="mt-3 text-xs text-muted-foreground">After this you'll pick your team. This device is remembered.</p>
      </form>
    </div>
  );
}
