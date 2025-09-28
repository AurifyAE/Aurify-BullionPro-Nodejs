import mongoose from "mongoose";

const DivisionMasterSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Division code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Division code cannot exceed 10 characters"],
      match: [/^[A-Z0-9]+$/, "Division code should contain only uppercase letters and numbers"]
    },
    description: {
      type: String,
      required: [true, "Division description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"]
    },
    costCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CostCenterMaster",
      default: null
    },
    costCenterMaking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CostCenterMaster",
      default: null
    },
    autoFixStockCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Auto Fix Stock Code cannot exceed 20 characters"],
      match: [/^[A-Z0-9]+$/, "Auto Fix Stock Code should contain only uppercase letters and numbers"],
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      default: "multiply"
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better performance
DivisionMasterSchema.index({ code: 1 });
DivisionMasterSchema.index({ status: 1 });
DivisionMasterSchema.index({ isActive: 1 });
DivisionMasterSchema.index({ createdAt: -1 });
DivisionMasterSchema.index({ costCenter: 1 });
DivisionMasterSchema.index({ costCenterMaking: 1 });

// Pre-save middleware to ensure uppercase codes
DivisionMasterSchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  if (this.autoFixStockCode) {
    this.autoFixStockCode = this.autoFixStockCode.toUpperCase();
  }
  next();
});

// Static method to check if code exists
DivisionMasterSchema.statics.isCodeExists = async function(code, excludeId = null) {
  const query = { code: code.toUpperCase() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const division = await this.findOne(query);
  return !!division;
};

const DivisionMaster = mongoose.model("DivisionMaster", DivisionMasterSchema);
export default DivisionMaster;