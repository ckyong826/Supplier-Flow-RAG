# ABB F200 Type B residual-current device reference

Source: ABB, [F200 Type B technical questions and application reference](https://library.e.abb.com/public/4517d7a86d1243868eeae65ac117f03a/2CSC423015B0202%20F200_B_Type_EN.pdf).

This reference digest covers application details for ABB F200 Type B residual-current devices. It is technical reference material, not a SupplierFlow commercial record. The original ABB wiring diagram and product instruction control an actual installation.

## Type B context

Type B residual-current devices are used where the installation can produce residual currents beyond the simple AC waveform handled by Type AC devices. The exact detection capability belongs to the specific product and standard. A Type B label should not be reduced to “a stronger Type A” without checking the source.

Selection depends on the load, residual-current waveform, voltage, poles, rated residual current and installation arrangement. Drives, converters and other power-electronic loads can change the residual-current waveform. The device type must match that application.

## Four-pole test-button arrangement

ABB’s reference explains that the test-button circuit of a four-pole F200 Type B device is wired between terminal pair 5/6 and terminal pair 7/8/N as shown in the diagram. The test circuit is designed for operation between 110 V and 254 V in the described arrangement.

That detail matters when a four-pole device is used in a three-phase network without a neutral. The phases may be connected in specified ways so the test circuit receives the required voltage. The installation cannot be judged from the pole count alone.

## Three-phase network without neutral

The reference describes possible arrangements for a three-phase circuit with no neutral. One arrangement uses the phase terminals and a bridge or connection so the test circuit sees a voltage between 110 V and 254 V. Another arrangement is used when the concatenated voltage is higher than 254 V and requires the specified resistor connection.

The point is not to memorize a generic bridge. The exact terminal numbers, supply direction and test resistor must follow the ABB diagram. A device fed from the bottom can also have a different insulation-test procedure from one fed from upstream terminals.

## Test resistor examples

The reference table gives example test resistances for the described no-neutral arrangements. For 30 mA, the table shows 3300 ohms. For 100 mA, it shows 1000 ohms. For 300 mA, it shows 330 ohms. For 500 mA, it shows 200 ohms. The test resistance must have power loss higher than 4 W.

These values are installation-test details, not product prices or residual-current ratings to be guessed for a different device. The assistant should keep `IΔn` and the external test-resistor value separate.

## Insulation testing

ABB’s reference says that an insulation test can be performed without disconnecting the neutral in the described conditions, but the toggle should be set to OFF and the relevant terminals unplugged to protect the electronic board. The procedure depends on whether the device is supplied from upstream or bottom terminals.

This is a strong example of why installation questions need source tracing. “Can I insulation-test an RCCB?” has no safe one-line universal answer. The supply direction, terminal pair and device type must be identified first.

## Answering rule

For a Type B question, identify the residual-current waveform and exact device. For a no-neutral question, retrieve the ABB wiring diagram and do not promise that the test button works automatically. State the 110–254 V test-circuit condition only for the arrangement covered by the source.

The Type B reference supports technical explanation. It does not prove that an arbitrary F200 reference, terminal layout or resistor value applies to every ABB residual-current device.

