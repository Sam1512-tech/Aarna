# WhatsApp Message Templates — Aarna

Submission-ready templates for the WhatsApp BSP (**Interakt**). All must be
submitted to Meta for approval (1–7 day cycle) before they can be sent.

## Scope decision

WhatsApp sends **key milestones only**. Shipping-in-progress updates
(shipped, out for delivery, in transit) are **not** sent here — Delhivery's own
customer-comms system owns those, and we don't duplicate them.

| Event | Channel |
|---|---|
| Order placed | **WhatsApp** + email (email carries the invoice PDF) |
| Shipped / out for delivery / in transit | Delhivery only |
| Delivered | **WhatsApp** |
| Return/exchange requested | **WhatsApp** |
| Return/exchange approved | **WhatsApp** |
| Return/exchange rejected | **WhatsApp** |
| Return received (item back in our hands) | **WhatsApp** |
| QC failed (partial/no refund) | **WhatsApp** |
| Refund processed (QC passed) | **WhatsApp** + email |

**Templates to submit: `order_placed`, `delivered`, `return_received`, `refund_processed`,
`return_requested`, `return_approved`, `return_rejected`, `return_qc_failed`.**

Deliberately **not** submitting an `exchange_shipped` template yet — there's no
outbound swap-shipment tracking built (see CLAUDE.md's known gaps), so there's
no trigger point to fire it from. Revisit once that's built.

## Submission notes

- **Category:** all eight are **UTILITY** (transactional, order-triggered) — not
  Marketing. Utility templates approve faster and can be business-initiated.
- **Language:** English (`en`).
- **Variables** use Meta's `{{1}}`, `{{2}}`… positional placeholders. Body
  variables and button-URL variables are numbered **separately**.
- Meta requires a **sample value** for every variable at submission (given below).
- **Copy is a draft** — Vismaya owns brand voice; she should sign off on wording
  before submission. Amounts are passed as formatted rupees (e.g. `4,999`), not paise.

---

## 1. `order_placed`  ·  UTILITY · en

**Body**
```
Hi {{1}}, thank you for choosing Aarna 🤍

Your order *{{2}}* is confirmed and being prepared with care.
Order total: ₹{{3}}

We'll let you know the moment it arrives. 💛
```
**Footer:** `Aarna by Arpitha Abhishek`
**Button:** URL · `View my orders` → `https://shopaarna.in/account`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | Order number | AARNA-000123 |
| {{3}} | Order total (₹) | 4,999 |

**Trigger:** Razorpay webhook `payment.captured` (alongside the order-receipt email).

---

## 2. `delivered`  ·  UTILITY · en

**Body**
```
Hi {{1}}, your Aarna order *{{2}}* has been delivered. 🤍

We truly hope you love it. If anything isn't quite right, you have {{3}} days to request a return.

We'd love to see how you style it — tag us @aarna_arpithabhishek 💛
```
**Footer:** `Aarna by Arpitha Abhishek`
**Button:** URL · `View my orders` → `https://shopaarna.in/account`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | Order number | AARNA-000123 |
| {{3}} | Return window (days) | 3 |

**Trigger:** Delhivery webhook, on `DELIVERED` status → `fulfillment_status = "delivered"`.

---

## 3. `return_received`  ·  UTILITY · en

**Body**
```
Hi {{1}}, we've received your return for order *{{2}}*. 🤍

Our team is inspecting it now, and your refund of ₹{{3}} will be initiated shortly. We'll confirm the moment it's on its way back to you.
```
**Footer:** `Aarna by Arpitha Abhishek`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | Order number | AARNA-000123 |
| {{3}} | Refund amount (₹) | 4,999 |

**Trigger:** admin marks a return `received` (returns flow).

---

## 4. `refund_processed`  ·  UTILITY · en

**Body**
```
Hi {{1}}, your refund of ₹{{2}} for order *{{3}}* has been processed. 🤍

It should reflect in your original payment method within {{4}}. Thank you for your patience 💛
```
**Footer:** `Aarna by Arpitha Abhishek`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | Refund amount (₹) | 4,999 |
| {{3}} | Order number | AARNA-000123 |
| {{4}} | Expected window | 5–7 business days |

**Trigger:** Razorpay webhook `refund.processed` (alongside the refund email).

---

## 5. `return_requested`  ·  UTILITY · en

**Body**
```
Hi {{1}}, we've received your {{2}} request for order *{{3}}*. 🤍

Our team will review it within 24 hours — we'll let you know the moment there's an update.
```
**Footer:** `Aarna by Arpitha Abhishek`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | `return` or `exchange` | exchange |
| {{3}} | Order number | AARNA-000123 |

**Trigger:** customer submits a request via `requestReturn()` (`/account/returns`, `/account/exchanges`).

---

## 6. `return_approved`  ·  UTILITY · en

**Body**
```
Hi {{1}}, good news — your {{2}} request for order *{{3}}* has been approved. 🤍

We'll arrange pickup of the item shortly. Have it ready with the tags attached.
```
**Footer:** `Aarna by Arpitha Abhishek`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | `return` or `exchange` | exchange |
| {{3}} | Order number | AARNA-000123 |

**Trigger:** admin moves a return/exchange to `approved` (`updateReturnStatus`).

---

## 7. `return_rejected`  ·  UTILITY · en

**Body**
```
Hi {{1}}, we're unable to process your {{2}} request for order *{{3}}*.

{{4}}

Reply here or reach out at hello@shopaarna.in if you'd like to discuss.
```
**Footer:** `Aarna by Arpitha Abhishek`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | `return` or `exchange` | return |
| {{3}} | Order number | AARNA-000123 |
| {{4}} | Rejection reason (admin-picked label, or the "other" note) | Outside the 3-day window |

**Trigger:** admin rejects via `ReturnRejectPicker` → `updateReturnStatus(id, "rejected", {...})`.

---

## 8. `return_qc_failed`  ·  UTILITY · en

**Body**
```
Hi {{1}}, we've inspected the item from order *{{2}}*.

{{3}}

{{4}}
```
**Footer:** `Aarna by Arpitha Abhishek`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | Order number | AARNA-000123 |
| {{3}} | Admin's QC note (customer-visible explanation) | The piece showed signs of wear beyond normal try-on. |
| {{4}} | Pre-composed refund line — "A refund of ₹X has been processed…" or "No refund could be issued for this item." | A refund of ₹2,499 has been processed to your original payment method. |

**Trigger:** admin records a QC **fail** via `ReturnQcPanel` → `markReturnQc()` —
covers both a partial refund and a full deduction (previously a full-deduction
fail sent no WhatsApp message at all; a QC **pass** still sends `refund_processed`
as before).

---

## Still blocked / remaining

- **Client:** Facebook Business Manager + a spare phone number (the WhatsApp
  sender number can't be one already on personal WhatsApp).
- **You:** add these 8 templates in Interakt, submit to Meta. The original 4
  are already Approved; the 4 new ones above still need submitting.
- **Code:** ✅ done — `sendTemplate()` (Interakt) + all 8 trigger points are
  wired, opt-in gated, and log to `message_log`. Graceful no-op for any
  template Meta hasn't approved yet, so each one activates on its own the
  moment it clears review — no code changes needed.
