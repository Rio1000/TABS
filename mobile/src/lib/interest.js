const FREQUENCY_BY_PERIOD = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

// Mirrors the web app's compound-interest formula: A = P * (1 + r/n)^(n*t)
export function applyElapsedInterest(person) {
  const interest = person.interest;
  if (!interest || !interest.enabled || typeof person.amount !== "number") {
    return person;
  }

  const now = Date.now();
  const lastApplied = interest.lastInterestApplied || now;
  const yearsElapsed = (now - lastApplied) / (1000 * 60 * 60 * 24 * 365);
  if (yearsElapsed <= 0) return person;

  const rate = interest.rate / 100;
  const n = FREQUENCY_BY_PERIOD[interest.period] || 12;
  const newAmount = person.amount * Math.pow(1 + rate / n, n * yearsElapsed);

  return {
    ...person,
    amount: newAmount,
    interest: { ...interest, lastInterestApplied: now },
  };
}
