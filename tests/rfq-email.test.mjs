import assert from "node:assert/strict";
import test from "node:test";
import { rfqConfirmationEmailHtml, rfqConfirmationEmailText } from "../app/api/_rfq-email.mjs";

const input = {
  supplierName: "SupplierFlow",
  customerName: "Ada <Buyer>",
  customerCompany: "Northstar Ltd",
  customerEmail: "ada@example.com",
  reference: "RFQ-2026-TEST1234",
  submittedAt: "2026-08-20T08:00:00.000Z",
  requirements: "Deliver to Klang Valley\nNeed project pricing.",
  items: [{ productName: "Acti9 iC60N MCB", sku: "A9F73140", quantity: 12, availability: "Check availability" }],
};

test("RFQ confirmation email includes request details and safe HTML", () => {
  const html = rfqConfirmationEmailHtml(input);
  const text = rfqConfirmationEmailText(input);
  assert.match(html, /We received your RFQ|We received your RFQ/i);
  assert.match(html, /RFQ-2026-TEST1234/);
  assert.match(html, /A9F73140/);
  assert.match(html, /Deliver to Klang Valley/);
  assert.match(html, /Ada &lt;Buyer&gt;/);
  assert.match(text, /REQUESTED ITEMS/);
  assert.match(text, /WHAT HAPPENS NEXT/);
  assert.match(text, /this email address/);
});
