// src/models/modules/Salesman.js
import mongoose from "mongoose";

const SalesmanSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [6, "Code cannot exceed 6 characters"],
      match: [/^[A-Z]{2,3}\d{3}$/, "Code must be 2-3 letters + 3 digits (e.g., SM001, SAL123)"],
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Salesman name is required"],
      trim: true,
      unique: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/,
        "Please enter a valid email address",
      ],
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      match: [
        /^[0-9+()\-\s]{7,20}$/,
        "Phone must be 7-20 digits and can include + ( ) -",
      ],
      default: null,
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

// Auto-generate code: First 2-3 letters of name + 3 digits
SalesmanSchema.pre("save", async function (next) {
  if (this.isNew && this.name && !this.code) {
    try {
      // Extract only alphabetic characters from name and take first 2-3 letters
      let prefix = this.name.trim().replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
      
      // Fallback to "SM" if we don't have at least 2 letters
      if (prefix.length < 2) {
        prefix = "SM";
      } else if (prefix.length === 2) {
        // Keep 2 letters for format: XX123
        prefix = prefix.slice(0, 2);
      } else {
        // Use 3 letters for format: XXX123 (but match pattern allows 2-3)
        prefix = prefix.slice(0, 3);
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

// Check duplicate name (case-insensitive)
SalesmanSchema.statics.isNameExists = async function (name, excludeId = null) {
  const query = { name: new RegExp(`^${name.trim()}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

const Salesman = mongoose.model("Salesman", SalesmanSchema);
export default Salesman;