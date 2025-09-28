import mongoose from "mongoose";

const MainCategorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Main Category code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Main Category code cannot exceed 10 characters"],
      match: [/^[A-Z0-9]+$/, "Main Category code should contain only uppercase letters and numbers"]
    },
    description: {
      type: String,
      required: [true, "Main Category description is required"],
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

// Indexes for better performance
MainCategorySchema.index({ code: 1 });
MainCategorySchema.index({ status: 1 });
MainCategorySchema.index({ isActive: 1 });
MainCategorySchema.index({ createdAt: -1 });

// Pre-save middleware to ensure uppercase codes
MainCategorySchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to check if code exists
MainCategorySchema.statics.isCodeExists = async function(code, excludeId = null) {
  const query = { code: code.toUpperCase() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const mainCategory = await this.findOne(query);
  return !!mainCategory;
};

const MainCategory = mongoose.model("MainCategory", MainCategorySchema);
export default MainCategory;