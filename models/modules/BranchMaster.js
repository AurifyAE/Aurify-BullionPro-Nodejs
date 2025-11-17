import mongoose from "mongoose";

const BranchSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Branch code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Branch code cannot exceed 10 characters"],
      match: [
        /^[A-Z0-9]+$/,
        "Branch code must contain only uppercase letters and numbers",
      ],
    },
    name: {
      type: String,
      required: [true, "Branch name is required"],
      trim: true,
      maxlength: [150, "Branch name cannot exceed 150 characters"],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, "Address cannot exceed 500 characters"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    phones: {
      type: [String],
      validate: {
        validator: function (v) {
          return v.every((p) => /^\+?\d{7,15}$/.test(p));
        },
        message: "Each phone number must be 7-15 digits (optional leading +)",
      },
    },
    fax: {
      type: String,
      trim: true,
      match: [/^\+?\d{7,15}$/, "Fax must be 7-15 digits (optional leading +)"],
    },
    website: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^https?:\/\/.+$/,
        "Website must be a valid URL starting with http(s)://",
      ],
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      required: true,
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [150, "Company name cannot exceed 150 characters"],
    },

    branchName: {
      type: String,
      trim: true,
      maxlength: [150, "Branch display name cannot exceed 150 characters"],
    },

    logo: {
      url: {
        type: String,
        trim: true,
      },
      key: {
        type: String,
        trim: true,
      },
    },

    trnNumber: {
      type: String,
      trim: true,
    },

    goldOzConversion: {
      type: Number,
      default: 31.1035,
      min: [0, "Gold conversion factor cannot be negative"],
    },
    metalDecimal: {
      type: Number,
      required: [true, "Metal decimal precision is required"],
      min: [0, "Metal decimal cannot be negative"],
      max: [6, "Metal decimal cannot exceed 6"],
      default: 3,
    },
    amountDecimal: {
      type: Number,
      required: [true, "Amount decimal precision is required"],
      min: [0, "Amount decimal cannot be negative"],
      max: [6, "Amount decimal cannot exceed 6"],
      default: 2,
    },
    financialYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinancialYear",
      required: [true, "Financial year is required"],
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
    isHedged: {
      type: Boolean,
      default: false,
    },
    
    enableMobileApp: {
      type: Boolean,
      default: false,
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

BranchSchema.index({ code: 1 }, { unique: true });
BranchSchema.index({ name: 1 });
BranchSchema.index({ currency: 1 });
BranchSchema.index({ status: 1 });
BranchSchema.index({ isActive: 1 });
BranchSchema.index({ createdAt: -1 });

BranchSchema.pre("save", function (next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

BranchSchema.statics.isCodeExists = async function (code, excludeId = null) {
  const query = { code: code.toUpperCase() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const branch = await this.findOne(query);
  return !!branch;
};

const Branch = mongoose.model("Branch", BranchSchema);
export default Branch;
