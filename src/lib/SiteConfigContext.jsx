import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";

// Global site configuration: theme overrides + text overrides (display only).
const SiteConfigContext = createContext(null);

// Convert #rrggbb → "h s% l%" channels for hsl(var(--token)) consumers.
function hexToHsl(hex) {
  if (!hex) return null;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue, sat, l = (max + min) / 2;
  if (max === min) { hue = sat = 0; }
  else {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4; break;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
}

export function SiteConfigProvider({ children }) {
  const [theme, setTheme] = useState({});
  const [textOverrides, setTextOverrides] = useState({});
  const idRef = useRef(null);

  const applyRecord = useCallback((rec) => {
    if (!rec) return;
    idRef.current = rec.id;
    setTheme(rec.theme || {});
    setTextOverrides(rec.text_overrides || {});
  }, []);

  useEffect(() => {
    let active = true;
    api.entities.SiteConfig.list("created_date", 1)
      .then((recs) => { if (active && recs.length > 0) applyRecord(recs[0]); })
      .catch(() => {});
    const unsubscribe = api.entities.SiteConfig.subscribe((event) => {
      if ((event.type === "create" || event.type === "update") && event.data) applyRecord(event.data);
    });
    return () => { active = false; unsubscribe(); };
  }, [applyRecord]);

  useEffect(() => {
    const root = document.documentElement;
    const set = (token, hex) => {
      const hsl = hexToHsl(hex);
      if (hsl) root.style.setProperty(token, hsl);
      else root.style.removeProperty(token);
    };
    set("--primary", theme.primary_color);
    set("--ring", theme.primary_color);
    set("--sidebar-primary", theme.primary_color);
    set("--sidebar-ring", theme.primary_color);
    set("--accent", theme.accent_color);
    set("--secondary", theme.accent_color);
    if (theme.font_display) {
      root.style.setProperty("--font-display", theme.font_display);
      root.style.setProperty("--font-heading", theme.font_display);
    } else {
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-heading");
    }
    if (theme.font_body) root.style.setProperty("--font-body", theme.font_body);
    else root.style.removeProperty("--font-body");
  }, [theme]);

  const persist = useCallback((payload) => {
    const id = idRef.current;
    if (id) {
      api.entities.SiteConfig.update(id, payload).catch(() => {});
    } else {
      api.entities.SiteConfig.create(payload)
        .then((r) => { idRef.current = r.id; })
        .catch(() => {});
    }
  }, []);

  const updateTheme = useCallback((patch) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      persist({ theme: next });
      return next;
    });
  }, [persist]);

  const setText = useCallback((key, value) => {
    setTextOverrides((prev) => {
      const next = { ...prev, [key]: value };
      persist({ text_overrides: next });
      return next;
    });
  }, [persist]);

  const resetText = useCallback((key) => {
    setTextOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      persist({ text_overrides: next });
      return next;
    });
  }, [persist]);

  const getText = useCallback((key, fallback) => {
    const v = textOverrides[key];
    return v !== undefined && v !== "" ? v : fallback;
  }, [textOverrides]);

  return (
    <SiteConfigContext.Provider
      value={{ theme, textOverrides, updateTheme, setText, resetText, getText }}
    >
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig() {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) {
    return {
      theme: {},
      textOverrides: {},
      updateTheme: () => {},
      setText: () => {},
      resetText: () => {},
      getText: (_k, d) => d,
    };
  }
  return ctx;
}
