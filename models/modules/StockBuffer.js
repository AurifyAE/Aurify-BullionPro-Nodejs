import mongoose from "mongoose";

// Helper function to normalize date to UAE timezone (UTC+4) start of day
const normalizeToUAEDate = (dateInput) => {
  const date = new Date(dateInput);
  // Get UTC components
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDate = date.getUTCDate();

  // Create a new Date object representing 00:00:00.000 in UAE time (UTC+4)
  // This means 20:00:00.000 UTC of the previous day
  const uaeMidnightUtc = new Date(Date.UTC(utcYear, utcMonth, utcDate, 20, 0, 0, 0));
  return uaeMidnightUtc;
};

const StockBufferSchema = new mongoose.Schema(
  {
    bufferGoal: {
      type: Number,
      required: [true, "Buffer goal is required"],
      // Buffer goal in grams of total pure gold weight
      // Positive = need to purchase, Negative = need to sell
    },
    balanceWhenSet: {
      type: Number,
      required: [true, "Balance when set is required"],
      // Total pure gold balance in grams when buffer was set
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
      index: true,
      unique: true, // Only one buffer per day
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, "Remarks cannot exceed 500 characters"],
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save hook to normalize date to UAE timezone
StockBufferSchema.pre("save", function (next) {
  if (this.date) {
    this.date = normalizeToUAEDate(this.date);
  }
  next();
});

// Index for efficient queries - one buffer per day
StockBufferSchema.index({ date: -1 });

// Virtual to calculate remaining to achieve goal (based on balanceWhenSet)
StockBufferSchema.virtual("remainingToGoal").get(function () {
  return Math.max(0, this.bufferGoal - this.balanceWhenSet);
});

// Static method to find buffer by date
StockBufferSchema.statics.findByDate = function (date) {
  const searchDate = normalizeToUAEDate(date);
  return this.findOne({ date: searchDate });
};

// Static method to find today's buffer
StockBufferSchema.statics.findToday = function () {
  const today = normalizeToUAEDate(new Date());
  return this.findOne({ date: today });
};

// Static method to get all buffers
StockBufferSchema.statics.getAllBuffers = function (query = {}) {
  const { limit = 50, sortOrder = "desc" } = query;
  const sort = sortOrder === "asc" ? 1 : -1;
  return this.find({})
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email")
    .sort({ date: sort })
    .limit(parseInt(limit));
};

const StockBuffer = mongoose.model("StockBuffer", StockBufferSchema);

export default StockBuffer;

