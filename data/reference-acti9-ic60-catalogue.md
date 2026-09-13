# Acti9 catalogue: iC60 and modular protection families

Source: Schneider Electric, [Acti 9 Catalog](https://www.se.com/be/en/download/document/Acti9_A9XPH212_CAT/), document Acti9_A9XPH212_CAT.

This is a reference digest of the manufacturer catalogue. It is not a SupplierFlow price list, stock record, quotation, or delivery promise. The original catalogue remains the authority for a product number, country approval, wiring diagram, and current technical revision.

Quick answer: the maximum breaking-capacity figure is not a universal value for every Acti9 product family; check the exact family, voltage and standard. The catalogue includes iC60N, C120N, iID/Vigi and iPRD families.

## What the catalogue covers

The Acti9 catalogue is a family catalogue rather than a single breaker datasheet. It includes iC60N, iC60H, iC60L, C120N and C120H circuit breakers, as well as residual-current devices such as iID and Vigi iC60. It also groups complementary equipment: iPRD surge protection, iTL impulse relays, iCT contactors, Smartlink communication and connection accessories.

That family view matters when answering a product question. A reference to “Acti9” does not identify one device. The assistant must preserve the family name, commercial reference, pole arrangement, curve, current rating and voltage before comparing two entries.

## Circuit-breaker selection fields

The catalogue presents the fields normally needed to select a miniature circuit breaker. `In` is the rated current. `Ue` is the rated operational voltage. `Ui` is the rated insulation voltage. `Uimp` is the rated impulse withstand voltage. `Icn` is the rated short-circuit capacity under the relevant IEC/EN 60898-1 conditions; for products assessed under IEC 60947-2, `Icu` and `Ics` are the relevant short-circuit fields.

These values are related but not interchangeable. A breaker with a 6 kA short-circuit capacity is not automatically a 10 kA breaker, and a 230 V operational-voltage entry is not a universal statement about every pole arrangement. The exact family table and installation system must be checked.

## Curves, ratings and poles

Acti9 MCB families use different tripping curves and current ranges. A B-curve device, a C-curve device and a D-curve device can have the same nominal current while responding differently to magnetic inrush. The curve is therefore part of the product identity, not a decorative label.

Pole count is another selection field. A one-pole device, a one-pole-plus-neutral device and a two-, three- or four-pole device do not create the same switching or isolation arrangement. “1P+N” also needs careful wording: one pole may be protected while the neutral pole is switched, depending on the family.

The catalogue contains product ranges from low-current modular protection through higher-current families. The published range includes ratings from about 0.5 A to 125 A across the catalogue, with breaking capacities that vary by family and voltage. Do not copy a range limit from one iC60 table into a C120 or accessory table.

## AC, DC and application conditions

Some Acti9 families are specified for AC networks, while others have DC ratings or DC-specific connection rules. A product card must be read with the voltage type, number of poles in series and the applicable breaking-capacity table. A breaker marked for AC should not be described as a DC device merely because its current rating looks suitable.

Ambient temperature, enclosure arrangement, conductor size and adjacent-device heating can affect the usable current. If a question asks whether a device “always” carries its printed current, the answer should point back to the manufacturer derating and installation conditions rather than inventing a universal correction factor.

## Coordination and cascading

The catalogue includes guidance on cascading, discrimination and coordination with loads. These are system-level properties. A downstream breaker and an upstream breaker cannot be declared selective from current ratings alone; the manufacturer tables, prospective fault current and protective-device pairing matter.

Cascading can allow a downstream device to benefit from the current-limiting behaviour of an upstream device, but that is a tested combination, not a general promise. Discrimination is about which protective device operates first. The two ideas should not be collapsed into one generic claim of “better protection”.

## Accessories and installation

The Acti9 system includes auxiliary contacts, remote-control or indication accessories, add-on residual-current protection, comb busbars and communication equipment. An accessory reference should be kept separate from the main protective device reference. If the user asks for an auxiliary contact, the answer must not substitute the breaker SKU.

The catalogue also provides wiring diagrams, dimensional information and selection tables. Those details are important for a real installation, especially where a neutral is switched, where a Vigi module is attached, or where an accessory changes the device width.

## Safe answering rule

For an exact SKU question, retrieve the product card or the exact catalogue table first. For a family question, the family overview is enough to explain the available ranges, but it is not enough to assert every electrical value. State the exact reference, use the matching table, and abstain when the requested field is absent.
