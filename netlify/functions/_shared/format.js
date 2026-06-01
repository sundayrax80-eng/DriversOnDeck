function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function pick(input, keys) {
  return keys.reduce((out, key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = clean(input[key]);
    return out;
  }, {});
}

function required(input, keys) {
  const missing = keys.filter((key) => {
    const value = input[key];
    return value === undefined || value === null || String(value).trim() === "";
  });
  if (missing.length) {
    const error = new Error(`Missing required field(s): ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function moneyToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("Payment amount must be greater than zero");
    error.statusCode = 400;
    throw error;
  }
  return Math.round(amount * 100);
}

module.exports = { asArray, clean, pick, required, moneyToCents };
