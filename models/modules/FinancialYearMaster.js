import mongoose from "mongoose";

const FinancialYearSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Financial year code is required"],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: [20, "Code cannot exceed 20 characters"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (value) {
          return value > this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    voucherReset: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: true,
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
  }
);



// === PRE-SAVE VALIDATION ===
FinancialYearSchema.pre("save", async function (next) {
  // Validate date range
  if (this.startDate >= this.endDate) {
    throw new Error("Start date must be before end date");
  }

  // Check for overlapping financial years (only for active years)
  if (this.status) {
    const overlapping = await this.constructor.findOne({
      _id: { $ne: this._id },
      status: true,
      $or: [
        {
          startDate: { $lte: this.endDate },
          endDate: { $gte: this.startDate },
        },
      ],
    });

    if (overlapping) {
      throw new Error(
        `Financial year overlaps with existing year: ${overlapping.code}`
      );
    }
  }

  next();
});

// === STATIC METHODS ===

// Check if code exists
FinancialYearSchema.statics.isCodeExists = async function (code, excludeId = null) {
  const query = { code: code.trim().toUpperCase() };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

// Check for date range overlap
FinancialYearSchema.statics.hasDateOverlap = async function (
  startDate,
  endDate,
  excludeId = null
) {
  const query = {
    status: true,
    $or: [
      {
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return existing;
};

// Get current active financial year
FinancialYearSchema.statics.getCurrentFinancialYear = async function () {
  const currentDate = new Date();
  return await this.findOne({
    status: true,
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate },
  });
};

// === INSTANCE METHODS ===

// Check if this financial year is current
FinancialYearSchema.methods.isCurrent = function () {
  const currentDate = new Date();
  return (
    this.status &&
    this.startDate <= currentDate &&
    this.endDate >= currentDate
  );
};

// Get duration in days
FinancialYearSchema.methods.getDurationInDays = function () {
  const diff = this.endDate.getTime() - this.startDate.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const FinancialYear = mongoose.model("FinancialYear", FinancialYearSchema);
export default FinancialYear;

