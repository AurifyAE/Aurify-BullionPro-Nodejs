import mongoose from "mongoose";

const DealStrategySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    lbma: {
      value: {
        type: Number,
        required: [true, "LBMA value is required"],
        min: [0, "LBMA value must be positive"],
      },
      type: {
        type: String,
        enum: ["premium", "discount"],
        default: "premium",
        required: true,
      },
    },
    uaegd: {
      value: {
        type: Number,
        required: [true, "UAE GD value is required"],
        min: [0, "UAE GD value must be positive"],
      },
      type: {
        type: String,
        enum: ["premium", "discount"],
        default: "premium",
        required: true,
      },
    },
    local: {
      value: {
        type: Number,
        required: [true, "Local value is required"],
        min: [0, "Local value must be positive"],
      },
      type: {
        type: String,
        enum: ["premium", "discount"],
        default: "premium",
        required: true,
      },
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

// Index to ensure only one strategy per day
DealStrategySchema.index({ date: 1 }, { unique: true });

// Helper function to normalize date to UAE timezone (UTC+4) start of day
// UAE is UTC+4, so UAE midnight (00:00 UAE) = 20:00 UTC previous day
// Example: "2025-12-23 00:00 UAE" = "2025-12-22 20:00 UTC"
const normalizeToUAEDate = (dateInput) => {
  let date;
  
  // If it's a string like "2025-12-23", parse it as UAE local date
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Parse as UAE local date: "2025-12-23 00:00 UAE" = "2025-12-22 20:00 UTC"
    const [year, month, day] = dateInput.split('-').map(Number);
    // Create UTC date: previous day at 20:00 UTC represents UAE midnight
    // Date.UTC handles day 0 correctly (it becomes last day of previous month)
    date = new Date(Date.UTC(year, month - 1, day - 1, 20, 0, 0, 0));
  } else {
    date = new Date(dateInput);
    // Extract date components (treating as UAE date)
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    // Create UTC date representing UAE midnight for that date
    date = new Date(Date.UTC(year, month, day - 1, 20, 0, 0, 0));
  }
  
  return date;
};

// Pre-save hook to normalize date to start of day in UAE timezone
DealStrategySchema.pre("save", function (next) {
  if (this.date) {
    this.date = normalizeToUAEDate(this.date);
  }
  next();
});

// Static method to find strategy by date
DealStrategySchema.statics.findByDate = function (date) {
  const searchDate = normalizeToUAEDate(date);
  return this.findOne({ date: searchDate });
};

// Static method to get all strategies with date range
DealStrategySchema.statics.findByDateRange = function (fromDate, toDate) {
  const from = normalizeToUAEDate(fromDate);
  const to = normalizeToUAEDate(toDate);
  // Set end of day for 'to' date (23:59:59 UAE = 19:59:59 UTC same day)
  // Since normalizeToUAEDate sets to 20:00 UTC previous day, we add 23h59m59s to get end of day
  to.setUTCHours(19, 59, 59, 999); // 19:59:59 UTC = 23:59:59 UAE
  return this.find({
    date: {
      $gte: from,
      $lte: to,
    },
  }).sort({ date: -1 });
};

const DealStrategy =
  mongoose.models.DealStrategy ||
  mongoose.model("DealStrategy", DealStrategySchema);

export default DealStrategy;

