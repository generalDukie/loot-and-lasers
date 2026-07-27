// Central game-clock helper. All daily resets (daily login, arena attempts,
// dungeon deaths) roll over at midnight Eastern Time, which automatically
// observes US daylight saving (EST ↔ EDT) via the America/New_York zone.
// Client and server share this exact logic so they always agree on "today".
export function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}