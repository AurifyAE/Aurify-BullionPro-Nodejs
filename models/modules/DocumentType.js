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
DocumentTypeSchema.statics.isNameExists = async function (name, excludeId = null) {
  const query = { name: new RegExp(`^${name.trim()}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

const DocumentType = mongoose.model("DocumentType", DocumentTypeSchema);
export default DocumentType;

