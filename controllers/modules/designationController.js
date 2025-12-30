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

export const getAllDesignations = async (req, res, next) => {
  try {
    console.log("on here")
    const designations = await Designation.find({ status: "active" })
      .select("name status permissions createdAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: designations,
    });
  } catch (err) {
    next(err);
  }
};

export const getDesignationById = async (req, res, next) => {
  try {
    const designation = await Designation.findById(req.params.id);

    if (!designation) {
      return res.status(404).json({ message: "Designation not found" });
    }

    res.status(200).json({
      success: true,
      data: designation,
    });
  } catch (err) {
    next(err);
  }
};
