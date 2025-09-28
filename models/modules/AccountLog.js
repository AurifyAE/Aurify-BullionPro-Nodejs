import mongoose from "mongoose";

const accountLogSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AccountMaster",
        required: true,
        index: true, // Faster lookups
    },
    transactionType: {
        type: String,
        enum: [
            "opening",        // Initial account opening
            "deposit",        // Added funds
            "withdrawal",     // Removed funds
            "adjustment",     // Manual balance correction
            "transfer",       // Transfer to/from another account
            "closing"         // Account closure
        ],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: [0, "Amount cannot be negative"],
    },
    balanceAfter: {
        type: Number, // Store the balance after this transaction
    },
    reference: {
        type:String,
        default: "", // voucher id
    },
    note: {
        type: String,
        trim: true,
        default: "",
    },
    action: {
        type: String,
        enum: ["add", "update", "delete" , "subtract"],
        required: true,
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
    timestamp: {
        type: Date,
        default: Date.now,
    }
}, {
    timestamps: true // createdAt & updatedAt
});

const AccountLog = mongoose.model("AccountLog", accountLogSchema);

export default AccountLog;
