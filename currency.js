// Currency conversion — shared by the currency picker and every place that
// renders or stores a dollar amount. All amounts are stored in Firebase in
// USD (the app's canonical/base currency); this module converts between USD
// and whatever currency the user has selected for display, using live
// exchange rates from a free, no-API-key-required forex API.
//
// Rates are cached in localStorage so we don't hit the API on every page
// load — only when the cache is missing or older than REFRESH_INTERVAL_MS,
// which keeps the conversion "dynamic" (tracks real-world rate movement)
// without hammering the endpoint.

const RATES_API_URL = "https://open.er-api.com/v6/latest/USD";
const RATES_CACHE_KEY = "tabs_exchange_rates_v1";
const SELECTED_CURRENCY_KEY = "tabs_selected_currency";
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Curated list of world currencies with display names + symbols. Any
// currency code the rates API returns can still be converted even if it
// isn't in this list — this just controls what shows up (with a friendly
// name/symbol) in the picker.
export const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "MXN", name: "Mexican Peso", symbol: "Mex$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "CLP", name: "Chilean Peso", symbol: "CLP$" },
  { code: "COP", name: "Colombian Peso", symbol: "COL$" },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$" },
  { code: "TWD", name: "Taiwan Dollar", symbol: "NT$" },
];

const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

let cachedState = null; // { base: "USD", rates: {...}, fetchedAt: number }
let inFlightFetch = null;

function readCache() {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(state) {
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode / quota) — fall back to
    // in-memory only, still works for the current session.
  }
}

export function getSymbol(code) {
  return CURRENCY_BY_CODE[code]?.symbol || code || "$";
}

export function getSelectedCurrency() {
  try {
    return localStorage.getItem(SELECTED_CURRENCY_KEY) || "USD";
  } catch {
    return "USD";
  }
}

export function setSelectedCurrency(code) {
  try {
    localStorage.setItem(SELECTED_CURRENCY_KEY, code);
  } catch {
    // Ignore — selection just won't persist across reloads this session.
  }
}

// Synchronous access to whatever rates are currently loaded (from cache or
// a prior fetch). Returns null until the first fetchExchangeRates() call
// resolves, so callers should treat missing rates as "not ready yet" and
// skip conversion (show the raw USD amount) rather than throw.
export function getRates() {
  return cachedState?.rates || null;
}

// Fetches live rates if the cache is missing/stale, otherwise resolves
// immediately with the cached rates. Safe to call as often as needed —
// concurrent callers share one in-flight request.
export async function fetchExchangeRates() {
  if (!cachedState) {
    cachedState = readCache();
  }

  const isFresh =
    cachedState && Date.now() - cachedState.fetchedAt < REFRESH_INTERVAL_MS;
  if (isFresh) return cachedState.rates;

  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const response = await fetch(RATES_API_URL);
      if (!response.ok) throw new Error(`Rates request failed: ${response.status}`);
      const data = await response.json();
      if (data.result !== "success" || !data.rates) {
        throw new Error("Rates response missing data");
      }
      cachedState = {
        base: data.base_code || "USD",
        rates: data.rates,
        fetchedAt: Date.now(),
      };
      writeCache(cachedState);
      return cachedState.rates;
    } catch (error) {
      console.error("❌ Error fetching exchange rates:", error);
      // Fall back to whatever we had cached (even if stale) so conversion
      // keeps working; if there's truly nothing, at least USD works.
      if (!cachedState) {
        cachedState = { base: "USD", rates: { USD: 1 }, fetchedAt: Date.now() };
      }
      return cachedState.rates;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

// USD is the storage/base currency throughout the app — these convert
// between that canonical amount and whatever the user has selected to view.
export function usdToDisplay(usdAmount, code = getSelectedCurrency()) {
  const rates = getRates();
  if (typeof usdAmount !== "number" || isNaN(usdAmount)) return usdAmount;
  if (!rates || !rates[code]) return usdAmount;
  return usdAmount * rates[code];
}

export function displayToUsd(displayAmount, code = getSelectedCurrency()) {
  const rates = getRates();
  if (typeof displayAmount !== "number" || isNaN(displayAmount)) return displayAmount;
  if (!rates || !rates[code]) return displayAmount;
  return displayAmount / rates[code];
}
