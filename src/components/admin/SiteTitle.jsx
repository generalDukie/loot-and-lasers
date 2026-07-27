import React from "react";
import { useSiteConfig } from "@/lib/SiteConfigContext";

const DEFAULT_TITLE = "LOOT & LASERS";

// Site title from SiteConfig overrides (display-only — no in-place edit mode).
export default function SiteTitle({ as: Tag = "span", className, fallback = DEFAULT_TITLE }) {
  const { getText } = useSiteConfig();
  const value = getText("app.title", fallback);
  return <Tag className={className}>{value}</Tag>;
}
