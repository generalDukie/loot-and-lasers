# Production No-Magic-Number Policy

Gameplay/domain-significant numeric values must have named authoritative definitions. Raw numeric literals are permitted only for non-domain implementation mechanics where naming would reduce rather than improve clarity.

## Authority

- One named definition per gameplay value, owned by its domain (`src/lib/productionMath/` for progression/formula/combat-stat primitives; class passives in `src/lib/classPassives.js`; Gear generation counts in `src/lib/itemGeneration.js`; etc.).
- Do not create one giant global constants file.
- Do not duplicate the same named constant across domains. Compatibility aliases must point at the canonical name and be marked deprecated.
- Names describe the mechanic, not the number. Unrelated uses of the same numeric value stay as separate constants.

## Future phases (Phase 4 onward)

Every future phase must:

1. define gameplay values as named constants/configuration in the owning domain;
2. avoid raw domain-significant numeric literals;
3. reuse existing canonical constants;
4. add new constants only to the owning domain;
5. include a magic-number audit in the phase completion gate (`npm run audit:no-magic-numbers`).

Phase 4 onward should never knowingly introduce new magic gameplay numbers.

## Enforcement

`scripts/audit-no-magic-numbers.mjs` scans selected live gameplay JS. It is not a generic ESLint `no-magic-numbers` rule (too noisy for indexes, counters, and test fixtures). Tests may keep expected numeric literals so they are not tautological.

Godot may mirror named presentation constants only. Server/shared `src/lib/` remains gameplay authority.
