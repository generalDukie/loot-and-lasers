import React from "react";
import { Link } from "react-router-dom";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { RACES, CLASSES, FUEL_COLOR, STARDUST_COLOR, XP_COLOR, formatFuelAmount } from "@/lib/gameData";
import { fullName } from "@/lib/legacyName";
import { Fuel, Gem, Sparkles } from "lucide-react";

/**
 * Persistent operative readout for the game shell — portrait, identity,
 * XP, and currencies. Compact so nav can fill the rail without scrolling.
 */
export default function ShellOperativePanel({ character }) {
  if (!character) {
    return (
      <div className="p-2.5 text-[10px] text-muted-foreground italic">
        No operative loaded.
      </div>
    );
  }

  const ap = character.appearance || {};
  const race = RACES[character.race];
  const cls = CLASSES[character.class];
  const expToNext = character.experience_to_next_level || 0;
  const expPct = expToNext > 0
    ? Math.min(100, ((character.experience || 0) / expToNext) * 100)
    : 0;
  const fuelMax = character.max_fuel || 100;
  const fuelNow = character.fuel ?? 0;
  const fuelLabel = `${formatFuelAmount(fuelNow)}/${fuelMax}`;
  const stardustLabel = (character.stardust || 0).toLocaleString();
  const novaLabel = (character.nova_crystals || 0).toLocaleString();
  const currencyFontSize = railCurrencyFontSize(fuelLabel, stardustLabel, novaLabel);

  return (
    <div className="flex flex-col gap-2 p-2.5 shrink-0">
      <Link
        to="/character"
        className="group flex flex-col items-center text-center"
        title="Open character sheet"
      >
        <div className="relative shrink-0 mb-1">
          <div
            className="rounded-lg overflow-hidden border border-primary/45"
            style={{ boxShadow: "0 0 12px hsl(190 90% 50% / 0.28)" }}
          >
            <CharacterAvatar
              race={character.race}
              skinColor={ap.skin_color}
              eyeStyle={ap.eye_style}
              ears={ap.ears}
              mouth={ap.mouth}
              nose={ap.nose}
              eyebrows={ap.eyebrows}
              marking={ap.marking}
              cls={character.class}
              size={80}
            />
          </div>
          <span className="absolute -bottom-1 -right-1 min-w-[22px] h-[22px] px-0.5 rounded-full bg-primary text-primary-foreground font-display font-black text-[10px] flex items-center justify-center border-2 border-background tabular-nums">
            {character.level}
          </span>
        </div>
        <p className="font-display font-bold text-sm leading-tight truncate w-full group-hover:text-primary transition-colors">
          {fullName(character)}
        </p>
        <p className="text-[10px] text-muted-foreground truncate w-full">
          {race?.emoji} {race?.name || character.race} · {cls?.emoji} {cls?.name || character.class}
        </p>
        {character.active_title && (
          <p className="text-[9px] font-display text-amber-400/85 truncate w-full">
            {character.active_title}
          </p>
        )}
      </Link>

      <div className="flex flex-col gap-1 w-full min-w-0">
        <CurrencyPill
          icon={<Fuel className="w-2.5 h-2.5 shrink-0" style={{ color: FUEL_COLOR }} />}
          value={fuelLabel}
          color={FUEL_COLOR}
          fontSize={currencyFontSize}
          block
        />
        <CurrencyPill
          icon={<Sparkles className="w-2.5 h-2.5 shrink-0" style={{ color: STARDUST_COLOR }} />}
          value={stardustLabel}
          color={STARDUST_COLOR}
          fontSize={currencyFontSize}
          block
        />
        <Link to="/crystal-store" className="min-w-0">
          <CurrencyPill
            icon={<Gem className="w-2.5 h-2.5 shrink-0 text-amber-400" />}
            value={novaLabel}
            color="#FFD700"
            fontSize={currencyFontSize}
            interactive
            block
          />
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between text-[8px] text-muted-foreground mb-0.5 px-0.5">
          <span className="font-display font-semibold tracking-wide" style={{ color: XP_COLOR }}>XP</span>
          <span className="tabular-nums">
            {(character.experience || 0).toLocaleString()} / {expToNext.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden border border-border/30">
          <div
            className="h-full rounded-full"
            style={{ width: `${expPct}%`, background: `linear-gradient(90deg, ${XP_COLOR}, #38BDF8)` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Shrink font only once values are long enough to crowd the rail. */
function railCurrencyFontSize(...labels) {
  const maxLen = Math.max(...labels.map((label) => String(label).length));
  if (maxLen <= 6) return 11;
  if (maxLen <= 8) return 10;
  if (maxLen <= 10) return 9;
  if (maxLen <= 12) return 8;
  return 7;
}

function CurrencyPill({ icon, value, color, interactive, fontSize = 10, block }) {
  return (
    <span
      className={`${block ? "flex w-full" : "inline-flex"} items-center justify-center gap-1 min-w-0 px-1.5 py-1 rounded-md border border-border/40 bg-muted/25 tabular-nums font-display font-semibold leading-none whitespace-nowrap overflow-hidden ${
        interactive ? "hover:border-amber-400/45 transition-colors" : ""
      }`}
      style={{ color, fontSize: `${fontSize}px` }}
    >
      {icon}
      {value}
    </span>
  );
}
