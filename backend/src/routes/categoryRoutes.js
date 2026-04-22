const express = require("express");
const { body, param } = require("express-validator");
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const validateRequest = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", getCategories);

router.post(
  "/",
  requireAuth,
  [body("name").isString().trim().isLength({ min: 2, max: 60 }).withMessage("Category name is required")],
  validateRequest,
  createCategory
);

router.put(
  "/:id",
  requireAuth,
  [
    param("id").isMongoId().withMessage("Invalid id"),
    body("name").isString().trim().isLength({ min: 2, max: 60 }).withMessage("Category name is required"),
  ],
  validateRequest,
  updateCategory
);

router.delete(
  "/:id",
  requireAuth,
  [param("id").isMongoId().withMessage("Invalid id")],
  validateRequest,
  deleteCategory
);

module.exports = router;
