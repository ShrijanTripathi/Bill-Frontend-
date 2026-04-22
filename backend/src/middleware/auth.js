const Admin = require("../models/Admin");
const env = require("../config/env");
const { verifyToken } = require("../utils/jwt");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.replace("Bearer ", "") : "";
    const token = req.cookies.bjfa_admin_token || bearer;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token);
    const admin = await Admin.findById(decoded.sub).select("email role authProvider");

    if (!admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (admin.email !== env.adminEmail) {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.admin = admin;
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

module.exports = { requireAuth };
