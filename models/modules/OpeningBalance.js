import mongoose from "mongoose";

const openingBalanceSchema = new mongoose.Schema(
    {
        partyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
            required: true,
        },

        value: {
            type: Number,
            required: true,
        },
        transactionType: {
            type: String,
            enum: ["credit", "debit"],
            required: true,
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
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


        voucherCode: {
            type: String,
            required: true,
        },

        voucherType: {
            type: String,
            required: true,
        },

        voucherDate: {
            type: Date,
            required: true,
        },

        description: {
            type: String,
        },
    },
    { timestamps: true }
);

const OpeningBalance = mongoose.model(
    "OpeningBalance",
    openingBalanceSchema
);

export default OpeningBalance;
