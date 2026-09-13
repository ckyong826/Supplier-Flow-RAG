# TeSys overload-relay catalogue reference

Source: Schneider Electric, [TeSys Overload Relays chapter](https://www.se.com/us/en/download/document/B11%20-%20Overload%20relays_P_EN/).

This reference digest covers the manufacturer’s TeSys overload-relay material. It is technical background only. It does not state SupplierFlow pricing, stock, delivery, warranty or a substitute for a particular relay.

Quick answer: the covered overload-relay technologies are thermal and electronic. Both are overload relays for motor protection, but their sensing and adjustment behaviour differs.

## What an overload relay does

An overload relay is used for motor protection against sustained overcurrent or overload conditions. It works with a contactor or starter assembly and commands a control response when the motor current remains above the selected range. It is not the same as a contactor, which switches the load, and it is not the same as a short-circuit protective device.

The manufacturer material covers thermal overload relays and electronic overload relays for machine protection. “Thermal” and “electronic” identify different sensing and adjustment technologies. They should not be flattened into one generic “overload breaker” label.

## Thermal overload relays

Thermal overload relays respond to the heating effect associated with motor current. Their behaviour is influenced by the current setting, trip class, ambient conditions and the motor’s thermal state. The selected setting should correspond to the motor’s rated current and installation requirements, not simply to the contactor’s largest current label.

Thermal overload protection is intended for overload, phase-loss and related motor conditions according to the product’s specified functions. It does not replace upstream short-circuit protection. The starter design must include the protective device and coordination specified for the application.

## Electronic overload relays

Electronic overload relays measure current electronically and can provide additional adjustment or diagnostic capabilities depending on the family. Their exact functions, trip classes, reset modes and wiring must be taken from the product table. The word “electronic” alone does not guarantee a particular communication protocol or fault record.

An electronic relay may support more precise settings than a thermal unit, but the correct choice still depends on motor data, duty, environment and coordination. The assistant must not infer a setting range from a nearby product reference.

## Relationship with the contactor

The overload relay is commonly mounted with or wired through a contactor. The contactor provides the switching action; the overload relay detects a prolonged abnormal current and opens or changes the control circuit through its auxiliary contacts. A motor starter may also include short-circuit protection upstream.

This division of roles is useful for customer questions. If they ask “can the overload relay switch the motor?”, explain that switching and overload protection are separate functions. If they ask “does the contactor protect against a short circuit?”, the answer should point to the upstream protective device, not the contactor’s auxiliary contacts.

## Selection fields

Important fields include motor full-load current, adjustment range, trip class, phase arrangement, reset mode, ambient conditions, contactor compatibility and short-circuit coordination. The application category of the contactor is a separate field. A relay that fits physically may still be wrong electrically.

When the source does not state the requested field, the assistant should abstain rather than borrow a value from another TeSys family. Product references with similar prefixes are hard negatives because they can share dimensions while differing in current range or function.

## Reset and control behaviour

Manual and automatic reset are different operational behaviours. A reset mode affects how the control circuit returns after a trip; it is not proof that the motor itself is safe to restart. Restart permission may require a separate control interlock and an operator decision.

Auxiliary contacts from an overload relay are status/control signals. They should not be counted as the contactor’s built-in auxiliary contacts. The assistant must identify which component the terminal or contact label belongs to.

## Answering boundary

For a general explanation, say that TeSys includes thermal and electronic overload relays for motor protection. For a SKU recommendation, retrieve the exact relay row and verify the motor current range, trip class, reset, contactor family and coordination. Do not claim a relay provides short-circuit protection unless the exact source explicitly says so.
