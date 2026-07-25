// Single source of truth for Aarna's public-facing contact details — the
// Contact page and the site footer both need the exact same phone number,
// and previously each would have carried its own copy.
export const CONTACT_EMAIL = "hello@shopaarna.in";
export const CONTACT_PHONE_DISPLAY = "+91 79-75639485";
export const CONTACT_PHONE_TEL = "+917975639485";

// wa.me's click-to-chat format wants the number with no "+" or separators.
export const CONTACT_WHATSAPP_URL = `https://wa.me/${CONTACT_PHONE_TEL.replace("+", "")}`;

export const INSTAGRAM_URL = "https://www.instagram.com/aarna_arpithabhishek/";
