import React, { useState } from "react";
import { useSiteConfig } from "@/lib/SiteConfigContext";
import { Pencil, RotateCcw } from "lucide-react";

// Renders text that admins can edit in-place when global edit mode is on.
// `textKey` uniquely identifies the string; `default` is the fallback shown
// when no override exists. Non-admins / non-edit mode see plain text.
export default function EditableText({ textKey, default: fallback, as: Tag = "span", className, multiline = false }) {
  const { editMode, getText, setText, resetText, textOverrides } = useSiteConfig();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const value = getText(textKey, fallback);
  const hasOverride = !!(textOverrides && Object.prototype.hasOwnProperty.call(textOverrides, textKey));

  if (!editMode) {
    return <Tag className={className}>{value}</Tag>;
  }

  if (editing) {
    const save = () => {
      setText(textKey, draft);
      setEditing(false);
    };
    const shared = {
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      onBlur: save,
      autoFocus: true,
      className: (className || "") + " bg-background border border-primary/50 rounded px-1 outline-none",
    };
    return (
      <Tag className={className}>
        {multiline ? (
          <textarea {...shared} rows={2} onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }} />
        ) : (
          <input {...shared} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
        )}
      </Tag>
    );
  }

  return (
    <Tag className={className}>
      <span className="inline-flex items-center gap-0.5 align-middle">
        <span>{value}</span>
        <button
          type="button"
          onClick={() => { setDraft(value); setEditing(true); }}
          className="inline-flex items-center text-primary/70 hover:text-primary"
          title="Edit this text"
        >
          <Pencil className="w-3 h-3" />
        </button>
        {hasOverride && (
          <button
            type="button"
            onClick={() => resetText(textKey)}
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
            title="Reset to default"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </span>
    </Tag>
  );
}