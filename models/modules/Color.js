import mongoose from "mongoose";

// Color Schema
const ColorSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Color code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Color code cannot exceed 10 characters"],
      match: [/^[A-Z0-9]+$/, "Color code should contain only uppercase letters and numbers"]
    },
    description: {
      type: String,
      required: [true, "Color description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"]
    },
    isActive: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active"
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound index for code uniqueness within subcategory
ColorSchema.index({ code: 1 }, { unique: true });
ColorSchema.index({ status: 1 });
ColorSchema.index({ isActive: 1 });
ColorSchema.index({ createdAt: -1 });

// Pre-save middleware
ColorSchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to check if code exists within subcategory
ColorSchema.statics.isCodeExists = async function(code, excludeId = null) {
  const query = { 
    code: code.toUpperCase(),
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const color = await this.findOne(query);
  return !!color;
};

const Color = mongoose.model("Color", ColorSchema);
export default Color;