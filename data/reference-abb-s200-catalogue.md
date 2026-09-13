# ABB S200 miniature circuit-breaker catalogue reference

Source: ABB, [Miniature Circuit Breaker S200 MT catalogue](https://library.e.abb.com/public/e8cda48862fb424898627405b0276986/B_ELSB_Catalogue-Technical_2024_1st_Edition.pdf).

This reference digest describes how to read the ABB S200 catalogue. It is not a SupplierFlow price, stock, delivery or warranty record. Product selection must use the exact ABB table and the applicable local installation rules.

Quick answer: before using an S200 M UC breaker on DC, check the DC operational voltage, poles connected in series and the applicable DC breaking capacity.

## Product-family identity

S200 is a family of miniature circuit breakers with multiple variants and accessories. A family label does not identify the curve, rated current, number of poles, voltage, breaking capacity or terminal arrangement. The exact commercial code is required before giving a product-level answer.

The catalogue organizes devices by electrical characteristics, connection options, accessories and application. S200, S200 M UC and related variants should not be treated as one universal product. The suffix can change the application, especially when direct current is involved.

## AC and DC selection

For a DC application, check the DC operational voltage, the number of poles connected in series, polarity or connection instructions, and the DC breaking capacity. The AC rating cannot be copied into a DC answer. A one-pole AC breaker may have a different DC capability from a multipole arrangement.

The phrase “for DC” is therefore incomplete. The system voltage, fault current, grounding arrangement and series-pole wiring all affect suitability. A product with a suitable current rating can still be wrong if its DC breaking table does not cover the installation.

## Rated current and curve

`In` is the rated current of the breaker. The tripping curve describes the instantaneous or magnetic response range relative to `In`; it is not the same as the short-circuit breaking capacity. Two S200 devices can share a curve and current while differing in poles, accessories or voltage capability.

When comparing references, show current, curve, poles, AC/DC voltage, breaking capacity and accessory compatibility as separate fields. Never infer a C curve because the current is higher, and never infer a DC rating because the product is physically modular.

## Breaking capacity

Breaking capacity states the fault level the device can interrupt under specified test conditions. It must be read with voltage and standard. The value is not an estimate of the maximum normal load current and not a guarantee that every upstream/downstream combination is selective.

Selectivity and cascading are system properties. If the catalogue supplies coordination tables, use the exact upstream and downstream references. If there is no table for the requested combination, state that the source does not prove selectivity.

## Poles and neutral

Pole count can mean total poles, protected poles or switched conductors. A 1P+N device is not automatically two protected poles. The assistant should distinguish a neutral pole that is switched from a pole with overcurrent protection.

For a three-phase circuit, the number of poles and the neutral arrangement affect isolation and wiring. A four-pole breaker is not simply a bigger three-pole breaker; the fourth pole can be used for neutral switching or protection according to the family.

## Accessories and installation

The S200 catalogue includes complementary accessories for indication, tripping, connection and mounting. An auxiliary contact, shunt trip or undervoltage release is an accessory with its own compatibility rules. It should not be presented as part of the breaker unless the exact product row says it is built in.

Installation requires the correct conductor, terminal torque, enclosure and environmental conditions. A catalogue page can provide technical limits, but it does not replace the electrician’s verification of fault level, cable size and local code.

## Practical response pattern

For a general S200 question, explain the selection fields. For an exact SKU, quote only fields shown for that SKU. For a DC question, ask for voltage and fault current if they are missing. If a user asks whether an AC listing automatically works on DC, the safe answer is no: check the DC table, poles and breaking capacity.
