import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ================================
 * Stock Snapshot Schema
 * ================================
 * Represents stock state at the time of adjustment
 */
const StockSnapshotSchema = new Schema(
  {
    stockId: {
      type: Schema.Types.ObjectId,
      ref: "MetalStock",
      required: true,
      index: true,
    },

    grossWeight: {
      type: Number,
      required: true,
      min: 0,
    },

    purity: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    pureWeight: {
      type: Number,
      required: true,
      min: 0,
    },

    avgMakingRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    avgMakingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

/**
 * ================================
 * Stock Adjustment Line Schema
 * ================================
 * One adjustment line inside a voucher
 */
const StockAdjustmentLineSchema = new Schema(
  {
    lineNo: {
      type: Number,
      required: true,
    },

    from: {
      type: StockSnapshotSchema,
      required: true,
    },

    to: {
      type: StockSnapshotSchema,
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled"],
      default: "Completed",
    },
  },
  { _id: false }
);

/**
 * ================================
 * Stock Adjustment (Voucher) Schema
 * ================================
 */
const StockAdjustmentSchema = new Schema(
  {
    voucherNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    voucherType: {
      type: String,
      required: true,
      trim: true,
    },

    voucherDate: {
      type: Date,
      required: true,
    },

    division: {
      type: Schema.Types.ObjectId,
      ref: "DivisionMaster",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled"],
      default: "Completed",
      index: true,
    },

    enteredBy: {
      type: Schema.Types.ObjectId,
      ref: "Salesman",
      required: true,
      immutable: true,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    cancelledAt: {
      type: Date,
    },

    /**
     * 🔥 MULTIPLE STOCK ADJUSTMENTS PER VOUCHER
     */
    items: {
      type: [StockAdjustmentLineSchema],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "At least one stock adjustment line is required",
      },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * ================================
 * Indexes
 * ================================
 * ONE voucher per division
 */
StockAdjustmentSchema.index(
  { voucherNumber: 1, division: 1 },
  { unique: true }
);

export default mongoose.model(
  "StockAdjustment",
  StockAdjustmentSchema
);
