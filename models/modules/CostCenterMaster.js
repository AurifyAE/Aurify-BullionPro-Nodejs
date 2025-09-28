import mongoose from "mongoose";

const CostCenterMasterSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Cost Center code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Cost Center code cannot exceed 10 characters"],
      match: [/^[A-Z0-9]+$/, "Cost Center code should contain only uppercase letters and numbers"]
    },
    description: {
      type: String,
      required: [true, "Cost Center description is required"],
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
CostCenterMasterSchema.index({ code: 1 });
CostCenterMasterSchema.index({ status: 1 });
CostCenterMasterSchema.index({ isActive: 1 });
CostCenterMasterSchema.index({ createdAt: -1 });

// Pre-save middleware to ensure uppercase codes
CostCenterMasterSchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Static method to check if code exists
CostCenterMasterSchema.statics.isCodeExists = async function(code, excludeId = null) {
  const query = { code: code.toUpperCase() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const costCenter = await this.findOne(query);
  return !!costCenter;
};

const CostCenterMaster = mongoose.model("CostCenterMaster", CostCenterMasterSchema);
export default CostCenterMaster;
