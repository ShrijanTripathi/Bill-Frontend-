const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const Admin = require("../models/Admin");
const env = require("../config/env");
const { signToken } = require("../utils/jwt");

const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

function setAuthCookie(res, token) {
  res.cookie("bjfa_admin_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 1000 * 60 * 60 * 12,
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  if (normalizedEmail !== env.adminEmail) {
    return res.status(403).json({ message: "Only the authorized admin can log in" });
  }

  const admin = await Admin.findOne({ email: normalizedEmail });
  if (!admin || !admin.passwordHash) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken({ sub: admin._id.toString(), role: admin.role });
  setAuthCookie(res, token);

  return res.json({
    admin: {
      email: admin.email,
      role: admin.role,
      authProvider: admin.authProvider,
    },
  });
}

async function googleLogin(req, res) {
  if (!googleClient) {
    return res.status(400).json({ message: "Google auth is not configured" });
  }

  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: "Missing Google token" });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.googleClientId,
  });

  const payload = ticket.getPayload();
  const googleEmail = payload?.email?.toLowerCase();
  if (!googleEmail) {
    return res.status(401).json({ message: "Google authentication failed" });
  }
  if (googleEmail !== env.adminEmail) {
    return res.status(403).json({ message: "Only the authorized admin can log in" });
  }

  const totalAdmins = await Admin.countDocuments();
  let admin = await Admin.findOne({ email: googleEmail });

  if (!admin) {
    if (totalAdmins > 0 || googleEmail !== env.adminEmail) {
      return res.status(403).json({ message: "Only the authorized admin email can log in" });
    }

    admin = await Admin.create({
      email: googleEmail,
      role: "head_admin",
      authProvider: "google",
      passwordHash: "",
    });
  }

  const token = signToken({ sub: admin._id.toString(), role: admin.role });
  setAuthCookie(res, token);

  return res.json({
    admin: {
      email: admin.email,
      role: admin.role,
      authProvider: admin.authProvider,
    },
  });
}

async function me(req, res) {
  return res.json({
    admin: {
      email: req.admin.email,
      role: req.admin.role,
      authProvider: req.admin.authProvider,
    },
  });
}

function logout(req, res) {
  res.clearCookie("bjfa_admin_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
  });
  return res.json({ message: "Logged out" });
}

module.exports = {
  login,
  googleLogin,
  me,
  logout,
};
