import mongoose from "mongoose";

const extractUpdateField = (update, field) => {
  if (!update) return undefined;
  if (Object.prototype.hasOwnProperty.call(update, field)) {
    return update[field];
  }
  if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, field)) {
    return update.$set[field];
  }
  return undefined;
};

const CurrencyMasterSchema = new mongoose.Schema(
  {
    currencyCode: {
      type: String,
      required: [true, "Currency code is required"],
      trim: true,
      uppercase: true,
      maxlength: [10, "Currency code cannot exceed 10 characters"],
      match: [/^[A-Z0-9]+$/, "Currency code should contain only uppercase letters and numbers"],
     
    },
    conversionRate: {
      type: Number,
      required: [true, "Conversion rate is required"],
      min: [0, "Conversion rate must be greater than 0"],
      validate: {
        validator: function(value) {
          return value > 0;
        },
        message: "Conversion rate must be a positive number"
      }
    },
    description: {
      type: String,
      required: [true, "Currency description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"]
    },
    minRate: {
      type: Number,
      required: [true, "Minimum rate is required"],
      min: [0, "Minimum rate must be greater than or equal to 0"],
      validate: {
        validator: function(value) {
          return value >= 0;
        },
        message: "Minimum rate must be a non-negative number"
      }
    },
    maxRate: {
      type: Number,
      required: [true, "Maximum rate is required"],
      min: [0, "Maximum rate must be greater than 0"],
      validate: [
        {
          validator: function(value) {
            return value > 0;
          },
          message: "Maximum rate must be a positive number"
        },
        {
          validator: function(value) {
            if (this instanceof mongoose.Query) {
              const minRate = extractUpdateField(this.getUpdate(), "minRate");
              if (minRate === undefined) {
                return true;
              }
              return value >= minRate;
            }
            if (this.minRate === undefined) {
              return true;
            }
            return value >= this.minRate;
          },
          message: "Maximum rate must be greater than or equal to minimum rate"
        }
      ]
    },
    symbol: {
      type: String,
      default: null,
      trim: true,
      maxlength: [10, "Symbol cannot exceed 10 characters"]
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
CurrencyMasterSchema.index({ currencyCode: 1 });
CurrencyMasterSchema.index({ status: 1 });
CurrencyMasterSchema.index({ isActive: 1 });
CurrencyMasterSchema.index({ createdAt: -1 });
CurrencyMasterSchema.index({ conversionRate: 1 });

// Pre-save middleware to ensure uppercase currency code
CurrencyMasterSchema.pre('save', function(next) {
  if (this.currencyCode) {
    this.currencyCode = this.currencyCode.toUpperCase();
  }
  next();
});

// Static method to check if currency code exists
CurrencyMasterSchema.statics.isCodeExists = async function(currencyCode, excludeId = null) {
  const query = { currencyCode: currencyCode.toUpperCase() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const currency = await this.findOne(query);
  return !!currency;
};

// Instance method to validate rate range
CurrencyMasterSchema.methods.isRateInRange = function(rate) {
  return rate >= this.minRate && rate <= this.maxRate;
};

const CurrencyMaster = mongoose.model("CurrencyMaster", CurrencyMasterSchema);

export default CurrencyMaster;