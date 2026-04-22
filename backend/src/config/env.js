const dotenv = require("dotenv");

dotenv.config();

const required = ["MONGODB_URI", "JWT_SECRET", "ADMIN_EMAIL", "ALLOWED_ORIGINS"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || "12h",
  adminEmail: process.env.ADMIN_EMAIL.toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  allowedOrigins: process.env.ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
