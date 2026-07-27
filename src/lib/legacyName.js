// Returns the full display name for a character: first name + legacy surname.
// Falls back to just the first name when no legacy name is set (e.g. legacy data).
export function fullName(character) {
  if (!character) return "";
  const first = character.name || "";
  const last = character.legacy_name || "";
  return last ? `${first} ${last}` : first;
}