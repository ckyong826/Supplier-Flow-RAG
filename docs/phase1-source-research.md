# SupplierFlow Phase 1 — source research

Status: Batch 5 source digests are staged in `data/` and verified by the Phase 1 evaluator. This
file is a research record and is not imported by `scripts/import-knowledge.mjs`.

## Selection rule

Use manufacturer or standards-body sources for product and trade-term facts. Convert only short, verified facts into SupplierFlow knowledge documents. Do not copy whole web pages, and do not infer SupplierFlow pricing, stock, warranty, or delivery promises from external pages.

## Candidate sources

### Schneider Electric — A9D55610

- Type: manufacturer product page
- Useful facts: Acti9 iDPN N Vigi RCBO; 1P+N; 10 A; B curve; 6 kA; AC type; 30 mA.
- Hard cases: near-duplicate SKU comparisons; distinguish RCBO from MCB/RCCB; preserve `AC type` and `30 mA`.
- Caution: Schneider marks this reference discontinued and shows a replacement. Confirm whether SupplierFlow's own catalogue should follow that status before importing it.
- Source: <https://www.se.com/uk/en/product/A9D55610/residual-current-breaker-with-overcurrent-protection-rcbo-acti9-idpn-n-vigi-1p%2Bn-10a-b-curve-6000a-ac-type-30ma/>

### Schneider Electric Singapore — A9F73140

- Type: manufacturer regional product page
- Useful facts: Acti9 iC60N MCB; 1P; 40 A; B curve; 6 kA at 230 V AC under IEC/EN 60898-1; 10 kA at 220–240 V AC under IEC/EN 60947-2.
- Hard cases: product-fit queries; distinguish MCB from RCBO/RCCB; do not collapse different breaking-capacity standards into one number.
- Caution: the page also shows regional availability and price fields. Those are not SupplierFlow facts.
- Source: <https://eshop.se.com/sg/miniature-circuit-breaker-mcb-acti9-ic60n-1p-40a-b-curve-6000a-iec-en-60898-1-10ka-iec-en-60947-2-a9f73140.html>

### Eaton — catalog number 263584

- Type: manufacturer product page
- Useful facts: xPole PF7 RCCB; model PF7-25/4/003-DE; 4 pole; 25 A; 10 kA Icn; 0.03 A residual current; Type AC.
- Hard cases: numeric product-spec questions; distinguish short-circuit rating from residual current; preserve unit conversions such as 0.03 A = 30 mA.
- Source: <https://www.eaton.com/gb/en-gb/skuPage.263584.html>

### ABB — F200 family

- Type: manufacturer product-family page
- Useful facts: F200 RCCB family covers rated current from 16 A to 125 A, sensitivity from 10 mA to 1000 mA, and multiple residual-current types including AC, A, AP-R, A S, F, and B.
- Hard cases: constraint-filter queries; avoid claiming a family-level range is the specification of every SKU; retrieve the SKU-level document before answering an exact product question.
- Source: <https://new.abb.com/low-voltage/products/system-pro-m/residual-current-devices/rccb/f200>

### ICC — Incoterms 2020

- Type: standards-body / trade-term reference
- Useful facts: Incoterms 2020 contains 11 trade terms; the rules allocate responsibilities and costs between buyer and seller. ICC also documents changes such as the DPU name and different CIF/CIP insurance levels.
- Hard cases: policy and international-delivery questions; distinguish a general trade standard from SupplierFlow's own delivery policy.
- Caution: do not use this source to invent Malaysia delivery times, Singapore delivery support, shipping charges, or customer-specific terms.
- Source: <https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/>

## Batch 1 now staged in `data/`

These five short reference documents are derived from the candidate sources above and are ready for a local dry-run import:

- `reference-mcb-tripping-curves.md`
- `reference-rccb-current-types.md`
- `reference-spd-selection.md`
- `reference-tesys-auxiliary-contacts.md`
- `reference-incoterms-2020.md`

The documents intentionally include scope and caution language. That gives the evaluator cases where a model must preserve a distinction, such as `Type A` versus `Type AC`, or a general Incoterms rule versus a SupplierFlow delivery promise.

## Batch 2 source set

The next batch uses seven additional first-party sources:

- Schneider Acti9 technical catalogue: current limiting, peak current, and thermal stress.
- ABB residual-current application guide: phase/neutral imbalance and the TN-C boundary.
- ABB F200 product-family page: ambient operating range and family-level versus SKU-level facts.
- Schneider TeSys D FAQ: mirror and mechanically linked contacts from LC1D09 through LC1D150.
- ICC Incoterms 2020 page: A9/B9 cost allocation, CIF/CIP insurance, and FCA bill-of-lading detail.
- Royal Malaysian Customs MySST portal: sales-tax and service-tax scope, without a universal product rate.
- Royal Malaysian Customs JKDM HS Explorer: tariff-search workflow and the need for classification context.

These are staged as the following short documents:

- `reference-mcb-current-limiting.md`
- `reference-rccb-installation-systems.md`
- `reference-rccb-operating-conditions.md`
- `reference-tesys-linked-contacts.md`
- `reference-incoterms-cost-insurance.md`
- `reference-malaysia-sst-scope.md`
- `reference-malaysia-hs-explorer.md`

## Batch 3 source set

The third batch adds manufacturer and manufacturer-application-guide concepts that are useful for technical support but are not SKU facts:

- Schneider Electric selectivity/discrimination guide: total versus partial discrimination and the role of the device immediately upstream of a fault.
- Schneider Electric TeSys FAQs: AC-1 versus AC-3 utilization categories and why load duty controls the contactor rating.
- Schneider Electric SPD electrical-installation guide: Uc, Up, In, Imax, and the effect of connection length on effective protection.
- ABB residual-current-device product page: Type S selective delay and AP-R short-time delay, including the people-protection boundary.
- ABB residual-current application guide: upstream/downstream IΔn and timing relationships for RCCB selectivity.

These are staged as the following short documents:

- `reference-mcb-selectivity.md`
- `reference-tesys-utilization-categories.md`
- `reference-spd-electrical-characteristics.md`
- `reference-spd-connection-rules.md`
- `reference-rccb-selective-types.md`
- `reference-rccb-selectivity-coordination.md`

The batch contributes six direct definitions and six adversarial boundary questions. It deliberately does not add a DC utilization-category document: the official FAQ located the selection tables but did not expose enough definitions to ground a concise answer safely.

## Batch 4 source set

The fourth batch adds seven more first-party references:

- Schneider Acti9 iC60 temperature FAQ: IEC 60898-1 versus IEC 60947-2 reference temperatures and conventional overload thresholds.
- Schneider Acti9 iC60 DC-application FAQ: the 12–250 VDC family range and dependence on series poles and breaking capacity.
- ABB RCD technical guide: the distinction between RCCB residual-current protection and RCBO overcurrent protection.
- ABB Type F product reference: Type A capability plus mixed-frequency residual-current detection up to 1000 Hz.
- Schneider TeSys D FAQs: built-in DC-coil suppression and A1 polarity.
- Schneider SPD FAQ: Type 1 Iimp/10/350 versus Type 2 Imax/8/20 test waveforms.
- ICC Incoterms 2020 digital reference: named place, delivery point, carriage destination, and risk transfer under C rules.

These are staged as the following short documents:

- `reference-mcb-temperature-derating.md`
- `reference-mcb-dc-applications.md`
- `reference-rccb-overcurrent-protection.md`
- `reference-rccb-type-f.md`
- `reference-tesys-dc-coil.md`
- `reference-spd-impulse-current.md`
- `reference-incoterms-risk-transfer.md`

The batch contributes seven direct definitions and seven adversarial boundary questions. The documents are intentionally reference-only; they do not create SupplierFlow pricing, stock, delivery, or warranty promises.

## Batch 5 source set

The fifth batch expands the corpus with short digests of first-party manufacturer and standards-body
material. Each digest keeps the original URL and scope warning; none is treated as a SupplierFlow
commercial record.

- Schneider Electric Acti9 iC60 catalogue, Acti9 RCBO catalogue, iPRD catalogue and iPRD brochure.
- Schneider Electric Acti9 RCBO installation sheet and TeSys Deca catalogue, overload-relay material,
  and installation sheet.
- ABB S200 catalogue, F200 Type B reference, and residual-current application material.
- Eaton xPole PF7 and PLN6 catalogue references.
- ICC Incoterms 2020 rules overview.

These became the following 14 data documents:

- `reference-acti9-ic60-catalogue.md`, `reference-acti9-rcbo-catalogue.md`,
  `reference-acti9-iprd-catalogue.md`, `reference-acti9-iprd-brochure.md`,
  `reference-acti9-rcbo-installation.md`
- `reference-tesys-deca-catalogue.md`, `reference-tesys-overload-relays.md`,
  `reference-tesys-deca-installation.md`
- `reference-abb-s200-catalogue.md`, `reference-abb-f200-b-type.md`,
  `reference-abb-rcd-application.md`
- `reference-eaton-pf7-catalogue.md`, `reference-eaton-pln6-catalogue.md`,
  `reference-incoterms-rules-overview.md`

Batch 5 adds 14 direct and 14 adversarial questions. The final fixture has 25 negative questions,
including price, stock, warranty, tax-rate, MOQ, HS-code and international-shipping traps. The
production corpus uses fixed 100-word windows; offline comparison also measured 15% overlap and
paragraph/heading semantic packing before the final live gate.

## Import decision

Before adding these to `data/`:

1. Confirm which SKU facts match the SupplierFlow catalogue.
2. Turn each approved product into a small factual document or card, not a copied page.
3. Add positive, near-duplicate, numeric-trap, and not-in-knowledge-base questions for every new fact.
4. Keep external trade terms separate from SupplierFlow delivery/payment policy.
5. Re-run offline retrieval before changing the live evaluator.
