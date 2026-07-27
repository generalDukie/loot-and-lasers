import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { RACES, CLASSES } from "@/lib/gameData";
import { bustMyCharacterCache } from "@/lib/socialEngine";
import RaceCard from "@/components/game/RaceCard";
import ClassCard from "@/components/game/ClassCard";
import ClassStatsChart from "@/components/game/ClassStatsChart";
import CharacterAvatar, { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/components/game/CharacterAvatar";
import ArrowSelector from "@/components/game/ArrowSelector";
import { popIn, staggerParent, staggerChild, btnPress } from "@/lib/juicyMotion";
import { ChevronRight, ChevronLeft, Rocket, Check, X, Loader2 } from "lucide-react";

const STEPS = ["Race", "Class", "Looks", "Launch"];

export default function CharacterCreation() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    race: "",
    class: "",
    skinColor: "",
    eyeStyle: "",
    ears: "",
    mouth: "",
    nose: "",
    eyebrows: "",
    marking: "",
  });
  const [checked, setChecked] = useState(false);
  const [startCrystals, setStartCrystals] = useState(100);
  const [userLegacyName, setUserLegacyName] = useState("");
  const [existingCharCount, setExistingCharCount] = useState(0);
  // Debounced name availability: "idle" | "checking" | "available" | "taken"
  const [nameStatus, setNameStatus] = useState("idle");

  useEffect(() => {
    (async () => {
      try {
        const me = await api.auth.me();
        const list = await api.entities.Character.filter({ created_by_id: me.id }, "-created_date", 10);
        const maxSlots = Math.min(3, 1 + (me.purchased_slots || 0));
        if (list.length >= maxSlots) { navigate("/"); return; }
        setExistingCharCount(list.length);
        setStartCrystals(list.length === 0 ? 100 : 0);
        setUserLegacyName(me.legacy_name || "");
      } catch {
        navigate("/");
        return;
      }
      setChecked(true);
    })();
  }, [navigate]);

  useEffect(() => {
    const trimmed = form.name.trim();
    if (step !== 2 || !trimmed) { setNameStatus("idle"); return; }
    setNameStatus("checking");
    const t = setTimeout(async () => {
      try {
        const taken = await api.entities.Character.filter({ name: trimmed });
        setNameStatus(taken.length > 0 ? "taken" : "available");
      } catch {
        setNameStatus("idle");
      }
    }, 450);
    return () => clearTimeout(t);
  }, [form.name, step]);

  if (!checked) {
    return (
      <div className="min-h-screen stars-bg flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const race = form.race ? RACES[form.race] : null;
  const cls = form.class ? CLASSES[form.class] : null;

  // Base class stats — racial % bonuses applied at compute time; previewed here.
  const baseStats = cls ? { ...cls.baseStats } : { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 };
  const finalStats = { ...baseStats };
  if (race) {
    Object.entries(race.bonuses).forEach(([k, v]) => { finalStats[k] = Math.round((finalStats[k] || 0) * (1 + v)); });
  }

  function selectRace(r) {
    setForm(f => {
      const keepSkin = r.skinColors.includes(f.skinColor);
      return {
        ...f,
        race: r.name,
        skinColor: keepSkin ? f.skinColor : r.skinColors[0],
        eyeStyle: f.eyeStyle || EYES[0],
        ears: f.ears || EARS[0],
        mouth: f.mouth || MOUTHS[0],
        nose: f.nose || NOSES[0],
        eyebrows: f.eyebrows || BROWS[0],
        marking: f.marking || MARKINGS[0],
      };
    });
  }

  function handleCancel() {
    navigate(existingCharCount > 0 ? "/select-character" : "/");
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.race || !form.class) return;
    setLoading(true);
    setError("");
    try {
      const taken = await api.entities.Character.filter({ name: form.name.trim() });
      if (taken.length > 0) {
        setError("That name's taken. Pick another.");
        setLoading(false);
        setStep(2);
        return;
      }
      const created = await api.entities.Character.create({
        name: form.name.trim(),
        legacy_name: userLegacyName || undefined,
        race: form.race,
        class: form.class,
        level: 1,
        experience: 0,
        experience_to_next_level: 100,
        nova_crystals: startCrystals,
        stats: baseStats,
        unspent_stat_points: 0,
        stardust: 0,
        appearance: {
          skin_color: form.skinColor || race.skinColors[0],
          eye_style: form.eyeStyle,
          ears: form.ears,
          mouth: form.mouth,
          nose: form.nose,
          eyebrows: form.eyebrows,
          marking: form.marking,
        },
        equipped_items: {},
        missions_completed: 0,
        highest_sector: 1,
      });
      await api.auth.updateMe({ active_character_id: created.id });
      bustMyCharacterCache();
      window.location.href = "/";
    } catch (e) {
      setError(e?.response?.data?.error || "Could not create character. Try again.");
      setLoading(false);
    }
  }

  const skinTones = race ? race.skinColors : [];
  const skinIdx = Math.max(0, skinTones.indexOf(form.skinColor));
  const cycleSkin = (d) => {
    if (!skinTones.length) return;
    setForm(f => ({ ...f, skinColor: skinTones[(skinIdx + d + skinTones.length) % skinTones.length] }));
  };

  const canNext = step === 0 ? !!form.race
    : step === 1 ? !!form.class
    : step === 2 ? !!form.name.trim() && nameStatus === "available"
    : true;

  const nextHint = step === 2 && form.name.trim()
    ? nameStatus === "checking" ? "Checking name…"
      : nameStatus === "taken" ? "Name taken"
      : null
    : step === 2 && !form.name.trim() ? "Need a name"
    : null;

  return (
    <div className="min-h-screen stars-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={popIn.animate.transition}
          className="text-center mb-8 relative"
        >
          <button
            onClick={handleCancel}
            disabled={loading}
            className="absolute right-0 top-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            title={existingCharCount > 0 ? "Back to operative select" : "Cancel"}
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <h1 className="font-display font-bold text-2xl md:text-3xl glow-cyan tracking-wider">BUILD YOUR OPERATIVE</h1>
          <p className="text-muted-foreground text-sm mt-2">Pick a species, pick a job, make a face. Try not to explode on day one.</p>
        </motion.div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 ${i <= step ? "text-primary" : "text-muted-foreground/40"}`}>
                <motion.div
                  animate={{ scale: i === step ? 1.12 : 1 }}
                  transition={popIn.animate.transition}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold border ${
                    i < step ? "bg-primary border-primary text-primary-foreground" :
                    i === step ? "border-primary text-primary border-glow-cyan" : "border-muted-foreground/30"
                  }`}
                >
                  {i + 1}
                </motion.div>
                <span className="text-xs font-medium hidden sm:inline">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-px ${i < step ? "bg-primary" : "bg-muted-foreground/20"}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 painted-panel canvas-grain">
          <AnimatePresence mode="wait">
            <motion.div key={step} variants={popIn} initial="initial" animate="animate" exit="exit">
              {step === 0 && (
                <div className="space-y-3">
                  <h2 className="font-display font-semibold text-lg tracking-wide mb-4">Pick Your Race</h2>
                  <motion.div variants={staggerParent} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2">
                    {Object.values(RACES).map(r => (
                      <motion.div key={r.name} variants={staggerChild}>
                        <RaceCard race={r} selected={form.race === r.name} onClick={() => selectRace(r)} />
                      </motion.div>
                    ))}
                  </motion.div>
                  <AnimatePresence>
                    {race && (
                      <motion.div
                        key="lore"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 p-3 bg-muted/30 rounded-xl overflow-hidden"
                      >
                        <p className="text-xs text-muted-foreground">{race.lore}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <h2 className="font-display font-semibold text-lg tracking-wide mb-4">Pick Your Class</h2>
                  <motion.div variants={staggerParent} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2">
                    {Object.values(CLASSES).map(c => (
                      <motion.div key={c.name} variants={staggerChild}>
                        <ClassCard cls={c} selected={form.class === c.name} onClick={() => setForm(f => ({ ...f, class: c.name }))} />
                      </motion.div>
                    ))}
                  </motion.div>
                  <AnimatePresence>
                    {cls && (
                      <motion.div
                        key={cls.name}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-4 overflow-hidden"
                      >
                        <div className="p-3 bg-muted/30 rounded-xl">
                          <p className="text-xs text-muted-foreground">{cls.description}</p>
                          {cls.special && (
                            <div className="mt-2 pt-2 border-t border-border/40">
                              <p className="text-xs font-display font-semibold text-primary">{cls.special.name}</p>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{cls.special.effect}</p>
                              <p className="text-[10px] text-accent/80 italic mt-1">{cls.special.identity}</p>
                            </div>
                          )}
                        </div>
                        <div className="p-3 bg-muted/20 rounded-xl border border-border/40">
                          <ClassStatsChart
                            characterClass={form.class}
                            stats={finalStats}
                            raceBonusNote={race ? `Includes ${race.name} racial bonuses on the preview values.` : null}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {step === 2 && race && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display font-semibold text-lg tracking-wide">Customize Your Face</h2>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                        {race.name}
                      </span>
                      {cls && (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium">
                          {cls.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-[180px_1fr] gap-6">
                    <div className="flex flex-col items-center md:sticky md:top-4 md:self-start">
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <CharacterAvatar
                          race={form.race}
                          skinColor={form.skinColor || race.skinColors[0]}
                          eyeStyle={form.eyeStyle}
                          ears={form.ears}
                          mouth={form.mouth}
                          nose={form.nose}
                          eyebrows={form.eyebrows}
                          marking={form.marking}
                          size={160}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 font-display tracking-widest uppercase">Preview</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Operative Name</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Something cool. Or stupid. Your call."
                            maxLength={24}
                            className={`w-full bg-muted/50 border rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-1 transition-colors ${
                              nameStatus === "taken" ? "border-destructive focus:border-destructive focus:ring-destructive/30"
                              : nameStatus === "available" ? "border-green-500 focus:border-green-500 focus:ring-green-500/30"
                              : "border-border focus:border-primary focus:ring-primary/30"
                            }`}
                          />
                          {nameStatus === "checking" && (
                            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                          )}
                          {nameStatus === "available" && (
                            <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                          )}
                          {nameStatus === "taken" && (
                            <X className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />
                          )}
                        </div>
                        {nameStatus === "taken" && (
                          <p className="text-[11px] text-destructive mt-1">Taken. Try again, hotshot.</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2 border border-border/30">
                        <span className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">Skin Tone</span>
                        <motion.button type="button" {...btnPress} onClick={() => cycleSkin(-1)} className="p-1 rounded-lg hover:bg-muted hover:text-primary transition-colors text-muted-foreground">
                          <ChevronLeft className="w-4 h-4" />
                        </motion.button>
                        <div className="flex-1 flex justify-center">
                          <motion.span
                            key={form.skinColor}
                            initial={{ scale: 0.85 }}
                            animate={{ scale: 1 }}
                            transition={popIn.animate.transition}
                            className="w-9 h-9 rounded-full border-2 border-border shadow-inner"
                            style={{ backgroundColor: form.skinColor || race.skinColors[0] }}
                          />
                        </div>
                        <motion.button type="button" {...btnPress} onClick={() => cycleSkin(1)} className="p-1 rounded-lg hover:bg-muted hover:text-primary transition-colors text-muted-foreground">
                          <ChevronRight className="w-4 h-4" />
                        </motion.button>
                      </div>

                      <div className="space-y-2">
                        <ArrowSelector label="Eyes" value={form.eyeStyle} options={EYES} onChange={v => setForm(f => ({ ...f, eyeStyle: v }))} />
                        <ArrowSelector label="Brows" value={form.eyebrows} options={BROWS} onChange={v => setForm(f => ({ ...f, eyebrows: v }))} />
                        <ArrowSelector label="Nose" value={form.nose} options={NOSES} onChange={v => setForm(f => ({ ...f, nose: v }))} />
                        <ArrowSelector label="Mouth" value={form.mouth} options={MOUTHS} onChange={v => setForm(f => ({ ...f, mouth: v }))} />
                        <ArrowSelector label="Ears" value={form.ears} options={EARS} onChange={v => setForm(f => ({ ...f, ears: v }))} />
                        <ArrowSelector label="Marks" value={form.marking} options={MARKINGS} onChange={v => setForm(f => ({ ...f, marking: v }))} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && race && cls && (
                <div className="space-y-5">
                  <h2 className="font-display font-semibold text-lg tracking-wide">Looking Good. Ship It.</h2>

                  <div className="grid sm:grid-cols-[auto_1fr] gap-5 items-start p-4 bg-muted/20 rounded-xl border border-border/40">
                    <div className="flex flex-col items-center gap-2">
                      <CharacterAvatar
                        race={form.race}
                        skinColor={form.skinColor || race.skinColors[0]}
                        eyeStyle={form.eyeStyle}
                        ears={form.ears}
                        mouth={form.mouth}
                        nose={form.nose}
                        eyebrows={form.eyebrows}
                        marking={form.marking}
                        size={140}
                      />
                      <div className="text-center">
                        <h3 className="font-display font-bold text-xl glow-cyan">{form.name}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{race.name} · {cls.name}</p>
                      </div>
                    </div>
                    <ClassStatsChart
                      characterClass={form.class}
                      stats={finalStats}
                      raceBonusNote={`Includes ${race.name} racial bonuses.`}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {error && (
          <p className="text-xs text-destructive text-center mt-3">{error}</p>
        )}

        <div className="flex items-center justify-between mt-6">
          <motion.button
            {...btnPress}
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </motion.button>

          <div className="flex items-center gap-3">
            {nextHint && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">{nextHint}</span>
            )}
            {step < 3 ? (
              <motion.button
                {...btnPress}
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext}
                className="flex items-center gap-1 text-sm bg-primary/10 hover:bg-primary/20 text-primary px-5 py-2 rounded-lg font-display font-semibold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed transition-colors painted-btn"
              >
                Next <ChevronRight className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                {...btnPress}
                onClick={handleCreate}
                disabled={loading || !form.name.trim()}
                className="flex items-center gap-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg font-display font-bold tracking-wide disabled:opacity-50 transition-colors painted-btn"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                LAUNCH
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
