import React from "react";
import { useTutorial } from "@/lib/tutorial/TutorialContext";

const PAD = 8;

/**
 * Spotlight / coach-mark overlay for the reusable tutorial engine.
 * Dims the screen with four panes so the highlighted control stays clickable.
 */
export default function TutorialCoach() {
  const ctx = useTutorial();
  if (!ctx?.active || !ctx.step) return null;

  const {
    step,
    tutorial,
    meta,
    busy,
    error,
    spotlightRect,
    goNext,
    goBack,
    onSkip,
  } = ctx;

  const hole = spotlightRect
    ? {
        top: Math.max(0, spotlightRect.top - PAD),
        left: Math.max(0, spotlightRect.left - PAD),
        width: spotlightRect.width + PAD * 2,
        height: spotlightRect.height + PAD * 2,
      }
    : null;

  const dialogueStyle = placeDialogue(hole);
  const dim = "rgba(2, 6, 18, 0.72)";

  return (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      {!hole ? (
        <div className="absolute inset-0" style={{ background: dim }} />
      ) : (
        <>
          {/* Top */}
          <div
            className="absolute left-0 right-0 top-0"
            style={{ height: hole.top, background: dim }}
          />
          {/* Bottom */}
          <div
            className="absolute left-0 right-0 bottom-0"
            style={{ top: hole.top + hole.height, background: dim }}
          />
          {/* Left */}
          <div
            className="absolute left-0"
            style={{
              top: hole.top,
              height: hole.height,
              width: hole.left,
              background: dim,
            }}
          />
          {/* Right */}
          <div
            className="absolute right-0"
            style={{
              top: hole.top,
              height: hole.height,
              left: hole.left + hole.width,
              background: dim,
            }}
          />
          <div
            className="absolute pointer-events-none rounded-xl"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: "0 0 0 2px hsl(190 90% 55% / 0.95), 0 0 28px hsl(190 90% 50% / 0.45)",
              transition: "top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease",
            }}
          />
        </>
      )}

      <div
        className="absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border p-4 shadow-2xl"
        style={{
          ...dialogueStyle,
          borderColor: "hsl(190 50% 40% / 0.45)",
          background: `
            linear-gradient(160deg, hsl(222 28% 12% / 0.97), hsl(230 32% 8% / 0.98)),
            repeating-linear-gradient(0deg, transparent, transparent 11px, hsl(190 40% 50% / 0.03) 11px, hsl(190 40% 50% / 0.03) 12px)
          `,
          boxShadow: "0 18px 50px rgba(0,0,0,0.55), 0 0 24px hsl(190 90% 50% / 0.12)",
          zIndex: 2,
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-[9px] font-display tracking-[0.2em] text-cyan-300/80 uppercase mb-1">
              Operative Briefing · Step {tutorial.step_index} of {tutorial.step_total}
            </p>
            <h2 id="tutorial-title" className="font-display font-bold text-base text-foreground leading-tight">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="shrink-0 text-[10px] font-display tracking-wide text-muted-foreground hover:text-foreground border border-border/50 rounded-md px-2 py-1 transition-colors"
          >
            Skip Tutorial
          </button>
        </div>

        <p className="text-[12px] text-muted-foreground leading-relaxed mb-1">
          {step.body}
        </p>
        {meta.secondaryHint ? (
          <p className="text-[11px] text-cyan-200/70 mb-3">{meta.secondaryHint}</p>
        ) : (
          <div className="mb-3" />
        )}

        {error && <p className="text-[11px] text-rose-400 mb-2">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={busy || meta.allowBack === false}
            className="text-[11px] font-display px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          >
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className="text-[11px] font-display font-semibold px-3.5 py-1.5 rounded-lg border border-cyan-400/50 text-cyan-100 bg-cyan-500/15 hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
            style={{ boxShadow: "0 0 16px hsl(190 90% 50% / 0.2)" }}
          >
            {busy ? "…" : meta.primaryLabel || "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function placeDialogue(hole) {
  const margin = 16;
  const cardH = 220;
  if (!hole) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }
  const below = hole.top + hole.height + 14;
  const above = hole.top - cardH - 14;
  const preferBelow = below + cardH < window.innerHeight - margin;
  const top = preferBelow ? below : Math.max(margin, above);
  let left = hole.left;
  const maxLeft = window.innerWidth - margin - 352;
  left = Math.min(Math.max(margin, left), Math.max(margin, maxLeft));
  return { top, left, transform: "none" };
}
