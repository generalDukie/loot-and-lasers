import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";

// Loads the global hub button config (custom buttons + builtin overrides).
// Layout positions are intentionally NOT stored — the hub uses a fixed
// responsive flex layout so it scales cleanly across resolutions.
export function useHubLayout(userId) {
  const [layoutId, setLayoutId] = useState(null);
  const [customButtons, setCustomButtons] = useState([]);
  const [builtinOverrides, setBuiltinOverrides] = useState({});
  const [loaded, setLoaded] = useState(false);
  const layoutIdRef = useRef(null);

  useEffect(() => { layoutIdRef.current = layoutId; }, [layoutId]);

  const applyRecord = useCallback((rec) => {
    if (!rec) return;
    layoutIdRef.current = rec.id;
    setLayoutId(rec.id);
    setCustomButtons(rec.custom_buttons || []);
    setBuiltinOverrides(rec.builtin_overrides || {});
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    api.entities.HubLayout.list("created_date", 1)
      .then((recs) => {
        if (!active) return;
        if (recs.length > 0) applyRecord(recs[0]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { active = false; };
  }, [userId, applyRecord]);

  useEffect(() => {
    const unsubscribe = api.entities.HubLayout.subscribe((event) => {
      if ((event.type === "create" || event.type === "update") && event.data) {
        applyRecord(event.data);
      }
    });
    return unsubscribe;
  }, [applyRecord]);

  const persist = useCallback((payload) => {
    const id = layoutIdRef.current;
    if (id) {
      api.entities.HubLayout.update(id, payload).catch(() => {});
    } else {
      api.entities.HubLayout.create(payload)
        .then((r) => { layoutIdRef.current = r.id; setLayoutId(r.id); })
        .catch(() => {});
    }
  }, []);

  const addCustomButton = useCallback(() => {
    setCustomButtons((prev) => {
      const newBtn = {
        id: "btn_" + Date.now(),
        label: "New Button",
        icon: "✨",
        color: "#5CFFB0",
        desc: "",
        size: "md",
        options: [{ label: "Link", icon: "🔗", to: "/", color: "#5CFFB0" }],
      };
      const next = [...prev, newBtn];
      persist({ custom_buttons: next });
      return next;
    });
  }, [persist]);

  const updateCustomButton = useCallback((id, patch) => {
    setCustomButtons((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
      persist({ custom_buttons: next });
      return next;
    });
  }, [persist]);

  const removeCustomButton = useCallback((id) => {
    setCustomButtons((prev) => {
      const next = prev.filter((b) => b.id !== id);
      persist({ custom_buttons: next });
      return next;
    });
  }, [persist]);

  const updateBuiltin = useCallback((id, patch) => {
    setBuiltinOverrides((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] || {}), ...patch } };
      persist({ builtin_overrides: next });
      return next;
    });
  }, [persist]);

  const resetBuiltin = useCallback((id) => {
    setBuiltinOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      persist({ builtin_overrides: next });
      return next;
    });
  }, [persist]);

  return {
    customButtons,
    builtinOverrides,
    addCustomButton,
    updateCustomButton,
    removeCustomButton,
    updateBuiltin,
    resetBuiltin,
    loaded,
  };
}
