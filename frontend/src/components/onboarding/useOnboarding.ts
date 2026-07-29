import { useCallback, useEffect, useState } from "react";

/**
 * First-run state, persisted locally.
 *
 * Versioned on purpose: if the explainer changes materially we can show it
 * again by bumping the key, rather than leaving returning users with a stale
 * mental model and no way to discover the update.
 */
const KEY = "recourse.onboarding.v1";

interface State {
  welcomed: boolean;
  checklistDismissed: boolean;
}

const DEFAULTS: State = { welcomed: false, checklistDismissed: false };

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    // Private mode, disabled storage, corrupt value — onboarding is not worth
    // breaking the app over. Treat as a fresh visitor.
    return DEFAULTS;
  }
}

export function useOnboarding() {
  const [state, setState] = useState<State>(DEFAULTS);
  // Avoid flashing the dialog before localStorage has been read.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(read());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<State>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  return {
    hydrated,
    /** A visitor who has never completed the intro. */
    isNewVisitor: hydrated && !state.welcomed,
    showWelcome: hydrated && !state.welcomed,
    showChecklist: hydrated && !state.checklistDismissed,
    completeWelcome: () => update({ welcomed: true }),
    dismissChecklist: () => update({ checklistDismissed: true }),
    /** Replay from the help button. */
    replay: () => update({ welcomed: false, checklistDismissed: false }),
  };
}
