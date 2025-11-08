import mongoose from "mongoose";

const FixingPriceSchema = new mongoose.Schema(
  {
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalTransaction",
      default: null,
      index: true,
    },
    transactionType: {
      type: String,
      required: [true, "Transaction type is required"],
      index: true,
    },
    transactionFix: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionFixing",
      default: null,
      index: true,
    },
    rateInGram: {
      type: Number,
      required: [true, "Rate per gram is required"],
      min: [0, "Rate cannot be negative"],
    },
    bidValue: {
      type: Number,
      default: null,
      min: [0, "Bid value cannot be negative"],
    },
    currentBidValue: {
      type: Number,
      default: null,
      min: [0, "Bid value cannot be negative"],
    },
    entryBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Entry by admin is required"],
      index: true,
    },
    metalRate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      default: null,
    },
    status: {
      type: String,
      default: "active",
      index: true,
    },
    // When this rate was fixed
    fixedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "fixingprices",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for performance
FixingPriceSchema.index({ transaction: 1, status: 1 });

// Virtual: Formatted date
FixingPriceSchema.virtual("formattedFixedAt").get(function () {
  return this.fixedAt?.toLocaleString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });
});

// Auto-expire if expiresAt is set
FixingPriceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const FixingPrice = mongoose.model("FixingPrice", FixingPriceSchema);

export default FixingPrice;
