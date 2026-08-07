import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  advanceTutorial,
  completeTutorial,
  fetchTutorialState,
  skipTutorial,
} from "@/lib/tutorial/api";
import { TUTORIAL_EVENT, metaForStep } from "@/lib/tutorial/catalog";
import { primeMyCharacterCache } from "@/lib/socialEngine";

const TutorialContext = createContext(null);

function applyCharacterPatch(setCharacter, character, next) {
  if (!next || !setCharacter) return;
  primeMyCharacterCache(next);
  setCharacter(next);
}

/**
 * Reusable interactive tutorial host.
 * Mount once in GameLayout; steps are driven by server tutorial.step.
 */
export function TutorialProvider({ character, setCharacter, onOpenDaily, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tutorial, setTutorial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [spotlightRect, setSpotlightRect] = useState(null);
  const loadedFor = useRef(null);
  const advancing = useRef(false);

  const active = !!(tutorial?.should_show && (tutorial.status === "pending" || tutorial.status === "active"));
  const step = tutorial?.step || null;
  const meta = metaForStep(step?.id);

  const refresh = useCallback(async () => {
    if (!character?.id) return null;
    try {
      const data = await fetchTutorialState();
      if (data?.tutorial) setTutorial(data.tutorial);
      if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
      return data?.tutorial || null;
    } catch (err) {
      setError(err?.message || "Could not load tutorial");
      return null;
    }
  }, [character?.id, setCharacter]);

  useEffect(() => {
    if (!character?.id) return;
    if (loadedFor.current === character.id) return;
    loadedFor.current = character.id;
    refresh();
  }, [character?.id, refresh]);

  // Measure spotlight target
  useEffect(() => {
    if (!active || !step?.spotlight) {
      setSpotlightRect(null);
      return undefined;
    }
    let cancelled = false;
    const measure = () => {
      const el = document.querySelector(`[data-tutorial="${step.spotlight}"]`);
      if (!el) {
        if (!cancelled) setSpotlightRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (!cancelled) {
        setSpotlightRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      }
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step?.id, step?.spotlight, location.pathname]);

  // Auto-open daily rewards on that step
  useEffect(() => {
    if (!active || !step?.openDaily) return;
    onOpenDaily?.();
  }, [active, step?.id, step?.openDaily, onOpenDaily]);

  // Visit-gate: only advance when the player navigates onto the target route
  // during this step (not if they already happen to be on that page).
  const prevPathRef = useRef(location.pathname);
  const stepIdRef = useRef(step?.id);
  useEffect(() => {
    if (stepIdRef.current !== step?.id) {
      stepIdRef.current = step?.id;
      prevPathRef.current = location.pathname;
    }
  }, [step?.id, location.pathname]);

  useEffect(() => {
    if (!active || !meta.waitForAction?.startsWith("visit:")) return;
    const route = meta.waitForAction.slice("visit:".length);
    const arrived = location.pathname === route && prevPathRef.current !== route;
    prevPathRef.current = location.pathname;
    if (!arrived) return;
    if (advancing.current || busy) return;
    advancing.current = true;
    (async () => {
      try {
        setBusy(true);
        const data = await advanceTutorial({ action: "next" });
        if (data?.tutorial) setTutorial(data.tutorial);
        if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
      } catch (err) {
        setError(err?.message || "Could not advance tutorial");
      } finally {
        setBusy(false);
        advancing.current = false;
      }
    })();
  }, [active, meta.waitForAction, location.pathname, busy, character, setCharacter]);

  // Action bus for future gated steps (equip, mission start, etc.)
  useEffect(() => {
    if (!active) return undefined;
    const onAction = (ev) => {
      const action = ev?.detail?.action;
      if (!action || !meta.waitForAction) return;
      if (action !== meta.waitForAction) return;
      if (advancing.current || busy) return;
      advancing.current = true;
      (async () => {
        try {
          setBusy(true);
          const data = await advanceTutorial({ action: "next" });
          if (data?.tutorial) setTutorial(data.tutorial);
          if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
        } catch (err) {
          setError(err?.message || "Could not advance tutorial");
        } finally {
          setBusy(false);
          advancing.current = false;
        }
      })();
    };
    window.addEventListener(TUTORIAL_EVENT, onAction);
    return () => window.removeEventListener(TUTORIAL_EVENT, onAction);
  }, [active, meta.waitForAction, busy, character, setCharacter]);

  const goNext = useCallback(async () => {
    if (busy || advancing.current) return;
    setError("");
    if (meta.navigateTo && location.pathname !== meta.navigateTo) {
      navigate(meta.navigateTo);
      return;
    }
    if (meta.finish) {
      setBusy(true);
      advancing.current = true;
      try {
        const data = await completeTutorial();
        if (data?.tutorial) setTutorial(data.tutorial);
        if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
      } catch (err) {
        setError(err?.message || "Could not complete tutorial");
      } finally {
        setBusy(false);
        advancing.current = false;
      }
      return;
    }
    if (meta.waitForAction?.startsWith("visit:")) {
      // Waiting for navigation — primary button navigates
      if (meta.navigateTo) navigate(meta.navigateTo);
      return;
    }
    setBusy(true);
    advancing.current = true;
    try {
      const data = await advanceTutorial({ action: "next" });
      if (data?.tutorial) setTutorial(data.tutorial);
      if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
    } catch (err) {
      setError(err?.message || "Could not advance tutorial");
    } finally {
      setBusy(false);
      advancing.current = false;
    }
  }, [busy, meta, location.pathname, navigate, character, setCharacter]);

  const goBack = useCallback(async () => {
    if (busy || advancing.current) return;
    setBusy(true);
    advancing.current = true;
    try {
      const data = await advanceTutorial({ action: "back" });
      if (data?.tutorial) setTutorial(data.tutorial);
      if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
    } catch (err) {
      setError(err?.message || "Could not go back");
    } finally {
      setBusy(false);
      advancing.current = false;
    }
  }, [busy, character, setCharacter]);

  const onSkip = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await skipTutorial();
      if (data?.tutorial) setTutorial(data.tutorial);
      if (data?.character) applyCharacterPatch(setCharacter, character, data.character);
    } catch (err) {
      setError(err?.message || "Could not skip tutorial");
    } finally {
      setBusy(false);
    }
  }, [busy, character, setCharacter]);

  const value = useMemo(
    () => ({
      tutorial,
      active,
      step,
      meta,
      busy,
      error,
      spotlightRect,
      goNext,
      goBack,
      onSkip,
      refresh,
    }),
    [tutorial, active, step, meta, busy, error, spotlightRect, goNext, goBack, onSkip, refresh]
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
