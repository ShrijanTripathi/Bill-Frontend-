const mongoose = require("mongoose");
const { parse: parseCsv } = require("csv-parse/sync");
const pdfParse = require("pdf-parse");
const MenuItem = require("../models/MenuItem");
const Category = require("../models/Category");

const ITEM_SELECT =
  "_id name slug category itemType pricingType basePrice variants addons description tags isRecommended isAvailable isActive sortOrder createdAt updatedAt";
const CATEGORY_SELECT = "_id name slug sortOrder isActive";
const IMPORT_MAX_ROWS = 1000;

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({ message: "Menu item already exists in this category" });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: "Validation failed",
          errors: Object.values(error.errors).map((entry) => ({
            field: entry.path,
            message: entry.message,
          })),
        });
      }

      if (error.name === "CastError") {
        return res.status(400).json({ message: "Invalid id" });
      }

      return next(error);
    });
  };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/rs\.?/gi, "")
    .replace(/inr/gi, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return fallback;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [trimmed];
      }
    }

    return trimmed
      .split(/[|;\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [value];
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeText).filter(Boolean))];
  }

  if (typeof value === "string") {
    return [
      ...new Set(
        value
          .split(/[|,;\n]+/)
          .map(normalizeText)
          .filter(Boolean)
      ),
    ];
  }

  return [];
}

function normalizeVariantCode(value, label) {
  const candidate = normalizeKey(value || label).replace(/\s+/g, "-");

  if (candidate.includes("half")) return "half";
  if (candidate.includes("full")) return "full";
  if (candidate.includes("small")) return "small";
  if (candidate.includes("medium")) return "medium";
  if (candidate.includes("large")) return "large";

  return "custom";
}

function variantLabelFromCode(code, fallback) {
  if (code === "half") return "Half";
  if (code === "full") return "Full";
  if (code === "small") return "Small";
  if (code === "medium") return "Medium";
  if (code === "large") return "Large";
  return normalizeText(fallback || "Custom");
}

function parseVariantSegment(segment, index) {
  if (typeof segment === "object" && segment !== null) {
    const label = normalizeText(segment.label || segment.name || segment.size || segment.variant);
    const code = normalizeVariantCode(segment.code || segment.size || segment.label, label);
    const price = toNumber(segment.price ?? segment.amount ?? segment.value);

    if (!label || price === null) return null;

    return {
      label,
      code,
      price,
      isAvailable: toBoolean(segment.isAvailable ?? segment.available, true),
      sortOrder: Number(segment.sortOrder ?? index),
    };
  }

  const text = normalizeText(segment);
  if (!text) return null;

  const match = text.match(/^(.+?)(?:\s*[:=-]\s*|\s+)([\d,.]+)$/);
  if (!match) return null;

  const label = normalizeText(match[1]);
  const code = normalizeVariantCode(label, label);
  const price = toNumber(match[2]);

  if (!label || price === null) return null;

  return {
    label,
    code,
    price,
    isAvailable: true,
    sortOrder: index,
  };
}

function normalizeVariants(value) {
  return parseList(value)
    .flatMap((entry) => {
      if (typeof entry === "string" && entry.includes(",")) {
        return entry
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean);
      }
      return [entry];
    })
    .map(parseVariantSegment)
    .filter(Boolean)
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
}

function normalizeAddons(value) {
  return parseList(value)
    .flatMap((entry) => {
      if (typeof entry === "string" && entry.includes(",")) {
        return entry
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean);
      }
      return [entry];
    })
    .map((entry, index) => {
      if (typeof entry === "object" && entry !== null) {
        const name = normalizeText(entry.name || entry.label);
        const price = toNumber(entry.price ?? entry.amount ?? entry.value, 0);
        return name ? { name, price } : null;
      }

      const text = normalizeText(entry);
      if (!text) return null;

      const match = text.match(/^(.+?)(?:\s*[:=-]\s*|\s+)([\d,.]+)$/);
      if (!match) return null;

      return {
        name: normalizeText(match[1]),
        price: toNumber(match[2], 0),
        sortOrder: index,
      };
    })
    .filter(Boolean)
    .map(({ name, price }) => ({ name, price }));
}

function inferPricingType(variants, basePrice) {
  if (Array.isArray(variants) && variants.length) {
    const codes = new Set(variants.map((variant) => variant.code));
    if (codes.has("half") || codes.has("full")) return "half-full";
    if (codes.has("small") || codes.has("medium") || codes.has("large")) return "size-based";
    return "custom";
  }

  return basePrice !== null && basePrice !== undefined ? "single" : "custom";
}

function inferItemType(name, categoryName, explicitType) {
  const normalized = normalizeKey(`${name} ${categoryName}`);
  const given = normalizeKey(explicitType).replace(/\s+/g, "-");

  if (MenuItem.itemTypes.includes(given)) return given;
  if (normalized.includes("combo")) return "combo";
  if (normalized.includes("addon") || normalized.includes("add-on") || normalized.includes("extra")) return "addon";
  if (normalized.includes("mocktail") || normalized.includes("coffee") || normalized.includes("beverage")) return "beverage";
  if (normalized.includes("bread") || normalized.includes("naan") || normalized.includes("roti")) return "bread";
  if (normalized.includes("main course") || normalized.includes("thali") || normalized.includes("meal")) return "meal";

  return "regular";
}

function getDefaultPrice(item) {
  if (item.basePrice !== undefined && item.basePrice !== null && Number.isFinite(Number(item.basePrice))) {
    return Number(item.basePrice);
  }

  const variantPrices = (item.variants || [])
    .filter((variant) => variant.isAvailable !== false)
    .map((variant) => Number(variant.price))
    .filter(Number.isFinite);

  if (!variantPrices.length) return null;
  return Math.min(...variantPrices);
}

function isLegacyRequest(req) {
  return !String(req.baseUrl || "").includes("/v2/");
}

function formatCategory(category) {
  if (!category || typeof category !== "object") return null;

  return {
    _id: category._id,
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

function formatMenuItem(item, options = {}) {
  const category = formatCategory(item.category);
  const categoryName = category?.name || "Uncategorized";
  const defaultPrice = getDefaultPrice(item);

  return {
    _id: item._id,
    id: String(item._id),
    name: item.name,
    slug: item.slug,
    category: options.legacy ? categoryName : category,
    categoryId: category?.id || String(item.category || ""),
    categoryName,
    itemType: item.itemType,
    pricingType: item.pricingType,
    basePrice: item.basePrice,
    price: defaultPrice,
    variants: (item.variants || []).map((variant) => ({
      _id: variant._id,
      id: variant._id ? String(variant._id) : undefined,
      label: variant.label,
      code: variant.code,
      price: variant.price,
      isAvailable: variant.isAvailable,
      sortOrder: variant.sortOrder,
    })),
    addons: (item.addons || []).map((addon) => ({
      _id: addon._id,
      id: addon._id ? String(addon._id) : undefined,
      name: addon.name,
      price: addon.price,
    })),
    description: item.description || "",
    tags: item.tags || [],
    isRecommended: Boolean(item.isRecommended),
    isAvailable: item.isAvailable !== false,
    available: item.isAvailable !== false,
    isActive: item.isActive !== false,
    sortOrder: item.sortOrder || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function resolveCategory(identifier) {
  const value = normalizeText(identifier);
  if (!value) return null;

  if (mongoose.isValidObjectId(value)) {
    return Category.findById(value).select(CATEGORY_SELECT);
  }

  const normalizedName = Category.normalizeName(value);
  const slug = Category.slugify(value);

  return Category.findOne({
    $or: [{ name: normalizedName }, { slug }],
  })
    .collation({ locale: "en", strength: 2 })
    .select(CATEGORY_SELECT);
}

async function ensureCategory(identifier) {
  const category = await resolveCategory(identifier);
  if (!category) {
    throw httpError(400, "Category does not exist");
  }
  return category;
}

async function assertUniqueMenuName(name, categoryId, excludedId) {
  const query = {
    name: MenuItem.normalizeName(name),
    category: categoryId,
  };

  if (excludedId) {
    query._id = { $ne: excludedId };
  }

  const existing = await MenuItem.findOne(query).collation({ locale: "en", strength: 2 }).select("_id").lean();
  if (existing) {
    throw httpError(409, "Menu item already exists in this category");
  }
}

function buildMenuPayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || typeof body.name === "string") {
    payload.name = MenuItem.normalizeName(body.name);
  }

  if (!partial || body.itemType !== undefined) {
    const itemType = normalizeKey(body.itemType).replace(/\s+/g, "-");
    if (MenuItem.itemTypes.includes(itemType)) payload.itemType = itemType;
  }

  if (!partial || body.pricingType !== undefined) {
    const pricingType = normalizeKey(body.pricingType).replace(/\s+/g, "-");
    if (MenuItem.pricingTypes.includes(pricingType)) payload.pricingType = pricingType;
  }

  if (!partial || body.basePrice !== undefined || body.price !== undefined) {
    payload.basePrice = toNumber(body.basePrice ?? body.price, null);
  }

  if (!partial || body.variants !== undefined) {
    payload.variants = normalizeVariants(body.variants);
  }

  if (!partial || body.addons !== undefined) {
    payload.addons = normalizeAddons(body.addons);
  }

  if (!partial || typeof body.description === "string") {
    payload.description = normalizeText(body.description);
  }

  if (!partial || body.tags !== undefined) {
    payload.tags = normalizeTags(body.tags);
  }

  if (!partial || body.isRecommended !== undefined) {
    payload.isRecommended = toBoolean(body.isRecommended, false);
  }

  if (!partial || body.isAvailable !== undefined || body.available !== undefined) {
    payload.isAvailable = toBoolean(body.isAvailable ?? body.available, true);
  }

  if (!partial || body.isActive !== undefined) {
    payload.isActive = toBoolean(body.isActive, true);
  }

  if (!partial || body.sortOrder !== undefined) {
    payload.sortOrder = Number(body.sortOrder || 0);
  }

  if (!payload.pricingType && !partial) {
    payload.pricingType = inferPricingType(payload.variants, payload.basePrice);
  }

  if (!payload.itemType && !partial) {
    payload.itemType = "regular";
  }

  return payload;
}

function resolveSort(query) {
  const direction = String(query.order || "asc").toLowerCase() === "desc" ? -1 : 1;
  const sort = String(query.sort || "sortOrder").trim();

  if (sort === "name") return { name: direction };
  if (sort === "price") return { basePrice: direction, name: 1 };
  if (sort === "newest") return { createdAt: -1, name: 1 };
  if (sort === "category") return { category: direction, sortOrder: 1, name: 1 };

  return { sortOrder: direction, name: 1 };
}

async function getMenu(req, res) {
  const includeInactive = req.query.includeInactive === "true";
  const includeUnavailable = req.query.includeUnavailable === "true";
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
  const filter = {};

  if (!includeInactive) {
    filter.isActive = true;
  }

  if (req.query.available !== undefined) {
    filter.isAvailable = toBoolean(req.query.available, true);
  } else if (!includeUnavailable) {
    filter.isAvailable = true;
  }

  if (req.query.recommended !== undefined) {
    filter.isRecommended = toBoolean(req.query.recommended, true);
  }

  if (req.query.itemType) {
    filter.itemType = String(req.query.itemType).trim();
  }

  if (req.query.pricingType) {
    filter.pricingType = String(req.query.pricingType).trim();
  }

  if (req.query.category) {
    const category = await resolveCategory(req.query.category);
    if (!category) {
      return res.json({
        items: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }
    filter.category = category._id;
  }

  const search = normalizeText(req.query.search);
  if (search) {
    const slugSearch = MenuItem.slugify(search);
    const textRegex = new RegExp(escapeRegex(search), "i");
    const orConditions = [{ name: textRegex }, { description: textRegex }, { tags: textRegex }];

    if (slugSearch) {
      orConditions.unshift({ slug: new RegExp(`^${escapeRegex(slugSearch)}`, "i") });
    }

    filter.$or = orConditions;
  }

  const [items, total] = await Promise.all([
    MenuItem.find(filter)
      .select(ITEM_SELECT)
      .populate({ path: "category", select: CATEGORY_SELECT })
      .sort(resolveSort(req.query))
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MenuItem.countDocuments(filter),
  ]);

  return res.json({
    items: items.map((item) => formatMenuItem(item, { legacy: isLegacyRequest(req) })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

async function getMenuItem(req, res) {
  const item = await MenuItem.findById(req.params.id)
    .select(ITEM_SELECT)
    .populate({ path: "category", select: CATEGORY_SELECT })
    .lean();

  if (!item || (item.isActive === false && req.query.includeInactive !== "true")) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  return res.json({ item: formatMenuItem(item, { legacy: isLegacyRequest(req) }) });
}

async function createMenuItem(req, res) {
  const category = await ensureCategory(req.body.category);
  const payload = buildMenuPayload(req.body);

  payload.category = category._id;
  payload.itemType = payload.itemType || inferItemType(payload.name, category.name, req.body.itemType);
  payload.pricingType = payload.pricingType || inferPricingType(payload.variants, payload.basePrice);

  await assertUniqueMenuName(payload.name, payload.category);

  const created = await MenuItem.create(payload);
  const item = await MenuItem.findById(created._id)
    .select(ITEM_SELECT)
    .populate({ path: "category", select: CATEGORY_SELECT })
    .lean();

  return res.status(201).json({ item: formatMenuItem(item, { legacy: isLegacyRequest(req) }) });
}

async function updateMenuItem(req, res) {
  const item = await MenuItem.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  const payload = buildMenuPayload(req.body, { partial: true });
  let nextCategoryId = item.category;

  if (req.body.category !== undefined) {
    const category = await ensureCategory(req.body.category);
    payload.category = category._id;
    nextCategoryId = category._id;
  }

  if (payload.name || payload.category) {
    await assertUniqueMenuName(payload.name || item.name, nextCategoryId, item._id);
  }

  Object.assign(item, payload);
  await item.save();

  const updated = await MenuItem.findById(item._id)
    .select(ITEM_SELECT)
    .populate({ path: "category", select: CATEGORY_SELECT })
    .lean();

  return res.json({ item: formatMenuItem(updated, { legacy: isLegacyRequest(req) }) });
}

async function deleteMenuItem(req, res) {
  const deleted = await MenuItem.findByIdAndDelete(req.params.id).select("_id name").lean();
  if (!deleted) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  return res.json({
    message: "Menu item deleted",
    itemId: String(deleted._id),
    name: deleted.name,
  });
}

function pick(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => normalizeKey(candidate) === normalizeKey(name));
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }

  return undefined;
}

function variantsFromImportColumns(row) {
  const variants = [];
  const definitions = [
    ["half", ["half", "halfPrice", "half_price"]],
    ["full", ["full", "fullPrice", "full_price"]],
    ["small", ["small", "smallPrice", "small_price"]],
    ["medium", ["medium", "mediumPrice", "medium_price"]],
    ["large", ["large", "largePrice", "large_price"]],
  ];

  for (const [code, keys] of definitions) {
    const price = toNumber(pick(row, keys));
    if (price !== null) {
      variants.push({
        label: variantLabelFromCode(code),
        code,
        price,
        isAvailable: true,
        sortOrder: variants.length,
      });
    }
  }

  return variants;
}

function normalizeImportRow(rawRow, index) {
  const name = MenuItem.normalizeName(pick(rawRow, ["name", "item", "itemName", "menuItem"]));
  const categoryName = Category.normalizeName(pick(rawRow, ["category", "categoryName", "section"]) || "Uncategorized");
  const basePrice = toNumber(pick(rawRow, ["basePrice", "price", "singlePrice", "amount"]));
  const explicitVariants = normalizeVariants(pick(rawRow, ["variants", "variant", "sizes", "halfFull"]));
  const variants = explicitVariants.length ? explicitVariants : variantsFromImportColumns(rawRow);
  const pricingTypeInput = normalizeKey(pick(rawRow, ["pricingType", "priceType"])).replace(/\s+/g, "-");
  const itemTypeInput = pick(rawRow, ["itemType", "type"]);
  const pricingType = MenuItem.pricingTypes.includes(pricingTypeInput)
    ? pricingTypeInput
    : inferPricingType(variants, basePrice);

  return {
    rowNumber: index + 1,
    item: {
      name,
      categoryName,
      itemType: inferItemType(name, categoryName, itemTypeInput),
      pricingType,
      basePrice,
      variants,
      addons: normalizeAddons(pick(rawRow, ["addons", "extras", "addOns"])),
      description: normalizeText(pick(rawRow, ["description", "desc"])),
      tags: normalizeTags(pick(rawRow, ["tags"])),
      isRecommended: toBoolean(pick(rawRow, ["isRecommended", "recommended"]), false),
      isAvailable: toBoolean(pick(rawRow, ["isAvailable", "available"]), true),
      isActive: toBoolean(pick(rawRow, ["isActive", "active"]), true),
      sortOrder: Number(pick(rawRow, ["sortOrder", "order"]) || index),
    },
    errors: [],
    warnings: [],
  };
}

function validateImportCandidate(candidate) {
  const { item, errors, warnings } = candidate;

  if (!item.name || item.name.length < 2) errors.push("Valid item name is required");
  if (!item.categoryName || item.categoryName.length < 2) errors.push("Valid category is required");
  if (!MenuItem.itemTypes.includes(item.itemType)) errors.push("Invalid itemType");
  if (!MenuItem.pricingTypes.includes(item.pricingType)) errors.push("Invalid pricingType");

  const hasBasePrice = item.basePrice !== null && item.basePrice !== undefined;
  const hasVariants = item.variants.length > 0;

  if (item.pricingType === "single" && !hasBasePrice) {
    errors.push("basePrice is required for single pricing");
  }

  if ((item.pricingType === "half-full" || item.pricingType === "size-based") && !hasVariants) {
    errors.push("variants are required for half-full and size-based pricing");
  }

  if (!hasBasePrice && !hasVariants) {
    errors.push("Either basePrice or variants are required");
  }

  if (item.addons.some((addon) => addon.price < 0)) {
    errors.push("Addon prices cannot be negative");
  }

  if (item.variants.some((variant) => variant.price < 0)) {
    errors.push("Variant prices cannot be negative");
  }

  if (hasBasePrice && item.basePrice < 0) {
    errors.push("basePrice cannot be negative");
  }

  if (item.pricingType === "custom") {
    warnings.push("Custom pricing detected; verify the cashier UI supports this structure");
  }

  return candidate;
}

function parseMenuText(text) {
  const knownCategories = new Set([
    "pizza",
    "burger",
    "momos",
    "chaap",
    "rolls",
    "pasta",
    "chinese",
    "mocktails",
    "coffee",
    "combo meals",
    "main course",
    "addons",
    "extras",
    "breads",
  ]);
  const rows = [];
  let currentCategory = "Uncategorized";

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeText(line.replace(/\t/g, " ")))
    .filter(Boolean);

  for (const line of lines) {
    const lower = normalizeKey(line);
    const hasPrice = /(?:rs\.?|inr|₹)?\s*\d+(?:\.\d{1,2})?\b/i.test(line);
    const looksLikeCategory =
      !hasPrice &&
      line.length <= 60 &&
      (knownCategories.has(lower) || /^[a-zA-Z &/-]+$/.test(line));

    if (looksLikeCategory) {
      currentCategory = line;
      continue;
    }

    const row = parseMenuLine(line, currentCategory);
    if (row) rows.push(row);
  }

  return rows;
}

function parseMenuLine(line, currentCategory) {
  const categorySplit = line.match(/^(.+?)\s*(?:>|\/|:)\s*(.+)$/);
  let category = currentCategory;
  let text = line;

  if (categorySplit && !/\d/.test(categorySplit[1])) {
    category = normalizeText(categorySplit[1]);
    text = normalizeText(categorySplit[2]);
  }

  const variants = [];
  const variantPattern = /\b(half|full|small|medium|large)\b[^\d]{0,20}(\d+(?:\.\d{1,2})?)/gi;
  let firstVariantIndex = -1;
  let match = variantPattern.exec(text);

  while (match) {
    if (firstVariantIndex === -1) firstVariantIndex = match.index;
    const code = normalizeVariantCode(match[1], match[1]);
    variants.push({
      label: variantLabelFromCode(code),
      code,
      price: toNumber(match[2]),
      isAvailable: true,
      sortOrder: variants.length,
    });
    match = variantPattern.exec(text);
  }

  if (variants.length) {
    const name = normalizeText(text.slice(0, firstVariantIndex).replace(/[-|:]+$/g, ""));
    if (!name) return null;
    return {
      name,
      category,
      variants,
      pricingType: inferPricingType(variants),
    };
  }

  const priceMatch = text.match(/^(.*?)(?:\s+|-|:|₹|rs\.?|inr)\s*([\d,.]+)\s*$/i);
  if (!priceMatch) return null;

  const name = normalizeText(priceMatch[1].replace(/[-|:]+$/g, ""));
  const price = toNumber(priceMatch[2]);

  if (!name || price === null) return null;

  return {
    name,
    category,
    price,
    pricingType: "single",
  };
}

function rowsFromPdfText(text) {
  return parseMenuText(text).map((row) => ({
    name: row.name,
    category: row.category,
    pricingType: row.pricingType,
    price: row.price,
    variants: row.variants,
  }));
}

async function readImportRows(req) {
  if (req.file) {
    const originalName = String(req.file.originalname || "").toLowerCase();
    const mimeType = String(req.file.mimetype || "").toLowerCase();

    if (mimeType.includes("pdf") || originalName.endsWith(".pdf")) {
      const parsed = await pdfParse(req.file.buffer);
      return {
        source: { type: "pdf", fileName: req.file.originalname },
        rows: rowsFromPdfText(parsed.text),
      };
    }

    const csvText = req.file.buffer.toString("utf8");
    return {
      source: { type: "csv", fileName: req.file.originalname },
      rows: parseCsv(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }),
    };
  }

  if (Array.isArray(req.body.rows)) {
    return {
      source: { type: "json" },
      rows: req.body.rows,
    };
  }

  if (typeof req.body.rows === "string" && req.body.rows.trim()) {
    let rows;
    try {
      rows = JSON.parse(req.body.rows);
    } catch {
      throw httpError(400, "rows must be a valid JSON array");
    }

    if (!Array.isArray(rows)) {
      throw httpError(400, "rows must be a valid JSON array");
    }

    return {
      source: { type: "json" },
      rows,
    };
  }

  if (typeof req.body.csv === "string" || (req.body.fileType === "csv" && typeof req.body.content === "string")) {
    return {
      source: { type: "csv" },
      rows: parseCsv(req.body.csv || req.body.content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }),
    };
  }

  if (req.body.fileType === "pdf" && typeof req.body.content === "string") {
    const buffer = Buffer.from(req.body.content, req.body.encoding === "base64" ? "base64" : "utf8");
    const parsed = await pdfParse(buffer);
    return {
      source: { type: "pdf" },
      rows: rowsFromPdfText(parsed.text),
    };
  }

  throw httpError(400, "Upload a CSV/PDF file or send rows/csv/content in the request body");
}

async function analyzeImportRows(rawRows) {
  if (!rawRows.length) {
    throw httpError(400, "Import file does not contain menu rows");
  }

  if (rawRows.length > IMPORT_MAX_ROWS) {
    throw httpError(400, `Import is limited to ${IMPORT_MAX_ROWS} rows at a time`);
  }

  const candidates = rawRows.map(normalizeImportRow).map(validateImportCandidate);
  const categoryNames = [...new Set(candidates.map((candidate) => candidate.item.categoryName).filter(Boolean))];
  const categories = await Category.find({
    $or: categoryNames.flatMap((name) => [{ name: Category.normalizeName(name) }, { slug: Category.slugify(name) }]),
  })
    .collation({ locale: "en", strength: 2 })
    .select(CATEGORY_SELECT)
    .lean();

  const categoryByName = new Map();
  categories.forEach((category) => {
    categoryByName.set(normalizeKey(category.name), category);
    categoryByName.set(normalizeKey(category.slug), category);
  });

  const categoryIds = categories.map((category) => category._id);
  const existingItems = categoryIds.length
    ? await MenuItem.find({ category: { $in: categoryIds } }).select("_id name category").lean()
    : [];
  const existingItemKeys = new Map();

  existingItems.forEach((item) => {
    existingItemKeys.set(`${normalizeKey(item.name)}::${String(item.category)}`, item);
  });

  const seenImportKeys = new Map();
  const missingCategories = new Map();

  for (const candidate of candidates) {
    const category =
      categoryByName.get(normalizeKey(candidate.item.categoryName)) ||
      categoryByName.get(normalizeKey(Category.slugify(candidate.item.categoryName)));

    candidate.category = category
      ? {
          _id: category._id,
          id: String(category._id),
          name: category.name,
          slug: category.slug,
          isExisting: true,
        }
      : null;

    if (!category) {
      missingCategories.set(normalizeKey(candidate.item.categoryName), candidate.item.categoryName);
    }

    const importKey = `${normalizeKey(candidate.item.name)}::${normalizeKey(candidate.item.categoryName)}`;
    if (seenImportKeys.has(importKey)) {
      candidate.errors.push(`Duplicate row in import file; first seen at row ${seenImportKeys.get(importKey)}`);
    } else {
      seenImportKeys.set(importKey, candidate.rowNumber);
    }

    if (category) {
      const existingItem = existingItemKeys.get(`${normalizeKey(candidate.item.name)}::${String(category._id)}`);
      if (existingItem) {
        candidate.errors.push("Menu item already exists in this category");
        candidate.duplicate = {
          type: "existing",
          itemId: String(existingItem._id),
        };
      }
    }

    candidate.status = candidate.errors.length ? "invalid" : "valid";
  }

  const validRows = candidates.filter((candidate) => candidate.status === "valid").length;
  const invalidRows = candidates.length - validRows;

  return {
    rows: candidates,
    missingCategories: [...missingCategories.values()].map((name) => ({
      name,
      slug: Category.slugify(name),
    })),
    summary: {
      totalRows: candidates.length,
      validRows,
      invalidRows,
      duplicateRows: candidates.filter((candidate) => candidate.duplicate).length,
      missingCategoryCount: missingCategories.size,
    },
  };
}

async function previewMenuImport(req, res) {
  const { source, rows } = await readImportRows(req);
  const analysis = await analyzeImportRows(rows);

  return res.json({
    source,
    canImport: analysis.summary.invalidRows === 0,
    ...analysis,
  });
}

async function commitMenuImport(req, res) {
  const autoCreateCategories = toBoolean(req.body.autoCreateCategories, true);
  const { source, rows } = await readImportRows(req);
  const analysis = await analyzeImportRows(rows);

  if (analysis.summary.invalidRows > 0) {
    return res.status(409).json({
      message: "Import contains invalid or duplicate rows. Preview and fix before saving.",
      source,
      ...analysis,
    });
  }

  if (analysis.missingCategories.length && !autoCreateCategories) {
    return res.status(400).json({
      message: "Import contains missing categories",
      missingCategories: analysis.missingCategories,
    });
  }

  const createdCategoryMap = new Map();
  for (const missingCategory of analysis.missingCategories) {
    const category = await Category.create({ name: missingCategory.name });
    createdCategoryMap.set(normalizeKey(missingCategory.name), category);
  }

  const docs = analysis.rows.map((candidate) => {
    const category =
      candidate.category ||
      (() => {
        const created = createdCategoryMap.get(normalizeKey(candidate.item.categoryName));
        return {
          _id: created._id,
          id: String(created._id),
          name: created.name,
          slug: created.slug,
        };
      })();

    return {
      name: candidate.item.name,
      category: category._id,
      itemType: candidate.item.itemType,
      pricingType: candidate.item.pricingType,
      basePrice: candidate.item.basePrice,
      variants: candidate.item.variants,
      addons: candidate.item.addons,
      description: candidate.item.description,
      tags: candidate.item.tags,
      isRecommended: candidate.item.isRecommended,
      isAvailable: candidate.item.isAvailable,
      isActive: candidate.item.isActive,
      sortOrder: candidate.item.sortOrder,
    };
  });

  const inserted = await MenuItem.insertMany(docs, { ordered: true });
  const items = await MenuItem.find({ _id: { $in: inserted.map((item) => item._id) } })
    .select(ITEM_SELECT)
    .populate({ path: "category", select: CATEGORY_SELECT })
    .sort({ category: 1, sortOrder: 1, name: 1 })
    .lean();

  return res.status(201).json({
    message: "Menu import completed",
    source,
    createdCategories: [...createdCategoryMap.values()].map((category) => ({
      _id: category._id,
      id: String(category._id),
      name: category.name,
      slug: category.slug,
    })),
    insertedCount: inserted.length,
    items: items.map((item) => formatMenuItem(item, { legacy: false })),
  });
}

module.exports = {
  getMenu: asyncHandler(getMenu),
  getMenuItem: asyncHandler(getMenuItem),
  createMenuItem: asyncHandler(createMenuItem),
  updateMenuItem: asyncHandler(updateMenuItem),
  deleteMenuItem: asyncHandler(deleteMenuItem),
  previewMenuImport: asyncHandler(previewMenuImport),
  commitMenuImport: asyncHandler(commitMenuImport),
};
