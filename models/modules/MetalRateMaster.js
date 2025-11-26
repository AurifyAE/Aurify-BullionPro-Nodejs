import mongoose from "mongoose";

const MetalRateMasterSchema = new mongoose.Schema(
  {
    metal: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "DivisionMaster",
      required: [true, "Division is required"]
    },
    rateType: {
      type: String,
      required: [true, "Rate type is required"],
      trim: true
    },
    convFactGms: {
      type: Number,
      required: [true, "Conversion Factor (GMS) is required"],
      min: [0, "Conversion Factor cannot be negative"],
      validate: {
        validator: function(value) {
          return value > 0;
        },
        message: "Conversion Factor must be greater than 0"
      }
    },
    currencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      required: [true, "Currency is required"]
    },
    status: {
      type: String,
      default: "null"
    },
    convertrate: {
      type: Number,
      required: [true, "Current rate is required"],
      min: [0, "Current rate cannot be negative"]
    },
    posMarginMin: {
      type: Number,
      required: [true, "POS Margin Min is required"],
      min: [0, "POS Margin Min cannot be negative"]
    },
    posMarginMax: {
      type: Number,
      required: [true, "POS Margin Max is required"],
      min: [0, "POS Margin Max cannot be negative"],
      validate: {
        validator: function(value) {
          return value >= this.posMarginMin;
        },
        message: "POS Margin Max must be greater than or equal to POS Margin Min"
      }
    },
    addOnRate: {
      type: Number,
      required: [true, "Add On Rate is required"],
      min: [0, "Add On Rate cannot be negative"]
    },
    range: {
      type: String,
      trim: true,
      default: ""
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
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
MetalRateMasterSchema.index({ metal: 1 });
MetalRateMasterSchema.index({ rateType: 1 });
MetalRateMasterSchema.index({ status: 1 });
MetalRateMasterSchema.index({ isActive: 1 });
MetalRateMasterSchema.index({ isDefault: 1 });
MetalRateMasterSchema.index({ createdAt: -1 });

// Compound indexes
MetalRateMasterSchema.index({ metal: 1, rateType: 1 });

// Pre-save middleware for validation and business logic
MetalRateMasterSchema.pre('save', async function(next) {
  // Ensure only one default metal rate per division and rate type
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { 
        metal: this.metal, 
        rateType: this.rateType,
        _id: { $ne: this._id }
      },
      { isDefault: false }
    );
  }
  next();
});

// Static method to check if metal rate combination exists
MetalRateMasterSchema.statics.isMetalRateExists = async function(metal, rateType, excludeId = null) {
  const query = { 
    metal: metal, 
    rateType: rateType 
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const metalRate = await this.findOne(query);
  return !!metalRate;
};

// Virtual populate for division and currency details
MetalRateMasterSchema.virtual('division', {
  ref: 'DivisionMaster',
  localField: 'metal',
  foreignField: '_id',
  justOne: true
});

MetalRateMasterSchema.virtual('currency', {
  ref: 'CurrencyMaster',
  localField: 'currencyId',
  foreignField: '_id',
  justOne: true
});

const MetalRateMaster = mongoose.model("MetalRateMaster", MetalRateMasterSchema);
export default MetalRateMaster;