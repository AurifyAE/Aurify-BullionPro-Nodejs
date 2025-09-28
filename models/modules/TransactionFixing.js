import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    quantityGm: {
      type: Number,
      required: [true, "Quantity in grams is required"],
      min: [0, "Quantity cannot be negative"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    goldBidValue: {
      type: Number,
      required: [true, "Gold bid value is required"],
      min: [0, "Gold bid value cannot be negative"],
    },
    metalType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      required: [true, "Metal type is required"],
    },
    paymentTerms: {
      type: String,
      trim: true,
      enum: ["Cash", "Credit", "Other"],
      default: "Cash",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      default: "",
    },
  },
  { _id: false }
);

const TransactionFixingSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    voucherType: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, "Voucher type cannot exceed 50 characters"],
    },
    voucherDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    voucherNumber: {
      type: String,
      trim: true,
      maxlength: [50, "Voucher number cannot exceed 50 characters"],
      index: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "Party ID is required"],
    },
    type: {
      type: String,
      required: [true, "Transaction type is required"],
      enum: ["purchase", "sell"],
      lowercase: true,
    },
    orders: {
      type: [OrderSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: "At least one order is required",
      },
    },
    transactionDate: {
      type: Date,
      required: [true, "Transaction date is required"],
      default: () => new Date(),
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: null,
      uppercase: true,
      maxlength: [20, "Reference number cannot exceed 20 characters"],
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "cancelled"],
      default: "active",
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

/* ===== Indexes ===== */
TransactionFixingSchema.index({ partyId: 1, transactionDate: -1 });
TransactionFixingSchema.index({ type: 1, transactionDate: -1 });
TransactionFixingSchema.index({ "orders.metalType": 1 });
TransactionFixingSchema.index({ "orders.metalType": 1, transactionDate: -1 });
TransactionFixingSchema.index({ status: 1, isActive: 1 });

/* ===== Transaction ID Generator ===== */
TransactionFixingSchema.pre("validate", function (next) {
  if (!this.transactionId) {
    const prefix = this.type === "purchase" ? "PUR" : "SELL";
    const randomPart = Math.floor(10000 + Math.random() * 90000); // 5-digit
    const timePart = Date.now().toString().slice(-6); // last 6 digits of timestamp
    this.transactionId = `${prefix}${timePart}${randomPart}`;
  }

  if (this.referenceNumber) {
    this.referenceNumber = this.referenceNumber.toUpperCase();
  }

  next();
});

TransactionFixingSchema.statics.getTransactionsByParty = async function (
  partyId,
  startDate,
  endDate
) {
  const query = { partyId, status: "active" };

  if (startDate || endDate) {
    query.transactionDate = {};
    if (startDate) query.transactionDate.$gte = new Date(startDate);
    if (endDate) query.transactionDate.$lte = new Date(endDate);
  }

  return this.find(query).sort({ transactionDate: -1 });
};

export default mongoose.model("TransactionFixing", TransactionFixingSchema);
