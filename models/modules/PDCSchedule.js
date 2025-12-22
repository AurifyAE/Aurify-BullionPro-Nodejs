import mongoose from "mongoose";

const pdcScheduleSchema = new mongoose.Schema(
  {
    entryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Entry",
      required: [true, "Entry ID is required"],
      index: true,
    },
    cashItemIndex: {
      type: Number,
      required: [true, "Cash item index is required"],
    },
    voucherCode: {
      type: String,
      required: [true, "Voucher code is required"],
      index: true,
    },
    entryType: {
      type: String,
      enum: ["currency-receipt", "currency-payment"],
      required: [true, "Entry type is required"],
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be positive"],
    },
    chequeDate: {
      type: Date,
      required: [true, "Cheque date is required"],
    },
    maturityPostingDate: {
      type: Date,
      required: [true, "Maturity posting date is required"],
      index: true,
    },
    pdcAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "PDC account is required"],
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "Bank account ID is required"],
    },
    pdcStatus: {
      type: String,
      enum: ["pending", "cleared", "cancelled"],
      default: "pending",
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
pdcScheduleSchema.index({ maturityPostingDate: 1, pdcStatus: 1 });
pdcScheduleSchema.index({ entryId: 1, cashItemIndex: 1 }, { unique: true });

// Prevent duplicate processing
pdcScheduleSchema.index({ entryId: 1, cashItemIndex: 1, pdcStatus: 1 });

const PDCSchedule = mongoose.model("PDCSchedule", pdcScheduleSchema);

export default PDCSchedule;

