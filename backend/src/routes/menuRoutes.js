const express = require("express");
const { body, param, query } = require("express-validator");
const {
  getMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../controllers/menuController");
const validateRequest = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/",
  [
    query("includeUnavailable").optional().isBoolean().withMessage("includeUnavailable must be boolean"),
    query("search").optional().isString(),
    query("category").optional().isString(),
  ],
  validateRequest,
  getMenu
);

router.post(
  "/",
  requireAuth,
  [
    body("name").isString().trim().isLength({ min: 2, max: 120 }).withMessage("Valid name is required"),
    body("price").isFloat({ min: 0 }).withMessage("Price must be a positive number"),
    body("category").isString().trim().isLength({ min: 2, max: 60 }).withMessage("Valid category is required"),
    body("available").optional().isBoolean(),
    body("description").optional().isString().isLength({ max: 500 }),
  ],
  validateRequest,
  createMenuItem
);

router.put(
  "/:id",
  requireAuth,
  [
    param("id").isMongoId().withMessage("Invalid id"),
    body("name").optional().isString().trim().isLength({ min: 2, max: 120 }),
    body("price").optional().isFloat({ min: 0 }),
    body("category").optional().isString().trim().isLength({ min: 2, max: 60 }),
    body("available").optional().isBoolean(),
    body("description").optional().isString().isLength({ max: 500 }),
  ],
  validateRequest,
  updateMenuItem
);

router.delete(
  "/:id",
  requireAuth,
  [param("id").isMongoId().withMessage("Invalid id")],
  validateRequest,
  deleteMenuItem
);

module.exports = router;
