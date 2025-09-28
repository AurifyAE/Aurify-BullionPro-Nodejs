import mongoose from "mongoose";

const SubCategorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Sub Category code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Sub Category code cannot exceed 10 characters"],
      match: [/^[A-Z0-9]+$/, "Sub Category code should contain only uppercase letters and numbers"]
    },
    description: {
      type: String,
      required: [true, "Sub Category description is required"],
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

// Compound index for code uniqueness within main category
SubCategorySchema.index({ code: 1, mainCategory: 1 }, { unique: true });
SubCategorySchema.index({ status: 1 });
SubCategorySchema.index({ isActive: 1 });
SubCategorySchema.index({ createdAt: -1 });

// Pre-save middleware
SubCategorySchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to check if code exists within main category
SubCategorySchema.statics.isCodeExists = async function(code, mainCategoryId, excludeId = null) {
  const query = { 
    code: code.toUpperCase(),
    mainCategory: mainCategoryId
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const subCategory = await this.findOne(query);
  return !!subCategory;
};

const SubCategory = mongoose.model("SubCategory", SubCategorySchema);
export default SubCategory;