// India's states + union territories, for the checkout state dropdown.
//
// Spelled to match exactly what api.postalpincode.in (lib/checkout/
// india-postal.ts) actually returns — confirmed directly against real
// pincodes across every entry here, not copied from a "correct" reference
// list. That API uses a few non-standard/legacy names ("Chattisgarh" not
// "Chhattisgarh", "Pondicherry" not "Puducherry", "Jammu & Kashmir"/
// "Andaman & Nicobar"/"Daman & Diu" with "&" not "and"). Using the more
// "correct" modern spelling for any of these would break the dropdown's
// sync with the pincode auto-fill (checkout-view.tsx's postal-lookup
// effect, and initCheckout's server-side equivalent) — the whole point of
// this list is to match the value that lookup actually sets, not to be a
// standalone authority on Indian geography.
export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman & Nicobar",
  "Chandigarh",
  "Dadra & Nagar Haveli",
  "Daman & Diu",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Pondicherry",
] as const;
