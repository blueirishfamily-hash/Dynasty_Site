// Commissioner PIN / admin passcode prompt (mockup option A: centered dialog with digit boxes).
// Opens on its own when an API call needs an unlock (see lib/unlock.ts), then the call is retried.
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { Lock, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  currentUnlockRequest,
  finishUnlock,
  setPromptableCommissioner,
  subscribeUnlock,
  type UnlockLeague,
} from "@/lib/unlock";
import type { LeagueCommissionerInfo } from "@/lib/commissioner";

export interface UnlockCommissioner {
  sleeperUserId: string;
  /** Shown under the title, e.g. the user's team name. */
  label?: string;
}

const MIN_PIN = 4;
const MAX_PIN = 8;

/**
 * Masked PIN digit boxes. A single real input sits behind them with inputMode="numeric", so phones open
 * their number pad. Boxes grow from 4 up to 8 as digits are typed.
 */
export function PinBoxes({ value, onChange, autoFocus, label, invalid }: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  label: string;
  invalid?: boolean;
}) {
  const visible = Math.min(MAX_PIN, Math.max(MIN_PIN, value.length + 1));
  return (
    <OTPInput
      maxLength={MAX_PIN}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, ""))}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label={label}
      pushPasswordManagerStrategy="none"
      containerClassName="flex justify-center"
      render={({ slots }) => (
        <div className="flex gap-2">
          {slots.slice(0, visible).map((slot, i) => (
            <div
              key={i}
              className={cn(
                "flex h-12 w-10 items-center justify-center rounded-md border text-xl",
                invalid ? "border-destructive" : "border-input",
                slot.isActive && "ring-2 ring-primary",
              )}
            >
              {slot.char ? "•" : slot.hasFakeCaret ? <span className="h-5 w-px animate-pulse bg-foreground" /> : null}
            </div>
          ))}
        </div>
      )}
    />
  );
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type Notice = { tone: "danger" | "warning" | "info"; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone =
    notice.tone === "danger"
      ? "bg-destructive/10 text-destructive"
      : notice.tone === "warning"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-primary/10 text-primary";
  return <p role="alert" className={cn("rounded-md px-3 py-2 text-sm", tone)}>{notice.text}</p>;
}

/** Turns an unlock endpoint's error response into a message. */
async function errorNotice(res: Response, wrongWhat: string): Promise<Notice> {
  const body = await res.json().catch(() => ({} as any));
  if (res.status === 429 && body.pausedUntil) return { tone: "warning", text: `Too many wrong tries. Paused until ${formatTime(body.pausedUntil)}.` };
  if (body.code === "wrong_secret") {
    const left = typeof body.triesLeft === "number" ? ` · ${body.triesLeft} ${body.triesLeft === 1 ? "try" : "tries"} left` : "";
    return { tone: "danger", text: `${wrongWhat}${left}` };
  }
  return { tone: "danger", text: body.error || "Something went wrong. Try again." };
}

// ─── Commissioner ──────────────────────────────────────────────────────────────

function CommissionerForm({ league, commissioner }: { league: UnlockLeague; commissioner: UnlockCommissioner }) {
  const { data: commissioners, isLoading } = useQuery<LeagueCommissionerInfo[]>({
    queryKey: ["/api/registry/leagues", league.slug, "commissioners", "prompt"],
    queryFn: async () => {
      const res = await fetch(`/api/registry/leagues/${encodeURIComponent(league.slug)}/commissioners`);
      if (!res.ok) throw new Error("Could not load commissioners");
      return res.json();
    },
    staleTime: 0,
  });
  const mine = commissioners?.find((c) => c.sleeperUserId === commissioner.sleeperUserId);
  const subtitle = [league.name, commissioner.label].filter(Boolean).join(" · ");

  if (isLoading) return <Header title="Commissioner PIN" subtitle={subtitle} />;
  if (!mine) {
    return (
      <>
        <Header title="Commissioner PIN" subtitle={subtitle} />
        <NoticeLine notice={{ tone: "danger", text: "You're not a commissioner of this league." }} />
        <Button variant="outline" className="w-full" onClick={() => finishUnlock(false)}>Close</Button>
      </>
    );
  }
  if (mine.pinState === "set") return <EnterPin league={league} commissioner={commissioner} subtitle={subtitle} />;
  return <SetPin league={league} commissioner={commissioner} subtitle={subtitle} />;
}

function Header({ title, subtitle, icon = "lock" }: { title: string; subtitle?: string; icon?: "lock" | "shield" }) {
  const Icon = icon === "lock" ? Lock : ShieldCheck;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <DialogTitle className="text-lg">{title}</DialogTitle>
      <DialogDescription>{subtitle || " "}</DialogDescription>
    </div>
  );
}

function EnterPin({ league, commissioner, subtitle }: { league: UnlockLeague; commissioner: UnlockCommissioner; subtitle: string }) {
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (pin.length < MIN_PIN) return setNotice({ tone: "danger", text: "Enter your 4 to 8 digit PIN." });
    setBusy(true);
    try {
      const res = await fetch(`/api/registry/leagues/${encodeURIComponent(league.slug)}/commissioner/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sleeperUserId: commissioner.sleeperUserId, pin }),
      });
      if (res.ok) return finishUnlock(true);
      setNotice(await errorNotice(res, "Wrong PIN"));
      setPin("");
    } catch {
      setNotice({ tone: "danger", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Header title="Commissioner PIN" subtitle={subtitle} />
      <PinBoxes value={pin} onChange={(v) => { setPin(v); setNotice(null); }} autoFocus label="Commissioner PIN" invalid={notice?.tone === "danger"} />
      <NoticeLine notice={notice} />
      <Button type="submit" className="w-full" disabled={busy}>Unlock and continue</Button>
      <p className="text-center text-xs text-muted-foreground">Stays unlocked until you close the browser</p>
    </form>
  );
}

function SetPin({ league, commissioner, subtitle }: { league: UnlockLeague; commissioner: UnlockCommissioner; subtitle: string }) {
  const [step, setStep] = useState<"pin" | "confirm">("pin");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setNotice(null);
    if (step === "pin") {
      if (pin.length < MIN_PIN) return setNotice({ tone: "danger", text: "Choose a PIN of 4 to 8 digits." });
      return setStep("confirm");
    }
    if (confirm !== pin) {
      setConfirm("");
      return setNotice({ tone: "danger", text: "The PINs don't match. Enter it again." });
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/registry/leagues/${encodeURIComponent(league.slug)}/commissioner/set-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sleeperUserId: commissioner.sleeperUserId, newPin: pin }),
      });
      if (res.ok) return finishUnlock(true);
      setNotice(await errorNotice(res, "Couldn't set the PIN"));
      setStep("pin");
      setPin("");
      setConfirm("");
    } catch {
      setNotice({ tone: "danger", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Header title={step === "pin" ? "Set your commissioner PIN" : "Enter it again"} subtitle={subtitle} />
      {step === "pin" ? (
        <PinBoxes key="pin" value={pin} onChange={setPin} autoFocus label="New PIN" />
      ) : (
        <PinBoxes key="confirm" value={confirm} onChange={setConfirm} autoFocus label="Confirm new PIN" invalid={notice?.tone === "danger"} />
      )}
      <NoticeLine notice={notice} />
      <Button type="submit" className="w-full" disabled={busy}>
        {step === "confirm" ? "Save PIN and continue" : "Next"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">4 to 8 digits. Only you should know it.</p>
    </form>
  );
}

// ─── Site admin ────────────────────────────────────────────────────────────────

export function AdminPasscodeForm({ onDone }: { onDone: (ok: boolean) => void }) {
  const [passcode, setPasscode] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode) return setNotice({ tone: "danger", text: "Enter the admin passcode." });
    setBusy(true);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) return onDone(true);
      const body = await res.clone().json().catch(() => ({} as any));
      if (body.code === "passcode_not_set") {
        setNotice({ tone: "info", text: "The admin passcode isn't set yet. Set it on the admin page." });
      } else {
        setNotice(await errorNotice(res, "Wrong passcode"));
      }
      setPasscode("");
    } catch {
      setNotice({ tone: "danger", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Header title="Admin passcode" subtitle="Site admin" icon="shield" />
      <Input
        type="password"
        value={passcode}
        onChange={(e) => { setPasscode(e.target.value); setNotice(null); }}
        autoFocus
        autoComplete="current-password"
        aria-label="Admin passcode"
      />
      <NoticeLine notice={notice} />
      <Button type="submit" className="w-full" disabled={busy}>Unlock and continue</Button>
      <p className="text-center text-xs text-muted-foreground">Stays unlocked until you close the browser</p>
    </form>
  );
}

// ─── The dialog ────────────────────────────────────────────────────────────────

/** Mount once. commissioner is the signed-in user when they are a commissioner of the open league. */
export default function UnlockDialog({ commissioner }: { commissioner: UnlockCommissioner | null }) {
  const request = useSyncExternalStore(subscribeUnlock, currentUnlockRequest, () => null);

  useEffect(() => {
    setPromptableCommissioner(commissioner?.sleeperUserId ?? null);
    return () => setPromptableCommissioner(null);
  }, [commissioner?.sleeperUserId]);

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) finishUnlock(false); }}>
      <DialogContent className="max-w-sm">
        {request?.kind === "commissioner" && commissioner ? (
          <CommissionerForm league={request.league} commissioner={commissioner} />
        ) : request?.kind === "admin" ? (
          <AdminPasscodeForm onDone={finishUnlock} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
