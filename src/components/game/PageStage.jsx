/**
 * Full-bleed page stage for in-game routes.
 * Fills the main shell column on any aspect ratio (16:9, 21:9, etc.).
 */
export default function PageStage({ children, className = "" }) {
  return (
    <div className={`w-full min-h-0 flex-1 flex flex-col ${className}`}>
      {children}
    </div>
  );
}
