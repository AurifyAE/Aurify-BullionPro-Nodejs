import mongoose from "mongoose";

/**
 * Entry Schema
 * One entry = one party + one asset + one amount
 */
const openingBalanceEntrySchema = new mongoose.Schema(
  {
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    assetType: {
      type: String,
      enum: ["GOLD", "CASH"],
      required: true,
    },

    assetCode: {
      type: String, // XAU, AED, INR
      required: true,
    },

    transactionType: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    value: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

/**
 * Voucher Schema
 * One document = one voucher
 */
const openingBalanceSchema = new mongoose.Schema(
  {
    voucherCode: {
      type: String,
      required: true,
      index: true,
    },

    voucherType: {
      type: String,
      default: "OPENING_BALANCE_BATCH",
    },

    voucherDate: {
      type: Date,
      required: true,
    },

    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    entries: {
      type: [openingBalanceEntrySchema],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "Opening balance must contain at least one entry",
      },
    },

    description: {
      type: String,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

/**
 * Prevent duplicate party + asset combinations inside the same voucher
 */
openingBalanceSchema.pre("validate", function (next) {
  const seen = new Set();

  for (const entry of this.entries) {
    const key = `${entry.partyId}_${entry.assetType}_${entry.assetCode}`;
    if (seen.has(key)) {
      return next(
        new Error(
          "Duplicate party + asset combination found in opening balance entries"
        )
      );
    }
    seen.add(key);
  }

  next();
});

const OpeningBalance = mongoose.model(
  "OpeningBalance",
  openingBalanceSchema
);

export default OpeningBalance;
