import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Reusable stock snapshot schema
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
            required: true,
            min: 0,
            default: 0,
        },

        avgMakingAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
    },
    { _id: false } // Embedded snapshot, no need for its own _id
);

/**
 * Main Stock Adjustment Schema
 */
const StockAdjustmentSchema = new Schema(
    {
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
            default: "Pending",
            index: true,
        },

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

        division: {
            type: Schema.Types.ObjectId,
            ref: "DivisionMaster",
            required: true,
            index: true,
        },

        enteredBy: {
            type: Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
            immutable: true, // audit safety
        },
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        cancelledAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

/**
 * Compound indexes for reporting & vouchers
 */
StockAdjustmentSchema.index(
    { voucherNumber: 1, division: 1 },
    { unique: true }
);

export default mongoose.model(
    "StockAdjustment",
    StockAdjustmentSchema
);
