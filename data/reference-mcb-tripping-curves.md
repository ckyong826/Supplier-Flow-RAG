# MCB tripping-curve reference

Reference facts for understanding Acti9 miniature circuit-breaker (MCB) curve labels. These are general technical notes, not a substitute for the product datasheet or an installation design.

Quick answer: the C curve describes magnetic tripping between 5 and 10 times rated current (`In`).

- The curve letter describes the magnetic short-circuit tripping range as a multiple of the breaker rated current (`In`). It is not the rated current and it is not the breaking capacity.
- B curve: magnetic tripping between 3 and 5 times `In`.
- C curve: magnetic tripping between 5 and 10 times `In`.
- D curve: magnetic tripping between 10 and 14 times `In`.
- Curve selection depends on the connected load, inrush current, conductor impedance, coordination, and applicable local requirements. Do not select a curve from the load name alone.

Source: https://www.se.com/au/en/faqs/FA290880/
