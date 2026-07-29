import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal modal. Hand-rolled rather than pulling in @radix-ui/react-dialog:
 * the app needs one dialog, and the accessibility surface that actually
 * matters here — focus trap, Escape, scroll lock, labelled role — is short
 * enough to own outright.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
  dismissable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog so the keyboard doesn't stay on the page behind.
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // Focus trap: cycle within the panel.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      (restoreFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "glass animate-fade-rise relative w-full rounded-[var(--radius-panel)] outline-none",
          // Must scroll internally: the onboarding content is taller than a
          // phone in landscape, and a modal you cannot scroll is a dead end.
          "max-h-[90dvh] overflow-y-auto overscroll-contain",
          size === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:gap-6 sm:px-7 sm:pt-7">
          <div>
            <h2 className="display text-lg font-semibold">{title}</h2>
            {description && (
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {dismissable && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-lg p-1.5 transition-colors hover:bg-white/[0.06]"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {children && <div className="px-5 py-5 sm:px-7 sm:py-6">{children}</div>}

        {footer && (
          <div className="flex items-center justify-between gap-4 px-5 pb-5 sm:px-7 sm:pb-7">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
