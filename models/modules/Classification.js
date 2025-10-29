// src/models/modules/Classification.js

import mongoose from "mongoose";

const ClassificationSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [5, "Code cannot exceed 5 characters"],
      match: [/^[A-Z]{2}\d{3}$/, "Code must be 2 letters + 3 digits (e.g., RE123)"],
      unique: true, // Ensure no duplicate codes
    },
    name: {
      type: String,
      required: [true, "Classification name is required"],
      trim: true,
      unique: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    status: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// === AUTO-GENERATE CODE: First 2 letters + 3 random digits ===
ClassificationSchema.pre("save", async function (next) {
  if (this.isNew && this.name && !this.code) {
    const prefix = this.name.trim().slice(0, 2).toUpperCase();
    let code;
    let isUnique = false;

    // Keep generating until we get a unique code
    while (!isUnique) {
      const randomNum = Math.floor(100 + Math.random() * 900); // 100-999
      code = `${prefix}${randomNum}`;
      const exists = await this.constructor.findOne({ code });
      if (!exists) isUnique = true;
    }

    this.code = code;
  }
  next();
});

// Static: Check if name exists
ClassificationSchema.statics.isNameExists = async function (name, excludeId = null) {
  const query = { name: new RegExp(`^${name.trim()}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

const Classification = mongoose.model("Classification", ClassificationSchema);
export default Classification;