import assert from "node:assert/strict";
import test from "node:test";
import { cartActionsFromSummary, mergeCustomerDetails, requestedQuantity } from "../app/api/ai-chat/customer.mjs";

test("fills buyer details from a natural RFQ message", () => {
  assert.deepEqual(
    mergeCustomerDetails({}, "My name is Chuah Kee Yong from Tecky Asia. My email is xinkaiya13826@gmail.com."),
    { name: "Chuah Kee Yong", company: "Tecky Asia", email: "xinkaiya13826@gmail.com" },
  );
});

test("fills missing details from the AI RFQ summary", () => {
  assert.deepEqual(
    mergeCustomerDetails({}, "Contact: Chuah Kee Yong, Tecky Asia, xinkaiya13826@gmail.com"),
    { name: "Chuah Kee Yong", company: "Tecky Asia", email: "xinkaiya13826@gmail.com" },
  );
});

test("adds the confirmed RFQ item from an AI summary", () => {
  assert.deepEqual(
    cartActionsFromSummary([{ id: "socket-32a", sku: "PKF32M435" }], "Item: 32A Outdoor Industrial Socket (PKF32M435)\nQuantity: 100 units @ RM 86.00 each"),
    [{ productId: "socket-32a", quantity: 100 }],
  );
});

test("fills the live RFQ from the labelled confirmation reply", () => {
  const reply = `Your RFQ:
- Name: Chuah Kee Yong
- Company: Tecky Asia
- Email: xinkaiya13826@gmail.com

Cart:
- Item: 32A Outdoor Industrial Socket (SKU PKF32M435)
- Quantity: 100 units`;
  assert.deepEqual(mergeCustomerDetails({}, reply), { name: "Chuah Kee Yong", company: "Tecky Asia", email: "xinkaiya13826@gmail.com" });
  assert.deepEqual(cartActionsFromSummary([{ id: "socket-32a", sku: "PKF32M435" }], reply), [{ productId: "socket-32a", quantity: 100 }]);
});

test("requires an explicit quantity before adding an AI-selected product", () => {
  assert.equal(requestedQuantity("Add PKF32M435 to my RFQ"), null);
  assert.equal(requestedQuantity("Add 100 PKF32M435 to my RFQ"), 100);
});
