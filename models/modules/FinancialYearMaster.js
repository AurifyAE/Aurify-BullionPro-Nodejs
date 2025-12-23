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
          if (!value || !this.startDate) return true; // Let required validator handle missing values
          
          // Normalize dates to UTC midnight for consistent comparison
          const normalizedEnd = normalizeDateToUTC(value);
          const normalizedStart = normalizeDateToUTC(this.startDate);
          
          if (!normalizedEnd || !normalizedStart) return true; // Invalid dates handled elsewhere
          
          return normalizedEnd > normalizedStart;
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



// Helper function to normalize date to UTC midnight
const normalizeDateToUTC = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

// === PRE-UPDATE VALIDATION ===
FinancialYearSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], async function (next) {
  const update = this.getUpdate();
  
  // Handle both direct updates and $set updates
  const updateObj = update.$set || update;
  
  // If dates are being updated, validate them
  if (updateObj.startDate || updateObj.endDate) {
    // Get the document to access current values
    const doc = await this.model.findOne(this.getQuery());
    if (!doc) {
      return next();
    }
    
    // Get start and end dates (new values from update or existing from document)
    let startDate = updateObj.startDate !== undefined ? updateObj.startDate : doc.startDate;
    let endDate = updateObj.endDate !== undefined ? updateObj.endDate : doc.endDate;
    
    // Normalize dates for comparison
    const normalizedStart = normalizeDateToUTC(startDate);
    const normalizedEnd = normalizeDateToUTC(endDate);
    
    if (normalizedStart && normalizedEnd && normalizedStart >= normalizedEnd) {
      const error = new Error("Start date must be before end date");
      error.name = "ValidationError";
      return next(error);
    }
  }
  
  next();
});

// === PRE-SAVE VALIDATION ===
FinancialYearSchema.pre("save", async function (next) {
  // Normalize dates before validation
  if (this.startDate && this.endDate) {
    const normalizedStart = normalizeDateToUTC(this.startDate);
    const normalizedEnd = normalizeDateToUTC(this.endDate);
    
    if (normalizedStart && normalizedEnd && normalizedStart >= normalizedEnd) {
      return next(new Error("Start date must be before end date"));
    }
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

