import mongoose from "mongoose";

const KaratMasterSchema = new mongoose.Schema(
  {
    karatCode: {
      type: String,
      required: [true, "Karat code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Karat code cannot exceed 10 characters"],
      match: [
        /^[A-Z0-9]+$/,
        "Karat code should contain only uppercase letters and numbers",
      ],
    },
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DivisionMaster",
      required: [true, "Division is required"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    standardPurity: {
      type: Number,
      required: [true, "Standard purity is required"],
      min: [0, "Standard purity cannot be negative"],
      max: [100, "Standard purity cannot exceed 100%"],
    },
    minimum: {
      type: Number,
      default:0,
      required: [true, "Minimum value is required"],
    },
    maximum: {
      type: Number,
      default:0,
      required: [true, "Maximum value is required"],
    },
    isScrap: {
      type: Boolean,
      default: false,
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

// Indexes for better performance
KaratMasterSchema.index({ karatCode: 1 });
KaratMasterSchema.index({ division: 1 });
KaratMasterSchema.index({ status: 1 });
KaratMasterSchema.index({ isActive: 1 });
KaratMasterSchema.index({ isScrap: 1 });
KaratMasterSchema.index({ createdAt: -1 });

// Compound index for unique karat code per division
KaratMasterSchema.index({ karatCode: 1, division: 1 }, { unique: true });

// Pre-save middleware to ensure uppercase karat code and validate min/max
KaratMasterSchema.pre("save", function (next) {
  if (this.karatCode) {
    this.karatCode = this.karatCode.toUpperCase();
  }

  // Validate minimum/maximum based on isScrap
  if (!this.isScrap) {
    // Regular validation for non-scrap items
    if (this.minimum < 0 || this.maximum < 0) {
      const error = new Error(
        "Minimum and maximum values cannot be negative for non-scrap items"
      );
      error.name = "ValidationError";
      return next(error);
    }

  } else {
    // For scrap items, allow any numeric values (including negative)
    // Only validate that minimum is less than maximum
    // if (this.minimum >= this.maximum) {
    //   const error = new Error("Minimum value must be less than maximum value");
    //   error.name = "ValidationError";
    //   return next(error);
    // }
  }

  next();
});

// Static method to check if karat code exists
KaratMasterSchema.statics.isKaratCodeExists = async function (
  karatCode,
  divisionId,
  excludeId = null
) {
  const query = {
    karatCode: karatCode.toUpperCase(),
    division: divisionId,
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const karat = await this.findOne(query);
  return !!karat;
};

// Static method to get all active karats by division
KaratMasterSchema.statics.getByDivision = async function (divisionId) {
  return await this.find({
    division: divisionId,
    status: "active",
    isActive: true,
  })
    .populate("division", "code description")
    .sort({ karatCode: 1 });
};

// Static method to get all scrap karats
KaratMasterSchema.statics.getScrapKarats = async function (divisionId = null) {
  const query = {
    isScrap: true,
    status: "active",
    isActive: true,
  };
  if (divisionId) {
    query.division = divisionId;
  }
  return await this.find(query)
    .populate("division", "code description")
    .sort({ karatCode: 1 });
};

const KaratMaster = mongoose.model("KaratMaster", KaratMasterSchema);

export default KaratMaster;
