const express = require("express");
const { body, query } = require("express-validator");
const { param } = require("express-validator");
const {
  createSale,
  listSales,
  deleteOfflineSale,
  streamSalesEvents,
  getSalesAnalytics,
  exportSalesByFilter,
  bulkDeleteSales,
} = require("../controllers/salesController");
const validateRequest = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/",
  [
    body("billNo").isNumeric().withMessage("billNo must be numeric"),
    body("tokenNo").isNumeric().withMessage("tokenNo must be numeric"),
    body("items").isArray({ min: 1 }).withMessage("items must contain at least one line item"),
    body("saleType").optional().isIn(["ONLINE", "OFFLINE"]),
    body("discountPercent").optional().isFloat({ min: 0, max: 100 }),
    body("billedAt").optional().isISO8601().withMessage("billedAt must be a valid ISO datetime"),
  ],
  validateRequest,
  createSale
);

router.get(
  "/",
  requireAuth,
  [
    query("saleType").optional().isIn(["ONLINE", "OFFLINE"]),
    query("includeDeleted").optional().isBoolean(),
    query("limit").optional().isInt({ min: 1, max: 200 }),
  ],
  validateRequest,
  listSales
);

router.patch(
  "/:id/delete",
  requireAuth,
  [
    param("id").isMongoId().withMessage("Invalid sale id"),
  ],
  validateRequest,
  deleteOfflineSale
);

router.get("/stream", requireAuth, streamSalesEvents);

router.get(
  "/export",
  requireAuth,
  [
    query("filter")
      .optional()
      .isIn(["today", "week", "month"])
      .withMessage("filter must be one of today, week or month"),
    query("timeZone")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("timeZone must be a valid IANA timezone string"),
  ],
  validateRequest,
  exportSalesByFilter
);

router.get(
  "/analytics",
  requireAuth,
  [
    query("period")
      .optional()
      .isIn(["today", "week", "month"])
      .withMessage("period must be one of today, week or month"),
    query("timeZone")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("timeZone must be a valid IANA timezone string"),
  ],
  validateRequest,
  getSalesAnalytics
);

router.delete(
  "/bulk-delete",
  requireAuth,
  [
    body("filter")
      .isIn(["today", "week", "month"])
      .withMessage("filter must be one of today, week or month"),
    body("timeZone")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("timeZone must be a valid IANA timezone string"),
  ],
  validateRequest,
  bulkDeleteSales
);

module.exports = router;
