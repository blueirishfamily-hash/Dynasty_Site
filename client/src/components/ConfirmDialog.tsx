// An on-page "are you sure?" dialog, in place of the browser's confirm() pop-up. Browser pop-ups are blocked
// or dismissed automatically in some embedded browsers, which made the buttons behind them do nothing.
//
//   const { ask, dialog } = useConfirm();
//   if (!(await ask("Remove this person?", "Remove"))) return;
//   ...render {dialog} once in the component
import { useCallback, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Pending {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

export function useConfirm(): { ask: (message: string, confirmLabel?: string) => Promise<boolean>; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (message: string, confirmLabel = "Continue") => new Promise<boolean>((resolve) => setPending({ message, confirmLabel, resolve })),
    [],
  );

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => answer(true)} data-testid="button-confirm">{pending?.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { ask, dialog };
}
