# Eaton xPole PLN6 miniature-circuit-breaker catalogue reference

Source: Eaton, [PLN6 MCB product data and xPole protective-devices catalogue](https://www.eaton.com/gb/en-gb/skuPage.263163.html).

This reference digest summarizes Eaton’s public PLN6 data. It is technical reference material, not a SupplierFlow commercial promise. The exact SKU and local catalogue remain authoritative.

Quick answer for model 263163: 1P+N means one protected pole and two total poles, with the additional pole used for neutral switching in the cited row.

## Product family

PLN6 is an Eaton xPole miniature circuit-breaker family for residential and commercial switchgear. Product rows distinguish number of poles, release or tripping characteristic, rated current, operational voltage and short-circuit capacity. A PLN6 family name alone does not identify a complete breaker.

One public product row describes catalog number 263163, model PLN6-B13/1N-MW. It is a single-pole-plus-neutral form with one protected pole and two total poles. The “+N” suffix must not be converted into “two protected poles”.

## Electrical data

The cited PLN6 row lists B tripping characteristic, 13 A rated current, maximum operational voltage of 230 V, 6 kA short-circuit breaking capacity at 230 V and 400 V under IEC/EN 60898-1, 4 kV rated impulse withstand voltage and 440 V rated insulation voltage.

These values answer different questions. The 13 A value is a normal-current selection field. The B curve describes magnetic tripping behaviour. The 6 kA value concerns fault interruption. The 4 kV and 440 V fields concern insulation and impulse withstand. None of them substitutes for another.

## Frequency and voltage type

The product row lists a frequency range of 50 to 60 Hz and voltage type AC. That is evidence for the cited row, not a universal PLN6 statement for every variant. A customer asking about DC must be directed to a product row or catalogue table that explicitly covers DC.

Operational voltage and insulation voltage are also different. `Ue` is the working voltage used in the application; `Ui` is the insulation rating. A 440 V insulation value does not mean the breaker is a 440 V operational-voltage device.

## Physical and conductor data

The cited product is one modular width, has an IP20 degree of protection and accepts conductor cross-sections from 1 mm² to 16 mm² in the listed multi-wired and solid-core conditions. Built-in depth and width are installation dimensions, not evidence of electrical performance.

Mechanical fit does not prove electrical compatibility. Terminal capacity, busbar arrangement, enclosure, torque and adjacent-device heating still need checking. The assistant should not promise that any 16 mm² conductor is suitable for every application.

## Current limiting and selectivity

The PLN6 data identifies current-limiting class 3 for the cited product. The catalogue also provides short-circuit selectivity information for MCBs used with upstream fuses up to specified limit currents. Selectivity is conditional on the exact pairing and fault-current range.

“Class 3” is not the same as “3 kA”, and a 6 kA breaking capacity is not a selectivity guarantee. Those terms describe different properties. If a customer asks for discrimination, retrieve the coordination table rather than quoting the headline kA value.

## Ambient conditions

The public row lists an operating-temperature range from -25 °C to 75 °C for the relevant design-verification data. It also notes an ambient-temperature hint: starting at 55 °C, a 1 °C increase results in a 0.5% linear reduction of current-carrying capacity. Treat this as the cited product’s published condition, not a universal rule for every MCB.

## Safe answer pattern

For a PLN6 SKU, report only the fields attached to that SKU. Explain one-pole-plus-neutral as one protected pole plus a neutral switching pole when supported by the row. Keep curve, current, breaking capacity, voltage and temperature as separate fields, and abstain for an absent field.
