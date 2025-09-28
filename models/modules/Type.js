import mongoose from "mongoose";

const TypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Type code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Type code cannot exceed 10 characters"],
      match: [
        /^[A-Z0-9]+$/,
        "Type code should contain only uppercase letters and numbers",
      ],
    },
    description: {
      type: String,
      required: [true, "Type description is required"],
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for code uniqueness within sub category
TypeSchema.index({ code: 1, subCategory: 1 }, { unique: true });
TypeSchema.index({ status: 1 });
TypeSchema.index({ isActive: 1 });
TypeSchema.index({ createdAt: -1 });

// Pre-save middleware
TypeSchema.pre("save", function (next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to check if code exists within sub category
TypeSchema.statics.isCodeExists = async function (
  code,
  subCategoryId,
  excludeId = null
) {
  const query = {
    code: code.toUpperCase(),
    subCategory: subCategoryId,
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const type = await this.findOne(query);
  return !!type;
};

const Type = mongoose.model("Type", TypeSchema);
export default Type;
