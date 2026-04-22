const Sale = require("../models/Sale");
const SaleArchive = require("../models/SaleArchive");
const MenuItem = require("../models/MenuItem");
const { normalizeSalePayload, resolvePeriodRange, roundToTwo } = require("../utils/salesAnalytics");
const { publishSalesEvent, subscribeSalesEvents } = require("../utils/salesEvents");

function getPeriodLabel(period) {
  if (period === "today") return "Today";
  if (period === "week") return "This Week";
  return "This Month";
}

function resolveTimeZone(value) {
  const fallback = "Asia/Kolkata";
  const candidate = String(value || fallback);

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
}

async function createSale(req, res) {
  const salePayload = normalizeSalePayload(req.body);
  const saleType = req.body.saleType === "OFFLINE" ? "OFFLINE" : "ONLINE";

  if (!salePayload.items.length) {
    return res.status(400).json({ message: "At least one sale item is required" });
  }
  if (!Number.isFinite(salePayload.billNo) || salePayload.billNo <= 0) {
    return res.status(400).json({ message: "Valid bill number is required" });
  }
  if (!Number.isFinite(salePayload.tokenNo) || salePayload.tokenNo <= 0) {
    return res.status(400).json({ message: "Valid token number is required" });
  }
  if (Number.isNaN(salePayload.billedAt.getTime())) {
    return res.status(400).json({ message: "Invalid billedAt timestamp" });
  }

  const sale = await Sale.create({
    ...salePayload,
    saleType,
  });

  publishSalesEvent("sale_created", {
    saleId: sale._id,
    saleType: sale.saleType,
    isDeleted: sale.isDeleted,
  });

  return res.status(201).json({ sale });
}

async function listSales(req, res) {
  const saleType = String(req.query.saleType || "").trim().toUpperCase();
  const includeDeleted = req.query.includeDeleted === "true";
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const filter = {};

  if (saleType === "ONLINE" || saleType === "OFFLINE") {
    filter.saleType = saleType;
  }
  if (!includeDeleted) {
    filter.isDeleted = false;
  }

  const sales = await Sale.find(filter)
    .sort({ billedAt: -1, _id: -1 })
    .limit(limit)
    .select(
      "_id saleType isDeleted deletedAt billNo tokenNo billedAt totalQty subtotal discountPercent discountAmount grandTotal items"
    )
    .lean();

  return res.json({ sales });
}

async function deleteOfflineSale(req, res) {
  const { id } = req.params;
  const sale = await Sale.findById(id);

  if (!sale) {
    return res.status(404).json({ message: "Sale not found" });
  }
  if (sale.saleType !== "OFFLINE") {
    return res.status(400).json({ message: "Only OFFLINE sales can be deleted" });
  }
  if (sale.isDeleted) {
    return res.status(409).json({ message: "Sale is already deleted" });
  }

  sale.isDeleted = true;
  sale.deletedAt = new Date();
  await sale.save();

  publishSalesEvent("sale_deleted", {
    saleId: sale._id,
    saleType: sale.saleType,
    isDeleted: sale.isDeleted,
  });

  return res.json({ sale });
}

function streamSalesEvents(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write("event: heartbeat\n");
    res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 25000);

  const unsubscribe = subscribeSalesEvents((event) => {
    res.write("event: sales_update\n");
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}

async function getSalesAnalytics(req, res) {
  const period = String(req.query.period || "today");
  const timeZone = resolveTimeZone(req.query.timeZone);
  const { start, end } = resolvePeriodRange(period, timeZone);
  const analyticsFilter = {
    billedAt: { $gte: start, $lt: end },
    isDeleted: false,
  };

  const [summaryRows, itemRows, menuItems] = await Promise.all([
    Sale.aggregate([
      { $match: analyticsFilter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$grandTotal" },
          totalOrders: { $sum: 1 },
          totalQty: { $sum: "$totalQty" },
        },
      },
    ]),
    Sale.aggregate([
      { $match: analyticsFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            itemRef: "$items.itemRef",
            name: "$items.name",
            category: "$items.category",
          },
          quantitySold: { $sum: "$items.qty" },
          salesAmount: { $sum: "$items.lineTotal" },
        },
      },
      {
        $project: {
          _id: 0,
          itemId: "$_id.itemRef",
          name: "$_id.name",
          category: "$_id.category",
          quantitySold: 1,
          salesAmount: 1,
        },
      },
      { $sort: { salesAmount: -1, name: 1 } },
    ]),
    MenuItem.find().select("_id name category").sort({ category: 1, name: 1 }).lean(),
  ]);

  const summary = summaryRows[0] || { totalSales: 0, totalOrders: 0, totalQty: 0 };
  const statsById = new Map();
  const orphanRows = [];

  itemRows.forEach((row) => {
    const itemId = row.itemId ? String(row.itemId) : "";
    const normalized = {
      itemId: itemId || null,
      name: row.name,
      category: row.category || "Uncategorized",
      quantitySold: Number(row.quantitySold || 0),
      salesAmount: roundToTwo(row.salesAmount || 0),
    };

    if (itemId) {
      statsById.set(itemId, normalized);
      return;
    }

    orphanRows.push(normalized);
  });

  const itemSummary = menuItems.map((menuItem) => {
    const key = String(menuItem._id);
    const liveStats = statsById.get(key);

    return {
      itemId: key,
      name: menuItem.name,
      category: menuItem.category,
      quantitySold: liveStats?.quantitySold || 0,
      salesAmount: roundToTwo(liveStats?.salesAmount || 0),
    };
  });

  const unknownOrRemovedItems = orphanRows.filter(
    (row) => !itemSummary.some((item) => item.name === row.name && item.category === row.category)
  );

  return res.json({
    period,
    periodLabel: getPeriodLabel(period),
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone,
    },
    summary: {
      totalSales: roundToTwo(summary.totalSales || 0),
      totalOrders: Number(summary.totalOrders || 0),
      totalQty: Number(summary.totalQty || 0),
    },
    items: [...itemSummary, ...unknownOrRemovedItems],
  });
}

async function exportSalesByFilter(req, res) {
  const filter = String(req.query.filter || "today");
  const timeZone = resolveTimeZone(req.query.timeZone);
  const { start, end } = resolvePeriodRange(filter, timeZone);

  const sales = await Sale.find({
    billedAt: { $gte: start, $lt: end },
    isDeleted: false,
  })
    .sort({ billedAt: 1, _id: 1 })
    .lean();

  return res.json({
    filter,
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone,
    },
    sales,
  });
}

async function bulkDeleteSales(req, res) {
  const filter = String(req.body.filter || "today");
  const timeZone = resolveTimeZone(req.body.timeZone);
  const { start, end } = resolvePeriodRange(filter, timeZone);
  const deletedBy = String(req.admin?.email || "");

  const sales = await Sale.find({
    billedAt: { $gte: start, $lt: end },
    isDeleted: false,
  }).lean();

  if (!sales.length) {
    return res.json({ deletedCount: 0, archivedCount: 0, filter });
  }

  const archiveDocs = sales.map((sale) => ({
    originalSaleId: sale._id,
    filter,
    deletedBy,
    deletedAt: new Date(),
    saleSnapshot: sale,
  }));

  await SaleArchive.insertMany(archiveDocs);

  const saleIds = sales.map((sale) => sale._id);
  const deletedResult = await Sale.deleteMany({ _id: { $in: saleIds } });

  publishSalesEvent("sales_bulk_deleted", {
    filter,
    deletedCount: Number(deletedResult.deletedCount || 0),
  });

  return res.json({
    filter,
    deletedCount: Number(deletedResult.deletedCount || 0),
    archivedCount: archiveDocs.length,
  });
}

module.exports = {
  createSale,
  listSales,
  deleteOfflineSale,
  streamSalesEvents,
  getSalesAnalytics,
  exportSalesByFilter,
  bulkDeleteSales,
};
