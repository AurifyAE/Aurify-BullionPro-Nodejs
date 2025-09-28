import mongoose from "mongoose";

const SizeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Size code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Size code cannot exceed 10 characters"],
      match: [
        /^[A-Z0-9]+$/,
        "Size code should contain only uppercase letters and numbers",
      ],
    },
    description: {
      type: String,
      required: [true, "Size description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
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
// Compound index for code uniqueness within subcategory
SizeSchema.index({ code: 1 }, { unique: true });
SizeSchema.index({ status: 1 });
SizeSchema.index({ isActive: 1 });
SizeSchema.index({ createdAt: -1 });

// Pre-save middleware
SizeSchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to check if code exists within subcategory
SizeSchema.statics.isCodeExists = async function(code, excludeId = null) {
  const query = { 
    code: code.toUpperCase(),
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const color = await this.findOne(query);
  return !!color;
};
const Size = mongoose.model("Size", SizeSchema);
export default Size;
