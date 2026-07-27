import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, X, GripVertical, RotateCcw } from "lucide-react";
import { mergeBuiltin } from "@/lib/hubButtons";

// Admin modal for editing built-in buttons + creating/editing custom buttons.
export default function HubButtonEditor({
  open,
  onClose,
  buttons,
  onAdd,
  onUpdate,
  onRemove,
  builtinButtons = [],
  builtinOverrides = {},
  onUpdateBuiltin,
  onResetBuiltin,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Hub Buttons</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Built-in buttons */}
          {builtinButtons.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">Built-in Buttons</p>
              {builtinButtons.map((def) => (
                <BuiltinCard
                  key={def.id}
                  def={def}
                  override={builtinOverrides[def.id]}
                  onUpdate={onUpdateBuiltin}
                  onReset={onResetBuiltin}
                />
              ))}
            </div>
          )}

          {/* Custom buttons */}
          <div className="space-y-3">
            <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">Custom Buttons</p>
            {buttons.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">No custom buttons yet.</p>
            )}
            {buttons.map((btn) => (
              <div key={btn.id} className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Input className="w-14 text-center text-lg" value={btn.icon} onChange={(e) => onUpdate(btn.id, { icon: e.target.value })} title="Emoji icon" />
                  <Input className="flex-1" placeholder="Button label" value={btn.label} onChange={(e) => onUpdate(btn.id, { label: e.target.value })} />
                  <input type="color" className="w-9 h-9 rounded-md border border-border/60 bg-transparent cursor-pointer" value={btn.color} onChange={(e) => onUpdate(btn.id, { color: e.target.value })} title="Accent color" />
                  <Button size="icon" variant="destructive" onClick={() => onRemove(btn.id)} title="Remove button">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Input placeholder="Description (optional)" value={btn.desc || ""} onChange={(e) => onUpdate(btn.id, { desc: e.target.value })} />

                {/* Size selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider">Size</span>
                  {["sm", "md", "lg"].map((s) => (
                    <button
                      key={s}
                      onClick={() => onUpdate(btn.id, { size: s })}
                      className={`px-2 py-1 rounded text-[10px] font-display font-bold border transition-colors ${(btn.size || "md") === s ? "bg-primary/20 text-primary border-primary/40" : "bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/60"}`}
                    >
                      {s === "sm" ? "Small" : s === "lg" ? "Large" : "Medium"}
                    </button>
                  ))}
                </div>

                <OptionsEditor btn={btn} onUpdate={onUpdate} />
              </div>
            ))}
            <Button onClick={onAdd} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> Add Button
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Reusable hover-options editor for split-style buttons (custom + built-in).
function OptionsEditor({ btn, onUpdate }) {
  const opts = btn.options || [];
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <GripVertical className="w-3 h-3" /> Hover Options (mouse-over links)
      </p>
      {opts.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input className="w-12 text-center text-base" value={opt.icon} onChange={(e) => updateOption(btn, i, { icon: e.target.value }, onUpdate)} title="Emoji icon" />
          <Input className="w-24" placeholder="Label" value={opt.label} onChange={(e) => updateOption(btn, i, { label: e.target.value }, onUpdate)} />
          <Input className="flex-1" placeholder="/route" value={opt.to} onChange={(e) => updateOption(btn, i, { to: e.target.value }, onUpdate)} title="Link path, e.g. /shop" />
          <input type="color" className="w-8 h-8 rounded-md border border-border/60 bg-transparent cursor-pointer" value={opt.color || btn.color} onChange={(e) => updateOption(btn, i, { color: e.target.value }, onUpdate)} title="Link color" />
          <Button size="icon" variant="ghost" disabled={opts.length <= 1} onClick={() => removeOption(btn, i, onUpdate)} title="Remove option">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => addOption(btn, onUpdate)}>
        <Plus className="w-3 h-3 mr-1" /> Add Option
      </Button>
    </div>
  );
}

// A built-in button card — editable label/icon/color/desc + options (split) or single link (side/center).
function BuiltinCard({ def, override, onUpdate, onReset }) {
  const c = mergeBuiltin(def, override);
  const isSplit = def.type === "split";
  const hasOverride = !!(override && Object.keys(override).length);
  const singleTo = (c.options || [])[0]?.to || "";

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <Input className="w-14 text-center text-lg" value={c.icon} onChange={(e) => onUpdate(def.id, { icon: e.target.value })} title="Emoji icon" />
        <Input className="flex-1" value={c.label} onChange={(e) => onUpdate(def.id, { label: e.target.value })} />
        <input type="color" className="w-9 h-9 rounded-md border border-border/60 bg-transparent cursor-pointer" value={c.color} onChange={(e) => onUpdate(def.id, { color: e.target.value })} title="Accent color" />
        <Button size="icon" variant="ghost" disabled={!hasOverride} onClick={() => onReset(def.id)} title="Reset to default">
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>
      <Input placeholder="Description" value={c.desc || ""} onChange={(e) => onUpdate(def.id, { desc: e.target.value })} />

      {isSplit ? (
        <OptionsEditor btn={c} onUpdate={onUpdate} />
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider">Link</p>
          <Input
            value={singleTo}
            onChange={(e) => onUpdate(def.id, { options: [{ ...(c.options || [])[0], to: e.target.value }] })}
            placeholder="/route"
            title="Link path"
          />
        </div>
      )}
    </div>
  );
}

function updateOption(btn, index, patch, onUpdate) {
  const options = (btn.options || []).map((o, i) => (i === index ? { ...o, ...patch } : o));
  onUpdate(btn.id, { options });
}

function addOption(btn, onUpdate) {
  const options = [...(btn.options || []), { label: "Link", icon: "🔗", to: "/", color: btn.color }];
  onUpdate(btn.id, { options });
}

function removeOption(btn, index, onUpdate) {
  if ((btn.options || []).length <= 1) return;
  const options = btn.options.filter((_, i) => i !== index);
  onUpdate(btn.id, { options });
}