// Active playable character id — kept in sync by useMyCharacter so toast()
// can also persist feedback into the notification bell.
let _characterId = null;

export function setActiveCharacterId(id) {
  _characterId = id || null;
}

export function getActiveCharacterId() {
  return _characterId;
}
