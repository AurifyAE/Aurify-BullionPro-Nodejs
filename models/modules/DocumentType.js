// src/models/modules/DocumentType.js

import mongoose from "mongoose";

const DocumentTypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [5, "Code cannot exceed 5 characters"],
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Document type name is required"],
      trim: true,
      unique: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    status: {
      type: Boolean,
      default: true,
    },
    validationProperties: {
      minLength: {
        type: Number,
        default: null,
      },
      maxLength: {
        type: Number,
        default: null,
      },
   
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
DocumentTypeSchema.pre("save", async function (next) {
  if (this.isNew && this.name && !this.code) {
    try {
      // Extract first 2 alphabetic characters from name
      let prefix = this.name.trim().replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
      
      // Fallback if name doesn't have 2 letters
      if (prefix.length < 2) {
        prefix = "DT"; // Default prefix for Document Type
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
DocumentTypeSchema.statics.isNameExists = async function (name, excludeId = null) {
  const query = { name: new RegExp(`^${name.trim()}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

const DocumentType = mongoose.model("DocumentType", DocumentTypeSchema);
export default DocumentType;

