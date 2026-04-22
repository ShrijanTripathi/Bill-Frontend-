const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const env = require("./config/env");
const connectDb = require("./config/db");
const seedAdmin = require("./utils/seedAdmin");

const authRoutes = require("./routes/authRoutes");
const menuRoutes = require("./routes/menuRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const salesRoutes = require("./routes/salesRoutes");

const app = express();
let isDatabaseReady = false;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/api/health", (_, res) => {
  res.json({
    status: isDatabaseReady ? "ok" : "degraded",
    database: isDatabaseReady ? "connected" : "disconnected",
  });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  if (!isDatabaseReady) {
    return res.status(503).json({
      message: "Backend is running but database is unavailable. Please check MongoDB connection.",
    });
  }
  return next();
});

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/sales", salesRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
});

async function initDatabaseWithRetry(retryDelayMs = 5000) {
  try {
    await connectDb();
    await seedAdmin();
    isDatabaseReady = true;
    process.stdout.write("Database connected and seed completed.\n");
  } catch (error) {
    isDatabaseReady = false;
    console.error("Database connection failed. Retrying...", error.message || error);
    setTimeout(() => initDatabaseWithRetry(retryDelayMs), retryDelayMs);
  }
}

async function start() {
  app.listen(env.port, () => {
    process.stdout.write(`Backend running on port ${env.port}\n`);
  });
  initDatabaseWithRetry();
}

start().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
