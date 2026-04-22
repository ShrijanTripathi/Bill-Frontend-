const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function roundToTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clampDiscountPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function getDatePartsInTimeZone(date, timeZone) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  const year = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  const day = Number(dateParts.find((part) => part.type === "day")?.value);

  return { year, month, day, weekday };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
}

function zonedStartOfDayToUtc({ year, month, day }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function addDaysInUtc(year, month, day, increment) {
  const cursor = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  cursor.setUTCDate(cursor.getUTCDate() + increment);
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}

function resolvePeriodRange(period, timeZone) {
  const now = new Date();
  const today = getDatePartsInTimeZone(now, timeZone);

  if (period === "today") {
    const start = zonedStartOfDayToUtc(today, timeZone);
    const tomorrow = addDaysInUtc(today.year, today.month, today.day, 1);
    const end = zonedStartOfDayToUtc(tomorrow, timeZone);
    return { start, end };
  }

  if (period === "week") {
    const weekdayIndex = WEEKDAY_INDEX[today.weekday] ?? 0;
    const daysSinceMonday = (weekdayIndex + 6) % 7;
    const weekStartParts = addDaysInUtc(today.year, today.month, today.day, -daysSinceMonday);
    const weekEndParts = addDaysInUtc(weekStartParts.year, weekStartParts.month, weekStartParts.day, 7);
    const start = zonedStartOfDayToUtc(weekStartParts, timeZone);
    const end = zonedStartOfDayToUtc(weekEndParts, timeZone);
    return { start, end };
  }

  const monthStart = { year: today.year, month: today.month, day: 1 };
  const nextMonth =
    today.month === 12
      ? { year: today.year + 1, month: 1, day: 1 }
      : { year: today.year, month: today.month + 1, day: 1 };

  return {
    start: zonedStartOfDayToUtc(monthStart, timeZone),
    end: zonedStartOfDayToUtc(nextMonth, timeZone),
  };
}

function buildLineItem(rawItem) {
  const qty = Math.max(1, Number(rawItem?.qty || 0));
  const unitPrice = Math.max(0, Number(rawItem?.price ?? rawItem?.unitPrice ?? 0));
  const lineTotal = roundToTwo(unitPrice * qty);
  const itemId = String(rawItem?.itemId || "").trim();
  const itemRef = /^[a-f\d]{24}$/i.test(itemId) ? itemId : null;

  return {
    itemRef,
    name: String(rawItem?.name || "").trim(),
    category: String(rawItem?.category || "Uncategorized").trim(),
    unitPrice: roundToTwo(unitPrice),
    qty,
    lineTotal,
  };
}

function normalizeSalePayload(payload = {}) {
  const normalizedItems = (Array.isArray(payload.items) ? payload.items : [])
    .map(buildLineItem)
    .filter((item) => item.name.length > 0);

  const subtotal = roundToTwo(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const totalQty = normalizedItems.reduce((sum, item) => sum + item.qty, 0);
  const discountPercent = roundToTwo(clampDiscountPercent(payload.discountPercent));
  const discountAmount = roundToTwo((subtotal * discountPercent) / 100);
  const grandTotal = roundToTwo(subtotal - discountAmount);

  return {
    billNo: Number(payload.billNo || 0),
    tokenNo: Number(payload.tokenNo || 0),
    billedAt: payload.billedAt ? new Date(payload.billedAt) : new Date(),
    items: normalizedItems,
    totalQty,
    subtotal,
    discountPercent,
    discountAmount,
    grandTotal,
  };
}

module.exports = {
  normalizeSalePayload,
  resolvePeriodRange,
  roundToTwo,
};
