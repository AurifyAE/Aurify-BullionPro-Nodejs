import mongoose from "mongoose";

const AccountFixingSchema = new mongoose.Schema(
    {
        voucherNumber: { type: String, required: true, index: true },
        voucherType: { type: String, required: true },
        prefix: { type: String, required: true },
        voucherDate: { type: Date, required: true },

        division: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DivisionMaster",
            required: true,
        },

        salesman: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Salesman",
            required: true,
        },

        position: {
            type: String,
            enum: ["PURCHASE", "SALE"],
            required: true,
        },

        pureWeight: { type: Number, required: true }, // grams
        weightOz: { type: Number, required: true },

        metalRate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MetalRateMaster",
            required: true,
        },

        metalRateValue: {
            type: Number,
            required: true, // convFactGms snapshot
        },

        metalValue: {
            type: Number,
            required: true, // pureWeight * convFactGms
        },

        bidvalue: { type: Number },

        accountingImpact: {
            gold: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
            cash: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("AccountFixing", AccountFixingSchema);
