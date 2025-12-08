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
    try {
      // Extract first 2 alphabetic characters from name
      let prefix = this.name.trim().replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
      
      // Fallback if name doesn't have 2 letters
      if (prefix.length < 2) {
        prefix = "CL"; // Default prefix for Classification
      }

      let code;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loop

      // Keep generating until we get a unique code
      while (!isUnique && attempts < maxAttempts) {
        const randomNum = Math.floor(100 + Math.random() * 900); // 100-999
        code = `${prefix}${String(randomNum).padStart(3, '0')}`;
        
        // Check if this code already exists
        const exists = await this.constructor.findOne({ code });
        if (!exists) {
          isUnique = true;
        } else {
          attempts++;
        }
      }

      if (!isUnique) {
        return next(new Error("Unable to generate unique code after multiple attempts. Please try again."));
      }

      this.code = code;
    } catch (error) {
      return next(error);
    }
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