import Designation from "../../models/modules/Designation.js";

export const createDesignation = async (req, res) => {
  try {
    const { name, status, permissions } = req.body;

    // 1️⃣ Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Designation name is required" });
    }

    if (!permissions || Object.keys(permissions).length === 0) {
      return res.status(400).json({ message: "At least one permission is required" });
    }

    // 2️⃣ Check duplicate
    const exists = await Designation.findOne({ name: name.trim() });
    if (exists) {
      return res.status(409).json({ message: "Designation already exists" });
    }

    // 3️⃣ Save
    const designation = await Designation.create({
      name: name.trim(),
      status,
      permissions,
    });

    return res.status(201).json({
      message: "Designation created successfully",
      data: designation,
    });
  } catch (err) {
    console.error("CREATE DESIGNATION ERROR", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
