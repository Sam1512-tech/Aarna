// Single source of truth for Aarna's free-shipping messaging — shipping is
// free site-wide (client decision, see lib/actions/checkout.ts), and this
// string is reused across the PDP, the site-wide marquee, and the shipping
// policy page so a future wording change doesn't require finding every copy.
export const FREE_SHIPPING_MESSAGE = "Free shipping on all orders";
