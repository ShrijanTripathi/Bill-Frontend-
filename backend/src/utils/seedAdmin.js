const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const env = require("../config/env");

async function seedAdmin() {
  const admins = await Admin.find().sort({ createdAt: 1 });

  if (admins.length === 0) {
    if (!env.adminPassword) {
      console.warn("ADMIN_PASSWORD not set; local password login will be disabled until configured.");
      await Admin.create({
        email: env.adminEmail,
        role: "head_admin",
        authProvider: "google",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(env.adminPassword, 12);
    await Admin.create({
      email: env.adminEmail,
      passwordHash,
      role: "head_admin",
      authProvider: "local",
    });
    return;
  }

  if (admins.length > 1) {
    console.error("More than one admin found. Keeping the earliest admin only is recommended.");
  }

  if (admins[0].email !== env.adminEmail) {
    console.warn(
      `Seed admin email (${env.adminEmail}) does not match existing admin (${admins[0].email}). Existing admin will be used.`
    );
  }
}

module.exports = seedAdmin;
