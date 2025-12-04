import { getTenantDb } from "../config/tenantDb.js";

export const tenantMiddleware = async (req, res, next) => {
  try {
    const dbName = req.admin?.dbName;

    if (!dbName) {
      return res.status(400).json({ message: "Database not assigned to admin" });
    }

    req.db = await getTenantDb(dbName);
    next();

  } catch (err) {
    console.log("Tenant DB error:", err);
    res.status(500).json({ message: "DB connection failed" });
  }
};
