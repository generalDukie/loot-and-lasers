import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";

// Loads the global hub layout (shared across all users). Admins can edit;
// changes propagate live to everyone via a realtime subscription.
export function useHubLayout(userId) {
  const [layoutId, setLayoutId] = useState(null);
  const [positions, setPositions] = useState({});
  const [customButtons, setCustomButtons] = useState([]);
  const [builtinOverrides, setBuiltinOverrides] = useState({});
  const [loaded, setLoaded] = useState(false);
  const layoutIdRef = useRef(null);

  useEffect(() => { layoutIdRef.current = layoutId; }, [layoutId]);

  const applyRecord = useCallback((rec) => {
    if (!rec) return;
    layoutIdRef.current = rec.id;
    setLayoutId(rec.id);
    setPositions(rec.positions || {});
    setCustomButtons(rec.custom_buttons || []);
    setBuiltinOverrides(rec.builtin_overrides || {});
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    // Single global record — oldest wins as the singleton.
    api.entities.HubLayout.list("created_date", 1)
      .then((recs) => {
        if (!active) return;
        if (recs.length > 0) applyRecord(recs[0]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { active = false; };
  }, [userId, applyRecord]);

  // Live updates for everyone when an admin changes the shared layout.
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

  const savePosition = useCallback((id, pos) => {
    setPositions((prev) => {
      const next = { ...prev, [id]: pos };
      persist({ positions: next });
      return next;
    });
  }, [persist]);

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

  const resetLayout = useCallback(() => {
    setPositions({});
    setCustomButtons([]);
    setBuiltinOverrides({});
    const id = layoutIdRef.current;
    if (id) {
      api.entities.HubLayout.update(id, { positions: {}, custom_buttons: [], builtin_overrides: {} }).catch(() => {});
    }
  }, []);

  return { positions, customButtons, builtinOverrides, savePosition, addCustomButton, updateCustomButton, removeCustomButton, updateBuiltin, resetBuiltin, resetLayout, loaded };
}