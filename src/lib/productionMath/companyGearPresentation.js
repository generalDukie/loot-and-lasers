/**
 * Company Gear presentation overlay — 48 catalog names from the equipment pack.
 *
 * Keys MUST be visual ids (`helmet_cnc_01`). `name` is the player-facing title
 * (no company prefix). `combatStyle` is weapons only: swing | stab | shoot.
 *
 * Mirror the same 48 names in `loot&lasers/Scripts/CompanyRules.gd`.
 */
import {
  WEAPON_COMBAT_STYLE_SHOOT,
  WEAPON_COMBAT_STYLE_SWING,
} from "./constants.js";

export const COMPANY_GEAR_PRESENTATION = Object.freeze({
  helmet_cnc_01: Object.freeze({ name: "Grand Carapace" }),
  helmet_cnc_02: Object.freeze({ name: "Sovereign Death-Mask" }),
  helmet_cnc_03: Object.freeze({ name: "Scarab Oracle" }),
  armor_cnc_01: Object.freeze({ name: "Imperial Elytra" }),
  armor_cnc_02: Object.freeze({ name: "Regent Thorn-Mantle" }),
  armor_cnc_03: Object.freeze({ name: "Scarab Reliquary Harness" }),
  legs_cnc_01: Object.freeze({ name: "Duelist Greaves" }),
  legs_cnc_02: Object.freeze({ name: "Royal Shellguards" }),
  legs_cnc_03: Object.freeze({ name: "Court Striders" }),
  ship_module_cnc_01: Object.freeze({ name: "Royal Aegis" }),
  ship_module_cnc_02: Object.freeze({ name: "Throne Drive" }),
  ship_module_cnc_03: Object.freeze({ name: "Oracle Array" }),
  helmet_bjs_01: Object.freeze({ name: "Service Visor" }),
  helmet_bjs_02: Object.freeze({ name: "Counter Ballistic Shield" }),
  helmet_bjs_03: Object.freeze({ name: "Dual-Optic Field Rig" }),
  weapon_bjs_01: Object.freeze({ name: "Service Carbine", combatStyle: WEAPON_COMBAT_STYLE_SHOOT }),
  weapon_bjs_02: Object.freeze({ name: "Breach Marshal", combatStyle: WEAPON_COMBAT_STYLE_SHOOT }),
  weapon_bjs_03: Object.freeze({ name: "Field Breacher", combatStyle: WEAPON_COMBAT_STYLE_SWING }),
  neck_bjs_01: Object.freeze({ name: "Service Tags" }),
  neck_bjs_02: Object.freeze({ name: "Field Gorget" }),
  neck_bjs_03: Object.freeze({ name: "Signal Pendant" }),
  accessory_bjs_01: Object.freeze({ name: "Service Signet" }),
  accessory_bjs_02: Object.freeze({ name: "Field Scanner" }),
  accessory_bjs_03: Object.freeze({ name: "Utility Bracer" }),
  legs_dtd_01: Object.freeze({ name: "Patchwork Worklegs" }),
  legs_dtd_02: Object.freeze({ name: "Scrapwalker Braces" }),
  legs_dtd_03: Object.freeze({ name: "Emergency Overpants" }),
  boots_dtd_01: Object.freeze({ name: "Quickfix Stompers" }),
  boots_dtd_02: Object.freeze({ name: "Springheel Scramblers" }),
  boots_dtd_03: Object.freeze({ name: "Scrapyard Clompers" }),
  accessory_dtd_01: Object.freeze({ name: "Panic Kit" }),
  accessory_dtd_02: Object.freeze({ name: "Lucky Fuse" }),
  accessory_dtd_03: Object.freeze({ name: "Scrapclaw Rig" }),
  ship_module_dtd_01: Object.freeze({ name: "Patchwork Reactor" }),
  ship_module_dtd_02: Object.freeze({ name: "Panic Thruster" }),
  ship_module_dtd_03: Object.freeze({ name: "Scrap Relay" }),
  armor_gorp_01: Object.freeze({ name: "Compliance Vest" }),
  armor_gorp_02: Object.freeze({ name: "Supervisor Yoke" }),
  armor_gorp_03: Object.freeze({ name: "Containment Harness" }),
  boots_gorp_01: Object.freeze({ name: "Compliance Treads" }),
  boots_gorp_02: Object.freeze({ name: "Supervisor Locksteps" }),
  boots_gorp_03: Object.freeze({ name: "Facility Anchors" }),
  weapon_gorp_01: Object.freeze({ name: "Compliance Projector", combatStyle: WEAPON_COMBAT_STYLE_SHOOT }),
  weapon_gorp_02: Object.freeze({ name: "Supervisor's Directive", combatStyle: WEAPON_COMBAT_STYLE_SHOOT }),
  weapon_gorp_03: Object.freeze({ name: "Contract Enforcer", combatStyle: WEAPON_COMBAT_STYLE_SWING }),
  neck_gorp_01: Object.freeze({ name: "Compliance Collar" }),
  neck_gorp_02: Object.freeze({ name: "Supervisor's Seal" }),
  neck_gorp_03: Object.freeze({ name: "Vitality Monitor" }),
});
