function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export function rfqConfirmationEmailHtml(input) {
  const rows = input.items.map((item) => `<tr>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;color:#0f172a;font-weight:700;vertical-align:top">${escapeHtml(item.productName)}<br><span style="color:#64748b;font-size:12px;font-weight:400">${escapeHtml(item.sku)}</span></td>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;vertical-align:top"><span style="display:inline-block;padding:5px 8px;border:1px solid #c7d2fe;border-radius:999px;color:#4338ca;font-size:11px;white-space:nowrap">${escapeHtml(item.availability)}</span></td>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;color:#334155;vertical-align:top">${item.quantity}</td>
  </tr>`).join("");
  const requirements = input.requirements?.trim()
    ? `<table role="presentation" width="100%" style="margin-top:24px;border:1px solid #c7d2fe;border-radius:10px;background:#eef2ff"><tr><td style="padding:16px 18px"><p style="margin:0 0 7px;color:#4338ca;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Project requirements</p><p style="margin:0;color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(input.requirements)}</p></td></tr></table>`
    : "";
  const submittedAt = new Date(input.submittedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RFQ ${escapeHtml(input.reference)}</title></head><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc"><tr><td style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px"><tr><td style="padding:30px 32px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><p style="margin:0;color:#64748b;font-size:11px;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(input.supplierName)} / RFQ</p><h1 style="margin:12px 0 8px;color:#0f172a;font-size:28px;line-height:1.2">We received your RFQ</h1><p style="margin:0;color:#64748b;font-size:14px;line-height:1.5">${escapeHtml(input.customerName)}${input.customerCompany ? `, ${escapeHtml(input.customerCompany)}` : ""}<br>${escapeHtml(input.customerEmail)}</p></td><td align="right" valign="top"><span style="display:inline-block;padding:7px 10px;border:1px solid #bbf7d0;border-radius:999px;color:#15803d;background:#f0fdf4;font-size:11px;font-weight:700;letter-spacing:.08em">NEW</span></td></tr></table>
    <p style="margin:22px 0 0;color:#64748b;font-family:monospace;font-size:12px;letter-spacing:.04em">${escapeHtml(input.reference)} · Submitted ${escapeHtml(submittedAt)}</p>
    <p style="margin:22px 0 0;color:#334155;font-size:14px;line-height:1.6">Thanks for sending your request. Our quote desk will review the requested products and confirm availability, pricing and lead time before preparing a quotation.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-top:1px solid #e2e8f0;border-collapse:collapse"><thead><tr><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Requested item</th><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Listed status</th><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Qty</th></tr></thead><tbody>${rows}</tbody></table>
    ${requirements}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:16px 18px"><p style="margin:0 0 9px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">What happens next</p><p style="margin:0;color:#334155;font-size:14px;line-height:1.7">1. Our team reviews your requirements.<br>2. We check product availability, project pricing and delivery lead time.<br>3. We send a quotation to this email address for your review.</p></td></tr></table>
    <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">Keep this reference for follow-up: <strong style="color:#0f172a">${escapeHtml(input.reference)}</strong>. You can track the RFQ later using this reference and the same email address.</p>
    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px">${escapeHtml(input.supplierName)}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export function rfqConfirmationEmailText(input) {
  const items = input.items.map((item) => `- ${item.productName} (${item.sku})\n  Listed status: ${item.availability}\n  Quantity: ${item.quantity}`).join("\n");
  return [`Hi ${input.customerName},`, "", `We received your RFQ ${input.reference} for ${input.customerCompany || "your company"}.`, `Submitted: ${new Date(input.submittedAt).toISOString()}`, "", "REQUESTED ITEMS", items, input.requirements?.trim() ? `\nPROJECT REQUIREMENTS\n${input.requirements.trim()}` : "", "", "WHAT HAPPENS NEXT", "1. Our team reviews your requirements.", "2. We check availability, project pricing and delivery lead time.", "3. We send a quotation to this email address.", "", `Use ${input.reference} and this email address to track the RFQ later.`, "", input.supplierName].join("\n");
}
