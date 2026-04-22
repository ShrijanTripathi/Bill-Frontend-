const { body } = require("express-validator");
const express = require("express");
const { login, logout, me, googleLogin } = require("../controllers/authController");
const validateRequest = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isString().isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validateRequest,
  login
);

router.post(
  "/google",
  [body("idToken").isString().notEmpty().withMessage("Google token is required")],
  validateRequest,
  googleLogin
);

router.post("/logout", logout);
router.get("/me", requireAuth, me);

module.exports = router;
