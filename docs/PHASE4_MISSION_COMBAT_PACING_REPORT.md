# PHASE 4 — MISSION COMBAT PACING NORMALIZATION REPORT

Diagnostic only. Production gameplay values were not changed.
Certified Mission enemy outgoing was enabled through the diagnostic hook only.

## 1. Executive result

- Baseline HP ×1.00: N=32400, win 100.0%, mean turns 2.79, mean victory HP 95.6%, mean enemy attacks landed 0.91.
- Native-damage HP ×2.50: N=32400, win 100.0%, mean turns 6.31, mean victory HP 87.7%.
- Frozen Test 18: N=32400, win 100.0%, mean turns 6.34, mean victory HP 87.5%.
- Native/historical player Base Damage (sampled): 2.500000 (algebraic 2.500000).
- Closest pooled match among win-safe candidates: **HP ×3.25**. **No production change.**

## 2. Exact fixture source

- Artifact: `server/fixtures/test18/checkpoint_character_states.csv`
- Method: direct load of retained Test 18 checkpoint rows (not a synthetic rebuild)
- Population: 6 classes × F2P / Light / Premium × original retained seeds
- Checkpoints: L10, L25, L50, L75, L100, L150, L200
- L1: reconstructed from production/Test 18 starting attributes. No L20.
- Rows loaded: 5040
- F2P / Light / Premium are simulation fixture profiles, not production account classes.

## 3. Baseline confirmation

HP ×1.00 + certified outgoing ON (diagnostic hook). Prior blocker audit pooled production-ON: ~2.79 turns / ~95.6% winner HP / 100% wins.
This run: mean turns **2.79**, median **3.00**, mean victory HP **95.6%**, win rate **100.0%**, N=32400.
Identity gate (×1.00 vs production simulateBattle): passed.
Outgoing checksum: passed.

| Level | expected | production | Test 18 | Δ vs expected |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.300000 | 0.300000 | 0.300000 | 0.000000000000 |
| 10 | 0.350000 | 0.350000 | 0.350000 | 0.000000000000 |
| 15 | 0.500000 | 0.500000 | 0.500000 | 0.000000000000 |
| 20 | 2.500000 | 2.500000 | 2.500000 | 0.000000000000 |
| 25 | 3.083333 | 3.083333 | 3.083333 | -0.000000000000 |
| 50 | 6.000000 | 6.000000 | 6.000000 | 0.000000000000 |
| 75 | 8.000000 | 8.000000 | 8.000000 | 0.000000000000 |
| 100 | 10.000000 | 10.000000 | 10.000000 | 0.000000000000 |
| 150 | 11.000000 | 11.000000 | 11.000000 | 0.000000000000 |
| 200 | 12.000000 | 12.000000 | 12.000000 | 0.000000000000 |

## 4. Candidate comparison

Common-random-number replay: same player, enemy attributes, fight seed, initiative/variance/crit/dodge/passive RNG. Only enemy starting/max HP changes.

| HP scale | battle N | win rate | mean turns | median turns | mean winner HP | P10 HP | P50 HP | P90 HP | enemy att. | enemy landed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| frozen T18 | 32400 | 100.0% | 6.34 | 6.00 | 87.5% | 77.1% | 88.6% | 96.8% | 2.71 | 2.53 |
| 1.00 | 32400 | 100.0% | 2.79 | 3.00 | 95.6% | 89.5% | 97.5% | 100.0% | 1.11 | 0.91 |
| 2.50 | 32400 | 100.0% | 6.31 | 6.00 | 87.7% | 77.3% | 88.7% | 97.2% | 2.86 | 2.48 |
| 2.75 | 32400 | 100.0% | 6.86 | 6.00 | 86.4% | 75.5% | 86.9% | 96.5% | 3.13 | 2.73 |
| 3.00 | 32400 | 100.0% | 7.41 | 6.00 | 85.2% | 73.8% | 85.4% | 96.0% | 3.41 | 2.99 |
| 3.25 | 32400 | 100.0% | 7.99 | 7.00 | 83.8% | 72.1% | 84.1% | 95.4% | 3.70 | 3.25 |

| HP scale | P10/P50/P90 turns | player att./landed | avg landed pDmg | avg landed eDmg | crit | dodge | notes |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| frozen T18 | 3.0/6.0/10.0 | 3.46/3.36 | 878.3 | 1364.2 | 12.7% | 4.5% | historical engine |
| 1.00 | 1.0/3.0/4.0 | 1.66/1.60 | 2156.9 | 708.4 | 17.6% | 3.6% | win-safety |
| 2.50 | 3.0/6.0/10.0 | 3.44/3.33 | 2200.4 | 1375.0 | 14.8% | 4.8% | win-safety, turn-band |
| 2.75 | 4.0/6.0/10.0 | 3.72/3.59 | 2202.4 | 1410.2 | 14.4% | 4.9% | win-safety, turn-band |
| 3.00 | 5.0/6.0/11.0 | 4.00/3.86 | 2201.0 | 1434.7 | 14.0% | 5.0% | win-safety, turn-band |
| 3.25 | 5.0/7.0/12.0 | 4.28/4.14 | 2201.4 | 1453.1 | 13.8% | 5.0% | win-safety, winner-HP-band, turn-band |

## 5. Level breakdown

### HP ×1.00 (current_production_hp)

| Level | N | win | mean/median turns | P10/P90 turns | mean winner HP | P10/P90 HP | e att./landed | pDmg | eDmg |
| ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | 2160 | 100.0% | 3.48/3.00 | 3.0/4.0 | 98.3% | 96.6%/100.0% | 1.44/1.15 | 40.2 | 1.0 |
| 10 | 4320 | 100.0% | 4.74/5.00 | 3.0/7.0 | 98.1% | 96.0%/99.5% | 2.08/1.78 | 73.2 | 3.5 |
| 25 | 4320 | 100.0% | 3.33/3.00 | 2.0/4.0 | 95.1% | 90.6%/100.0% | 1.38/1.14 | 270.5 | 66.9 |
| 50 | 4320 | 100.0% | 2.78/3.00 | 1.0/4.0 | 94.5% | 87.6%/100.0% | 1.11/0.88 | 845.6 | 241.5 |
| 75 | 4320 | 100.0% | 2.46/2.00 | 1.0/4.0 | 94.5% | 86.4%/100.0% | 0.95/0.76 | 1545.4 | 491.1 |
| 100 | 4320 | 100.0% | 2.10/2.00 | 1.0/4.0 | 94.8% | 86.5%/100.0% | 0.77/0.61 | 2349.3 | 788.1 |
| 150 | 4320 | 100.0% | 1.87/2.00 | 1.0/3.0 | 95.5% | 89.1%/100.0% | 0.67/0.53 | 4259.2 | 1393.6 |
| 200 | 4320 | 100.0% | 1.86/2.00 | 1.0/3.0 | 95.5% | 89.0%/100.0% | 0.66/0.52 | 6813.4 | 2327.8 |

### HP ×2.50 (native_damage_normalization)

| Level | N | win | mean/median turns | P10/P90 turns | mean winner HP | P10/P90 HP | e att./landed | pDmg | eDmg |
| ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | 2160 | 100.0% | 8.05/8.00 | 7.0/10.0 | 95.1% | 92.3%/97.4% | 3.72/3.24 | 41.0 | 1.3 |
| 10 | 4320 | 100.0% | 11.08/10.00 | 8.0/15.0 | 95.2% | 90.2%/98.2% | 5.24/4.70 | 74.9 | 3.8 |
| 25 | 4320 | 100.0% | 7.03/7.00 | 5.0/9.0 | 87.9% | 81.9%/93.3% | 3.23/2.86 | 271.1 | 84.5 |
| 50 | 4320 | 100.0% | 5.74/6.00 | 4.0/8.0 | 86.4% | 76.8%/94.5% | 2.58/2.20 | 846.1 | 359.6 |
| 75 | 4320 | 100.0% | 5.20/5.00 | 3.0/6.0 | 85.9% | 77.2%/93.6% | 2.30/1.96 | 1559.9 | 807.4 |
| 100 | 4320 | 100.0% | 4.95/5.00 | 3.0/6.0 | 84.4% | 73.9%/92.9% | 2.17/1.85 | 2390.2 | 1464.6 |
| 150 | 4320 | 100.0% | 4.70/5.00 | 3.0/6.0 | 85.2% | 74.7%/93.0% | 2.06/1.75 | 4380.7 | 2819.7 |
| 200 | 4320 | 100.0% | 4.61/5.00 | 3.0/6.0 | 85.1% | 73.9%/93.2% | 2.02/1.70 | 6959.4 | 4772.5 |

### HP ×2.75 (native_plus_mild_survivability)

| Level | N | win | mean/median turns | P10/P90 turns | mean winner HP | P10/P90 HP | e att./landed | pDmg | eDmg |
| ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | 2160 | 100.0% | 8.68/9.00 | 7.0/10.0 | 94.7% | 92.0%/97.4% | 4.04/3.53 | 41.0 | 1.3 |
| 10 | 4320 | 100.0% | 12.09/12.00 | 9.0/16.0 | 94.8% | 89.3%/98.0% | 5.74/5.16 | 75.1 | 3.8 |
| 25 | 4320 | 100.0% | 7.64/8.00 | 6.0/10.0 | 86.7% | 80.3%/92.3% | 3.53/3.14 | 271.5 | 84.8 |
| 50 | 4320 | 100.0% | 6.24/6.00 | 5.0/8.0 | 85.0% | 75.4%/94.2% | 2.83/2.43 | 845.2 | 365.5 |
| 75 | 4320 | 100.0% | 5.62/6.00 | 4.0/7.0 | 84.5% | 75.8%/93.2% | 2.52/2.15 | 1558.9 | 822.3 |
| 100 | 4320 | 100.0% | 5.34/5.00 | 4.0/7.0 | 82.9% | 72.4%/92.4% | 2.37/2.03 | 2388.8 | 1502.1 |
| 150 | 4320 | 100.0% | 5.10/5.00 | 3.0/7.0 | 83.5% | 72.8%/92.5% | 2.26/1.94 | 4390.4 | 2884.2 |
| 200 | 4320 | 100.0% | 5.04/5.00 | 3.0/6.0 | 83.3% | 72.0%/92.4% | 2.23/1.90 | 6967.7 | 4912.8 |

### HP ×3.00 (native_plus_moderate_survivability)

| Level | N | win | mean/median turns | P10/P90 turns | mean winner HP | P10/P90 HP | e att./landed | pDmg | eDmg |
| ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | 2160 | 100.0% | 9.43/9.00 | 7.0/11.0 | 94.2% | 91.0%/96.6% | 4.41/3.87 | 41.1 | 1.3 |
| 10 | 4320 | 100.0% | 13.11/12.00 | 9.0/18.0 | 94.3% | 88.5%/97.7% | 6.25/5.62 | 75.3 | 3.9 |
| 25 | 4320 | 100.0% | 8.27/8.00 | 7.0/10.0 | 85.5% | 79.0%/91.7% | 3.85/3.43 | 272.0 | 84.9 |
| 50 | 4320 | 100.0% | 6.73/6.00 | 5.0/9.0 | 83.7% | 73.4%/93.7% | 3.08/2.65 | 845.7 | 367.6 |
| 75 | 4320 | 100.0% | 6.10/6.00 | 5.0/8.0 | 83.0% | 73.2%/92.9% | 2.75/2.37 | 1560.7 | 833.5 |
| 100 | 4320 | 100.0% | 5.78/6.00 | 4.0/8.0 | 81.3% | 70.8%/91.8% | 2.59/2.23 | 2386.9 | 1528.6 |
| 150 | 4320 | 100.0% | 5.49/5.00 | 4.0/7.0 | 82.0% | 71.4%/92.1% | 2.46/2.12 | 4383.3 | 2933.5 |
| 200 | 4320 | 100.0% | 5.41/5.00 | 4.0/7.0 | 81.8% | 70.7%/91.9% | 2.42/2.07 | 6962.9 | 5007.6 |

### HP ×3.25 (native_plus_strong_survivability)

| Level | N | win | mean/median turns | P10/P90 turns | mean winner HP | P10/P90 HP | e att./landed | pDmg | eDmg |
| ---: | ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | 2160 | 100.0% | 10.28/10.00 | 9.0/12.0 | 93.6% | 90.5%/96.4% | 4.83/4.25 | 41.4 | 1.3 |
| 10 | 4320 | 100.0% | 14.13/13.00 | 10.0/20.0 | 93.9% | 87.5%/97.5% | 6.76/6.07 | 75.6 | 3.9 |
| 25 | 4320 | 100.0% | 8.92/9.00 | 7.0/11.0 | 84.2% | 77.6%/91.1% | 4.17/3.74 | 272.3 | 85.0 |
| 50 | 4320 | 100.0% | 7.27/7.00 | 5.0/10.0 | 82.2% | 71.2%/92.3% | 3.35/2.90 | 847.3 | 369.4 |
| 75 | 4320 | 100.0% | 6.57/6.00 | 5.0/8.0 | 81.5% | 71.5%/92.5% | 2.99/2.58 | 1563.5 | 842.1 |
| 100 | 4320 | 100.0% | 6.21/6.00 | 5.0/8.0 | 79.6% | 68.4%/91.3% | 2.80/2.42 | 2389.3 | 1540.2 |
| 150 | 4320 | 100.0% | 5.89/6.00 | 4.0/8.0 | 80.5% | 69.7%/91.7% | 2.65/2.31 | 4379.8 | 2972.6 |
| 200 | 4320 | 100.0% | 5.82/6.00 | 4.0/8.0 | 80.2% | 68.9%/91.5% | 2.62/2.25 | 6962.1 | 5084.2 |

## 6. Class breakdown

### HP ×1.00

| Class | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Vanguard | 5400 | 100.0% | 2.80 | 94.7% | 88.4%/100.0% | 1.07 | 2240.5 | 860.1 |
| Astral Warden | 5400 | 100.0% | 2.87 | 94.9% | 88.1%/100.0% | 1.09 | 2120.0 | 853.2 |
| Shadow Operative | 5400 | 100.0% | 2.86 | 98.6% | 94.2%/100.0% | 0.37 | 2127.8 | 173.2 |
| Void Runner | 5400 | 100.0% | 2.51 | 96.5% | 90.3%/100.0% | 0.74 | 2147.6 | 561.5 |
| Technomancer | 5400 | 100.0% | 2.86 | 94.3% | 87.6%/100.0% | 1.11 | 2150.1 | 919.0 |
| Cosmic Engineer | 5400 | 100.0% | 2.81 | 94.7% | 88.4%/100.0% | 1.06 | 2155.3 | 883.5 |

### HP ×2.50

| Class | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Vanguard | 5400 | 100.0% | 6.40 | 85.9% | 75.8%/96.2% | 2.75 | 2257.6 | 1451.4 |
| Astral Warden | 5400 | 100.0% | 6.64 | 87.3% | 76.2%/97.7% | 2.84 | 2125.9 | 1382.1 |
| Shadow Operative | 5400 | 100.0% | 6.68 | 91.2% | 83.0%/100.0% | 1.91 | 2132.4 | 1182.8 |
| Void Runner | 5400 | 100.0% | 6.11 | 88.8% | 77.8%/98.1% | 2.27 | 2147.2 | 1266.9 |
| Technomancer | 5400 | 100.0% | 6.01 | 85.5% | 74.9%/95.6% | 2.58 | 2333.7 | 1538.2 |
| Cosmic Engineer | 5400 | 100.0% | 6.03 | 87.4% | 78.2%/96.4% | 2.56 | 2205.4 | 1428.9 |

### HP ×2.75

| Class | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Vanguard | 5400 | 100.0% | 6.96 | 84.6% | 74.2%/95.5% | 3.00 | 2255.4 | 1457.0 |
| Astral Warden | 5400 | 100.0% | 7.22 | 86.2% | 74.8%/97.5% | 3.11 | 2122.9 | 1390.3 |
| Shadow Operative | 5400 | 100.0% | 7.24 | 89.9% | 81.4%/97.6% | 2.17 | 2129.6 | 1296.5 |
| Void Runner | 5400 | 100.0% | 6.68 | 87.5% | 75.9%/97.1% | 2.52 | 2145.4 | 1337.2 |
| Technomancer | 5400 | 100.0% | 6.46 | 84.1% | 73.0%/95.2% | 2.79 | 2361.7 | 1552.4 |
| Cosmic Engineer | 5400 | 100.0% | 6.58 | 86.2% | 76.4%/96.2% | 2.82 | 2199.4 | 1427.6 |

### HP ×3.00

| Class | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Vanguard | 5400 | 100.0% | 7.51 | 83.3% | 72.3%/95.4% | 3.26 | 2253.0 | 1464.6 |
| Astral Warden | 5400 | 100.0% | 7.80 | 85.2% | 73.1%/97.1% | 3.38 | 2116.6 | 1399.6 |
| Shadow Operative | 5400 | 100.0% | 7.83 | 88.6% | 79.6%/96.7% | 2.43 | 2124.6 | 1369.2 |
| Void Runner | 5400 | 100.0% | 7.30 | 86.0% | 74.2%/96.2% | 2.79 | 2141.7 | 1385.0 |
| Technomancer | 5400 | 100.0% | 6.90 | 82.9% | 71.7%/94.9% | 2.99 | 2378.0 | 1563.8 |
| Cosmic Engineer | 5400 | 100.0% | 7.14 | 84.9% | 74.8%/95.3% | 3.08 | 2192.0 | 1426.0 |

### HP ×3.25

| Class | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Vanguard | 5400 | 100.0% | 8.12 | 81.9% | 70.4%/94.7% | 3.53 | 2252.4 | 1471.4 |
| Astral Warden | 5400 | 100.0% | 8.44 | 84.0% | 71.4%/96.7% | 3.68 | 2113.9 | 1402.2 |
| Shadow Operative | 5400 | 100.0% | 8.47 | 87.2% | 77.4%/96.0% | 2.71 | 2121.0 | 1416.6 |
| Void Runner | 5400 | 100.0% | 7.89 | 84.7% | 72.5%/95.7% | 3.05 | 2139.6 | 1422.3 |
| Technomancer | 5400 | 100.0% | 7.33 | 81.8% | 70.2%/94.0% | 3.19 | 2390.9 | 1574.1 |
| Cosmic Engineer | 5400 | 100.0% | 7.71 | 83.6% | 72.9%/95.2% | 3.35 | 2190.6 | 1431.8 |

## 7. Profile breakdown

### HP ×1.00

| Profile | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| F2P | 10800 | 100.0% | 3.15 | 94.5% | 86.6%/100.0% | 1.06 | 2025.4 | 782.2 |
| Light | 10800 | 100.0% | 2.71 | 95.9% | 89.8%/100.0% | 0.87 | 2170.5 | 697.3 |
| Premium | 10800 | 100.0% | 2.49 | 96.5% | 91.1%/100.0% | 0.79 | 2274.8 | 645.8 |

### HP ×2.50

| Profile | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| F2P | 10800 | 100.0% | 7.01 | 85.4% | 74.3%/94.6% | 2.80 | 2050.0 | 1385.1 |
| Light | 10800 | 100.0% | 6.12 | 88.3% | 78.3%/97.4% | 2.39 | 2212.3 | 1371.9 |
| Premium | 10800 | 100.0% | 5.80 | 89.4% | 80.1%/97.7% | 2.26 | 2338.8 | 1368.1 |

### HP ×2.75

| Profile | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| F2P | 10800 | 100.0% | 7.61 | 83.9% | 72.3%/93.8% | 3.07 | 2047.8 | 1407.5 |
| Light | 10800 | 100.0% | 6.65 | 87.0% | 76.1%/96.8% | 2.63 | 2214.9 | 1411.0 |
| Premium | 10800 | 100.0% | 6.31 | 88.3% | 78.2%/97.2% | 2.50 | 2344.6 | 1412.0 |

### HP ×3.00

| Profile | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| F2P | 10800 | 100.0% | 8.25 | 82.4% | 70.4%/92.9% | 3.36 | 2046.4 | 1429.2 |
| Light | 10800 | 100.0% | 7.19 | 85.8% | 74.4%/96.4% | 2.88 | 2212.9 | 1435.3 |
| Premium | 10800 | 100.0% | 6.80 | 87.2% | 77.0%/96.8% | 2.72 | 2343.6 | 1439.6 |

### HP ×3.25

| Profile | N | win | mean turns | mean winner HP | P10/P90 HP | e landed | pDmg | eDmg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| F2P | 10800 | 100.0% | 8.90 | 80.9% | 68.2%/92.3% | 3.65 | 2049.3 | 1442.2 |
| Light | 10800 | 100.0% | 7.76 | 84.5% | 72.9%/95.9% | 3.14 | 2211.5 | 1454.4 |
| Premium | 10800 | 100.0% | 7.32 | 86.1% | 75.7%/96.3% | 2.96 | 2343.4 | 1462.5 |

## 8. Outlier cells

Per candidate, worst/best cells among level × class × profile.

### HP ×1.00

- Minimum win-rate cell: L1 Vanguard F2P — 100.0% (N=120)
- Lowest mean winner HP: L50 Technomancer F2P — 90.0%, 3.46 turns
- Highest mean winner HP: L200 Shadow Operative Premium — 99.7%, 1.69 turns
- Shortest mean-turn cell: L200 Void Runner Premium — 1.43 turns, HP 97.1%
- Longest mean-turn cell: L10 Shadow Operative F2P — 6.41 turns, HP 97.5%

### HP ×2.50

- Minimum win-rate cell: L1 Vanguard F2P — 100.0% (N=120)
- Lowest mean winner HP: L100 Vanguard F2P — 78.9%, 5.54 turns
- Highest mean winner HP: L10 Shadow Operative Premium — 97.7%, 9.69 turns
- Shortest mean-turn cell: L200 Void Runner Premium — 3.95 turns, HP 88.8%
- Longest mean-turn cell: L10 Shadow Operative F2P — 15.18 turns, HP 91.8%

### HP ×2.75

- Minimum win-rate cell: L1 Vanguard F2P — 100.0% (N=120)
- Lowest mean winner HP: L100 Technomancer F2P — 77.5%, 5.32 turns
- Highest mean winner HP: L10 Shadow Operative Premium — 97.4%, 10.60 turns
- Shortest mean-turn cell: L200 Cosmic Engineer Premium — 4.30 turns, HP 85.1%
- Longest mean-turn cell: L10 Shadow Operative F2P — 16.66 turns, HP 90.9%

### HP ×3.00

- Minimum win-rate cell: L1 Vanguard F2P — 100.0% (N=120)
- Lowest mean winner HP: L100 Vanguard F2P — 75.0%, 6.51 turns
- Highest mean winner HP: L10 Astral Warden Premium — 97.2%, 11.47 turns
- Shortest mean-turn cell: L200 Cosmic Engineer Premium — 4.64 turns, HP 83.9%
- Longest mean-turn cell: L10 Shadow Operative F2P — 18.16 turns, HP 90.1%

### HP ×3.25

- Minimum win-rate cell: L1 Vanguard F2P — 100.0% (N=120)
- Lowest mean winner HP: L100 Vanguard F2P — 72.8%, 7.00 turns
- Highest mean winner HP: L10 Astral Warden Premium — 97.0%, 12.27 turns
- Shortest mean-turn cell: L200 Cosmic Engineer Premium — 5.00 turns, HP 82.6%
- Longest mean-turn cell: L10 Shadow Operative F2P — 19.56 turns, HP 89.5%

## 9. ×2.50 mathematical parity

Relative HP removed per landed player attack = mean(average landed player damage / Mission enemy max HP).
If ×2.50 restores historical relative pacing, production×2.50 should approach frozen Test 18.

Native/historical Base Damage ratio (flat): **2.500000**.
Native/historical primary coefficient ratio: **2.500000**.
Enemy fingerprint mismatches across HP candidates: **0** (must be 0).

| Level | frozen frac | prod ×1.00 frac | prod ×2.50 frac | ×2.50 / frozen | ×1.00 / frozen |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.2653 | 0.6697 | 0.2733 | 1.030 | 2.524 |
| 10 | 0.1996 | 0.4982 | 0.2036 | 1.020 | 2.496 |
| 25 | 0.3183 | 0.8051 | 0.3227 | 1.014 | 2.529 |
| 50 | 0.4079 | 1.0249 | 0.4103 | 1.006 | 2.513 |
| 75 | 0.4535 | 1.1166 | 0.4508 | 0.994 | 2.462 |
| 100 | 0.4777 | 1.1776 | 0.4792 | 1.003 | 2.465 |
| 150 | 0.5083 | 1.2388 | 0.5097 | 1.003 | 2.437 |
| 200 | 0.5148 | 1.2627 | 0.5159 | 1.002 | 2.453 |
| pooled | 0.4017 | 0.9945 | 0.4039 | 1.005 | 2.476 |

Mean unscaled production enemy max HP: 1806.8.
Mean scaled ×2.50 enemy max HP: 4517.1 (ratio 2.5000).
Frozen mean enemy max HP: 1806.8.

Player displayed/native Damage was not reduced. No MissionPlayerDamageMultiplier exists in this diagnostic.

## 10. Recommendation

Guidelines (not hard gates): ~99%+ wins; typical victory HP ~80–85%; routine turns ~6–10; no severe class/profile hole.

| candidate | win | min cell win | mean turns (Δ to 6–10) | mean HP (Δ to 80–85%) | guideline hits |
| --- | ---: | ---: | --- | --- | --- |
| ×1.00 | 100.0% | 100.0% | 2.79 (Δ 3.21) | 95.6% (Δ 0.106) | win-safety |
| ×2.50 | 100.0% | 100.0% | 6.31 (Δ 0.00) | 87.7% (Δ 0.027) | win-safety, turn-band |
| ×2.75 | 100.0% | 100.0% | 6.86 (Δ 0.00) | 86.4% (Δ 0.014) | win-safety, turn-band |
| ×3.00 | 100.0% | 100.0% | 7.41 (Δ 0.00) | 85.2% (Δ 0.002) | win-safety, turn-band |
| ×3.25 | 100.0% | 100.0% | 7.99 (Δ 0.00) | 83.8% (Δ 0.000) | win-safety, winner-HP-band, turn-band |

Closest pooled match among win-safe candidates: **HP ×3.25** (`native_plus_strong_survivability`).
This is a diagnostic recommendation only. **Do not implement it in this change.**
If later approved, name it in production as something like `MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION`, never a meaningless numeric alias.

## 11. Production-state confirmation

- Flag at start: `false`
- Flag at end: `false`
- Live Mission outgoing remains **OFF** (`APPLY_CERTIFIED_MISSION_ENEMY_OUTGOING_IN_LIVE_COMBAT === false`).
- No Mission HP multiplier committed to production.
- No player damage change.
- No enemy attribute / EPA / Base Damage / Crit / Dodge / resistance change.
- Phase 5 not started.
- Diagnostic wrapper identity vs simulateBattle at ×1.00: passed.
- Enemy non-HP fingerprint stable across candidates: passed.

## Post-decision (production)

Human approved **HP ×3.00** as `MISSION_ENEMY_HP_NATIVE_DAMAGE_NORMALIZATION` (2.50) × `MISSION_ENEMY_HP_PACING_MULTIPLIER` (1.20). Certified outgoing is live ON. Official production activation: `docs/PHASE4_FINAL_MISSION_COMBAT_ACTIVATION_REPORT.md`.

## 12. Regression results

See following agent command output. Expected green because production behavior is unchanged.

## 13. Files changed

- `server/scripts/audit-mission-combat-pacing.mjs` (diagnostic runner)
- `docs/PHASE4_MISSION_COMBAT_PACING_REPORT.md` (this report)
- `docs/PHASE4_MISSION_COMBAT_PACING_RESULTS.json` (machine tables)

PHASE 4 MISSION PACING AUDIT COMPLETE — HUMAN HP NORMALIZATION DECISION REQUIRED
