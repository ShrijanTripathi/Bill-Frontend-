const express = require("express");
const { body, param, query } = require("express-validator");
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const validateRequest = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function hasAtLeastOneUpdate(value) {
  const allowedFields = ["name", "sortOrder", "isActive"];
  return allowedFields.some((field) => value[field] !== undefined);
}

router.get(
  "/",
  [
    query("includeInactive").optional().isBoolean().withMessage("includeInactive must be boolean"),
    query("active").optional().isBoolean().withMessage("active must be boolean"),
  ],
  validateRequest,
  getCategories
);

router.post(
  "/",
  requireAuth,
  [
    body("name").isString().trim().isLength({ min: 2, max: 60 }).withMessage("Category name is required"),
    body("sortOrder").optional().isInt({ min: 0 }).withMessage("sortOrder must be a non-negative integer"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  ],
  validateRequest,
  createCategory
);

router.put(
  "/:id",
  requireAuth,
  [
    param("id").isMongoId().withMessage("Invalid category id"),
    body().custom((value) => {
      if (!hasAtLeastOneUpdate(value)) {
        throw new Error("At least one category field is required");
      }
      return true;
    }),
    body("name").optional().isString().trim().isLength({ min: 2, max: 60 }).withMessage("Valid name is required"),
    body("sortOrder").optional().isInt({ min: 0 }).withMessage("sortOrder must be a non-negative integer"),
    body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  ],
  validateRequest,
  updateCategory
);

router.delete(
  "/:id",
  requireAuth,
  [param("id").isMongoId().withMessage("Invalid category id")],
  validateRequest,
  deleteCategory
);

module.exports = router;
