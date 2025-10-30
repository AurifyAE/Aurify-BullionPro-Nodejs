import mongoose from "mongoose";
import Registry from "./Registry.js";

const MetalStockSchema = new mongoose.Schema(
  {
    metalType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DivisionMaster",
      default: null,
    },
    referenceType: {
      type: String,
      index: true,
    },
    code: {
      type: String,
      required: [true, "Metal stock code is required"],
      trim: true,
      uppercase: true,
      maxlength: [20, "Metal stock code cannot exceed 20 characters"],
      // match: [
      //   /^[A-Z0-9]+$/,
      //   "Metal stock code should contain only uppercase letters and numbers",
      // ],
    },
    description: {
      type: String,
      required: [true, "Metal description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    karat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KaratMaster",
      required: [true, "Karat is required"],
    },
    pcs: {
      type: Boolean,
      default: false,
    },
    pcsCount: {
      type: Number,
      default: 0,
      min: [0, "Piece count cannot be negative"],
      validate: {
        validator: function (value) {
          return !this.pcs || Number.isInteger(value);
        },
        message: "Piece count must be an integer when pcs is true",
      },
    },
    totalValue: {
      type: Number,
      default: 0,
      min: [0, "Total value cannot be negative"],
    },
    voucherType: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, "Voucher type cannot exceed 50 characters"],
    },
    voucherDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    voucherNumber: {
      type: String,
      trim: true,
      maxlength: [50, "Voucher number cannot exceed 50 characters"],
      index: true,
    },
    charges: {
      type: Number,
      default: 0,
    },
    makingCharge: {
      type: Number,
      default: 0,
    },
    costCenter: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MainCategory",
      default: null,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      default: null,
    },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Type",
      default: null,
    },
    size: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Size",
      default: null,
    },
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Color",
      default: null,
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
    },
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CountryMaster",
      default: null,
    },
    price: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // NEW FIELDS
    unit: {
      type: String,
      enum: ["grams", "pieces", "percentage"],
      default: "grams",
    },
    ozDecimal: {
      type: Number,
      default: null,
      min: [0, "OZ Decimal cannot be negative"],
    },
    pastPurityDiff: {
      piece: {
        type: Number,
        default: 0,
        min: [0, "Piece cannot be negative"],
      },
      weight: {
        type: Number,
        default: 0,
        min: [0, "Weight cannot be negative"],
      },
    },
    exclusiveVAT: {
      piece: {
        type: Number,
        default: 0,
        min: [0, "Piece cannot be negative"],
      },
      weight: {
        type: Number,
        default: 0,
        min: [0, "Weight cannot be negative"],
      },
    },
    vatOnMaking: {
      piece: {
        type: Number,
        default: 0,
        min: [0, "Piece cannot be negative"],
      },
      weight: {
        type: Number,
        default: 0,
        min: [0, "Weight cannot be negative"],
      },
    },
    wastage: {
      piece: {
        type: Number,
        default: 0,
        min: [0, "Piece cannot be negative"],
      },
      weight: {
        type: Number,
        default: 0,
        min: [0, "Weight cannot be negative"],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "discontinued"],
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
MetalStockSchema.index({ code: 1, isActive: 1 });
MetalStockSchema.index({ metalType: 1 });
MetalStockSchema.index({ branch: 1 });
MetalStockSchema.index({ category: 1 });
MetalStockSchema.index({ subCategory: 1 });
MetalStockSchema.index({ status: 1 });
MetalStockSchema.index({ isActive: 1 });
MetalStockSchema.index({ createdAt: -1 });
MetalStockSchema.index({ karat: 1 });
MetalStockSchema.index({ pcs: 1 });
MetalStockSchema.index({ pcsCount: 1 });
MetalStockSchema.index({ totalValue: 1 });
MetalStockSchema.index({ unit: 1 });

// Compound indexes
MetalStockSchema.index({ branch: 1, category: 1 });
MetalStockSchema.index({ metalType: 1, karat: 1 });

// Pre-save middleware
MetalStockSchema.pre("save", async function (next) {
  try {
    if (this.code) {
      this.code = this.code.toUpperCase();
    }

    // Sync standardPurity with KaratMaster
    if (this.isModified("karat")) {
      const KaratMaster = mongoose.model("KaratMaster");
      const karat = await KaratMaster.findById(this.karat);
      if (!karat) {
        return next(new Error("Invalid karat ID"));
      }
      this.standardPurity = karat.standardPurity;
    }

    // Enforce pcsCount and totalValue to 0 when pcs is false
    if (!this.pcs) {
      this.pcsCount = 0;
      this.totalValue = 0;
    } else {
      // Validate pcsCount and totalValue when pcs is true
      if (
        this.pcsCount === null ||
        this.pcsCount === undefined ||
        this.pcsCount < 0
      ) {
        return next(
          new Error(
            "Piece count is required and must be non-negative when pcs is true"
          )
        );
      }
      if (
        this.totalValue === null ||
        this.totalValue === undefined ||
        this.totalValue < 0
      ) {
        return next(
          new Error(
            "Total value is required and must be non-negative when pcs is true"
          )
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static method to check if code exists
MetalStockSchema.statics.isCodeExists = async function (
  code,
  excludeId = null
) {
  const query = { code: code.toUpperCase(), isActive: true };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  return !!(await this.findOne(query));
};

const MetalStock = mongoose.model("MetalStock", MetalStockSchema);

export default MetalStock;