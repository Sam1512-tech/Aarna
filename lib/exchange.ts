// Exchange requests piggyback on the returns pipeline (`requestReturn` with
// reasonCategory "exchange") until a dedicated exchange model ships. This
// marker prefix on the reason text is how the two account pages split rows:
// /account/exchanges shows rows WITH it, /account/returns shows rows WITHOUT.
// Admin sees the full reason text in the returns queue either way.
export const EXCHANGE_REASON_PREFIX = "Exchange requested.";
