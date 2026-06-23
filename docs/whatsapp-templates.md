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
| Return received | **WhatsApp** |
| Refund processed | **WhatsApp** + email |

**Templates to submit: `order_placed`, `delivered`, `return_received`, `refund_processed`.**

## Submission notes

- **Category:** all four are **UTILITY** (transactional, order-triggered) — not
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
**Button:** URL · `View my orders` → `https://aarna.in/account`

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

We'd love to see how you style it — tag us @aarna 💛
```
**Footer:** `Aarna by Arpitha Abhishek`
**Button:** URL · `View my orders` → `https://aarna.in/account`

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Customer first name | Priya |
| {{2}} | Order number | AARNA-000123 |
| {{3}} | Return window (days) | 7 |

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

## Still blocked / remaining

- **Client:** Facebook Business Manager + a spare phone number (the WhatsApp
  sender number can't be one already on personal WhatsApp).
- **You:** create the Interakt account, add these 4 templates, submit to Meta.
- **Code:** `lib/whatsapp/index.ts` `sendTemplate()` is still a stub — wire the
  Interakt REST call + the 4 trigger points once the BSP account + API key exist.
