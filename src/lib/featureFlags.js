/** Temporary Coming Soon gates — flip to restore hangar / void without hunting call sites. */
export const FEATURE_FLAGS = {
  shipHangarEnabled: false,
  voidEnabled: false,
};

export function isFeatureEnabled(featureId) {
  if (featureId === "ship_hangar") return FEATURE_FLAGS.shipHangarEnabled === true;
  if (featureId === "void") return FEATURE_FLAGS.voidEnabled === true;
  return true;
}

export function isShipHangarEnabled() {
  return isFeatureEnabled("ship_hangar");
}
