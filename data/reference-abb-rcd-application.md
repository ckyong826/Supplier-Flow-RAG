# ABB RCD application and protection reference

Source: ABB, [RCD Technical Guide](https://library.e.abb.com/public/9f0e99de3bc740288bc41ab95667f72f/RCD%20Technical%20Guide%20EN.pdf).

This reference digest explains the division between residual-current protection and overcurrent protection. It is not a SupplierFlow quotation or installation approval. Use the exact ABB device instruction and local electrical rules for field work.

## RCCB is not an overcurrent breaker

An RCCB detects residual or leakage current by comparing the current flowing in the conductors that pass through its sensing core. It is designed to disconnect when the residual-current condition reaches its specified operating threshold. It does not by itself provide protection against ordinary overload or short circuit.

The ABB guide states that an RCCB must be protected against overcurrent by a suitable MCB or fuse. This is the central boundary: an RCCB and an MCB have complementary jobs. A customer asking whether an RCCB alone protects a cable from overload must be told no unless the exact product has a separately documented overcurrent function.

## RCBO combines functions

An RCBO combines residual-current protection with overcurrent protection in one device. That does not mean all RCBOs are interchangeable. Rated current, curve, residual-current type, sensitivity, poles, voltage, breaking capacity and standard still need to match.

When comparing an RCCB plus MCB assembly with an RCBO, explain the functions separately. The assembly may have different wiring, space, selectivity and accessory requirements. A product family name alone is not enough evidence for a direct substitute.

## Residual-current types

The guide’s application logic requires choosing a device compatible with the residual-current waveform expected from the load. Type AC, Type A, Type F and Type B are not just marketing names. They identify different detection capabilities and application boundaries.

A Type A device should not be called Type AC simply because both can respond to AC residual current. A broader type may include the lower waveform capability, but substitution still depends on the installation, standard and manufacturer instructions. The assistant should preserve the exact type in a product answer.

## Rated residual current

`IΔn` is the rated residual operating current. A 30 mA value is not the same field as the breaker’s rated load current in amperes. It is also not a statement that the device will trip at exactly 30 mA in every test; operating conditions and standards define the performance window.

Higher sensitivities such as 100 mA or 300 mA may be used for different protection or coordination purposes. Selection must consider electric-shock protection, fire-risk protection, nuisance tripping and upstream/downstream coordination. Do not recommend a sensitivity from the customer’s current rating alone.

## Test and maintenance

The test button checks the residual-current trip circuit under the conditions described by the manufacturer. It is not a substitute for a complete installation test. Correct supply direction, neutral routing, terminal connections and periodic testing matter.

If the test button trips the device, that demonstrates a test path, not that every fault condition is protected. If it does not trip, the circuit should be isolated and investigated; the assistant should not suggest bypassing the RCD.

## Coordination

For upstream and downstream RCDs, equal IΔn and no time delay do not guarantee selectivity. A coordinated design normally uses a larger upstream residual-current setting and/or intentional time delay, subject to the manufacturer table. The exact ratio is a design rule, not a universal product property.

## Safe answer pattern

For “RCCB or RCBO?” explain the protection-function difference first. For “what rating?” separate rated current, sensitivity, type, poles and breaking protection. For an exact SKU, retrieve the product card. If the source lacks an installation or coordination value, abstain rather than fill it from a neighbouring family.

