// One-time setup code for a commissioner, shown once with a copy button (admin page and League Settings).
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a one-time setup code with a copy button. It can't be shown again after closing. */
export default function SetupCodeDialog({ code, who, onClose }: { code: string | null; who: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={!!code} onOpenChange={(open) => { if (!open) { setCopied(false); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Setup code for {who}</DialogTitle>
          <DialogDescription>
            Send this to them. They enter it at their first commissioner action, then choose their own PIN.
            It works once, for 7 days, and won't be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg tracking-widest" data-testid="text-setup-code">{code}</code>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy setup code"
            onClick={() => { if (code) navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => {}); }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {copied && <p className="text-xs text-muted-foreground">Copied</p>}
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
