const express = require("express");
const multer = require("multer");
const { body, param, query } = require("express-validator");
const {
  getMenu,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  previewMenuImport,
  commitMenuImport,
} = require("../controllers/menuController");
const validateRequest = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const ITEM_TYPES = ["regular", "combo", "addon", "beverage", "bread", "meal"];
const PRICING_TYPES = ["single", "half-full", "size-based", "custom"];
const VARIANT_CODES = ["half", "full", "small", "medium", "large", "custom"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter(req, file, callback) {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const originalName = String(file.originalname || "").toLowerCase();
    const isCsv = mimeType.includes("csv") || mimeType.includes("text/plain") || originalName.endsWith(".csv");
    const isPdf = mimeType.includes("pdf") || originalName.endsWith(".pdf");

    if (!isCsv && !isPdf) {
      return callback(new Error("Only CSV and PDF files are supported"));
    }

    return callback(null, true);
  },
});

function uploadMenuFile(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(400).json({ message: error.message || "Invalid upload" });
  });
}

function hasVariants(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function hasPrice(value) {
  return value !== undefined && value !== null && value !== "";
}

function validatePricingPayload(value) {
  const hasBasePrice = hasPrice(value.basePrice) || hasPrice(value.price);
  const hasVariantRows = hasVariants(value.variants);

  if (!hasBasePrice && !hasVariantRows) {
    throw new Error("Either basePrice or variants are required");
  }

  if (value.pricingType === "single" && !hasBasePrice) {
    throw new Error("basePrice is required for single pricing");
  }

  if ((value.pricingType === "half-full" || value.pricingType === "size-based") && !hasVariantRows) {
    throw new Error("variants are required for half-full and size-based pricing");
  }

  return true;
}

function validatePartialPricingPayload(value) {
  const touchesPricing =
    value.pricingType !== undefined ||
    value.basePrice !== undefined ||
    value.price !== undefined ||
    value.variants !== undefined;

  if (!touchesPricing) return true;

  const pricingType = value.pricingType;
  const hasBasePrice = hasPrice(value.basePrice) || hasPrice(value.price);
  const hasVariantRows = value.variants === undefined ? true : hasVariants(value.variants);

  if (pricingType === "single" && !hasBasePrice && value.variants !== undefined) {
    throw new Error("basePrice is required for single pricing");
  }

  if ((pricingType === "half-full" || pricingType === "size-based") && !hasVariantRows) {
    throw new Error("variants are required for half-full and size-based pricing");
  }

  return true;
}

function validateVariantList(value) {
  if (value === undefined) return true;
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) throw new Error("variants must be an array or parseable string");

  value.forEach((variant) => {
    if (!variant || typeof variant !== "object") throw new Error("Each variant must be an object");
    if (!variant.label && !variant.name && !variant.size) throw new Error("Each variant needs a label");
    if (variant.code !== undefined && !VARIANT_CODES.includes(variant.code)) throw new Error("Invalid variant code");
    if (variant.price === undefined || Number(variant.price) < 0) throw new Error("Each variant needs a valid price");
  });

  return true;
}

function validateAddonList(value) {
  if (value === undefined) return true;
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) throw new Error("addons must be an array or parseable string");

  value.forEach((addon) => {
    if (!addon || typeof addon !== "object") throw new Error("Each addon must be an object");
    if (!addon.name && !addon.label) throw new Error("Each addon needs a name");
    if (addon.price === undefined || Number(addon.price) < 0) throw new Error("Each addon needs a valid price");
  });

  return true;
}

function hasImportPayload(value, { req }) {
  if (req.file) return true;
  if (Array.isArray(value.rows) && value.rows.length > 0) return true;
  if (typeof value.rows === "string" && value.rows.trim()) return true;
  if (typeof value.csv === "string" && value.csv.trim()) return true;
  if (typeof value.content === "string" && value.content.trim()) return true;

  throw new Error("Upload a CSV/PDF file or send rows/csv/content");
}

const createMenuValidators = [
  body("name").isString().trim().isLength({ min: 2, max: 120 }).withMessage("Valid name is required"),
  body("category").isString().trim().notEmpty().withMessage("Valid category is required"),
  body("itemType").optional().isIn(ITEM_TYPES).withMessage("Invalid itemType"),
  body("pricingType").optional().isIn(PRICING_TYPES).withMessage("Invalid pricingType"),
  body("basePrice").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("basePrice must be non-negative"),
  body("price").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("price must be non-negative"),
  body("variants").optional().custom(validateVariantList),
  body("addons").optional().custom(validateAddonList),
  body("description").optional().isString().isLength({ max: 1000 }).withMessage("description is too long"),
  body("tags").optional(),
  body("isRecommended").optional().isBoolean().withMessage("isRecommended must be boolean"),
  body("isAvailable").optional().isBoolean().withMessage("isAvailable must be boolean"),
  body("available").optional().isBoolean().withMessage("available must be boolean"),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  body("sortOrder").optional().isInt({ min: 0 }).withMessage("sortOrder must be a non-negative integer"),
  body().custom(validatePricingPayload),
];

const updateMenuValidators = [
  param("id").isMongoId().withMessage("Invalid menu item id"),
  body("name").optional().isString().trim().isLength({ min: 2, max: 120 }).withMessage("Valid name is required"),
  body("category").optional().isString().trim().notEmpty().withMessage("Valid category is required"),
  body("itemType").optional().isIn(ITEM_TYPES).withMessage("Invalid itemType"),
  body("pricingType").optional().isIn(PRICING_TYPES).withMessage("Invalid pricingType"),
  body("basePrice").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("basePrice must be non-negative"),
  body("price").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("price must be non-negative"),
  body("variants").optional().custom(validateVariantList),
  body("addons").optional().custom(validateAddonList),
  body("description").optional().isString().isLength({ max: 1000 }).withMessage("description is too long"),
  body("tags").optional(),
  body("isRecommended").optional().isBoolean().withMessage("isRecommended must be boolean"),
  body("isAvailable").optional().isBoolean().withMessage("isAvailable must be boolean"),
  body("available").optional().isBoolean().withMessage("available must be boolean"),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  body("sortOrder").optional().isInt({ min: 0 }).withMessage("sortOrder must be a non-negative integer"),
  body().custom(validatePartialPricingPayload),
];

router.get(
  "/",
  [
    query("category").optional().isString(),
    query("search").optional().isString().trim().isLength({ max: 120 }),
    query("recommended").optional().isBoolean().withMessage("recommended must be boolean"),
    query("available").optional().isBoolean().withMessage("available must be boolean"),
    query("includeUnavailable").optional().isBoolean().withMessage("includeUnavailable must be boolean"),
    query("includeInactive").optional().isBoolean().withMessage("includeInactive must be boolean"),
    query("itemType").optional().isIn(ITEM_TYPES).withMessage("Invalid itemType"),
    query("pricingType").optional().isIn(PRICING_TYPES).withMessage("Invalid pricingType"),
    query("page").optional().isInt({ min: 1 }).withMessage("page must be positive"),
    query("limit").optional().isInt({ min: 1, max: 500 }).withMessage("limit must be between 1 and 500"),
    query("sort").optional().isIn(["sortOrder", "name", "price", "newest", "category"]).withMessage("Invalid sort"),
    query("order").optional().isIn(["asc", "desc"]).withMessage("Invalid order"),
  ],
  validateRequest,
  getMenu
);

router.post(
  "/import/preview",
  requireAuth,
  uploadMenuFile,
  [
    body().custom(hasImportPayload),
    body("autoCreateCategories").optional().isBoolean().withMessage("autoCreateCategories must be boolean"),
    body("fileType").optional().isIn(["csv", "pdf"]).withMessage("fileType must be csv or pdf"),
    body("encoding").optional().isIn(["utf8", "base64"]).withMessage("encoding must be utf8 or base64"),
  ],
  validateRequest,
  previewMenuImport
);

router.post(
  "/import/commit",
  requireAuth,
  uploadMenuFile,
  [
    body().custom(hasImportPayload),
    body("autoCreateCategories").optional().isBoolean().withMessage("autoCreateCategories must be boolean"),
    body("fileType").optional().isIn(["csv", "pdf"]).withMessage("fileType must be csv or pdf"),
    body("encoding").optional().isIn(["utf8", "base64"]).withMessage("encoding must be utf8 or base64"),
  ],
  validateRequest,
  commitMenuImport
);

router.get(
  "/:id",
  [
    param("id").isMongoId().withMessage("Invalid menu item id"),
    query("includeInactive").optional().isBoolean().withMessage("includeInactive must be boolean"),
  ],
  validateRequest,
  getMenuItem
);

router.post("/", requireAuth, createMenuValidators, validateRequest, createMenuItem);

router.put("/:id", requireAuth, updateMenuValidators, validateRequest, updateMenuItem);

router.delete(
  "/:id",
  requireAuth,
  [param("id").isMongoId().withMessage("Invalid menu item id")],
  validateRequest,
  deleteMenuItem
);

module.exports = router;
