import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { requestSoundtrack, soundtrackForPath } from "@/lib/soundtrack";

// Owns the game soundtrack for the whole app — ambient flows continuously
// across pages; only the cantina swaps to its own upbeat bed.
export default function SoundtrackController() {
  const { pathname } = useLocation();

  useEffect(() => {
    requestSoundtrack(soundtrackForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    return () => requestSoundtrack(null);
  }, []);

  return null;
}
