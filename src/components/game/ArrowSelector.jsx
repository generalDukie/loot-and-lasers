import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ArrowSelector({ label, value, options, onChange }) {
  const idx = Math.max(0, options.indexOf(value));
  const go = (d) => onChange(options[(idx + d + options.length) % options.length]);

  return (
    <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2 border border-border/30">
      <span className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1">
        <button
          type="button"
          onClick={() => go(-1)}
          className="p-1 rounded-lg hover:bg-muted hover:text-primary transition-colors text-muted-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold flex-1 text-center min-w-0 truncate text-foreground">
          {value}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className="p-1 rounded-lg hover:bg-muted hover:text-primary transition-colors text-muted-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}