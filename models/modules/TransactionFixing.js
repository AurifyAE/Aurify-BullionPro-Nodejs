import mongoose from "mongoose";

// ====================== ATTACHMENT SUB-SCHEMA ======================
const AttachmentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
      maxlength: 255,
    },
    s3Key: {
      type: String,
      required: [true, "S3 key is required"],
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    type: {
      type: String,
      enum: ["invoice", "receipt", "certificate", "photo", "contract", "other"],
      default: "other",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true, timestamps: false }
);

/* ============================= ORDER SCHEMA ============================= */
const OrderSchema = new mongoose.Schema(
  {
    commodity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Commodity",
      required: [true, "Commodity is required"],
    },
    commodityValue: { type: Number, default: 0 },
    grossWeight: {
      type: Number,
      required: true,
      min: [0, "Gross weight must be >= 0"],
    },
    oneGramRate: {
      type: Number,
      required: true,
      min: [0, "Rate must be >= 0"],
    },
    ozWeight: { type: Number, default: 0 },
    currentBidValue: { type: Number, required: true },
    bidValue: { type: Number, required: true },
    pureWeight: { type: Number, required: true },
    selectedCurrencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      required: true,
    },
    purity: { type: Number, required: true },
    remarks: { type: String, trim: true, default: "" },
    price: { type: Number, required: true }, // from React as string
    metalType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      required: true,
    },
  },
  { _id: false }
);

/* ============================= MAIN SCHEMA ============================= */
const TransactionFixingSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true, trim: true },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "Party ID is required"],
    },
    type: {
      type: String,
      required: true,
    },
    referenceNumber: { type: String, trim: true, uppercase: true },
    voucherNumber: { type: String, trim: true },
    voucherType: { type: String, trim: true },
    salesman: { type: String, default: "N/A" },

    orders: {
      type: [OrderSchema],
      validate: [(v) => v.length > 0, "At least one order is required"],
    },

    attachments: {
      type: [AttachmentSchema],
      default: [],
    },
    transactionDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
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
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* ============================= INDEXES ============================= */
TransactionFixingSchema.index({ partyId: 1, transactionDate: -1 });
TransactionFixingSchema.index({ type: 1, transactionDate: -1 });
TransactionFixingSchema.index({ "orders.metalType": 1 });
TransactionFixingSchema.index({ status: 1, isActive: 1 });

/* ============================= PRE-VALIDATE: Generate ID ============================= */
TransactionFixingSchema.pre("validate", async function (next) {
  if (!this.transactionId) {
    const prefix =
      this.prefix || (this.type.includes("purchase") ? "PF" : "SF");
    this.transactionId = await generateUniqueId(prefix, this.constructor);
  }
  if (this.referenceNumber)
    this.referenceNumber = this.referenceNumber.toUpperCase();
  next();
});

async function generateUniqueId(prefix, Model) {
  let id, exists;
  do {
    const rand = Math.floor(1000 + Math.random() * 9000);
    id = `${prefix}${rand}`;
    exists = await Model.exists({ transactionId: id });
  } while (exists);
  return id;
}

/* ============================= STATIC METHODS ============================= */
TransactionFixingSchema.statics.getTransactionsByParty = async function (
  partyId,
  start,
  end
) {
  const q = { partyId, status: "active" };
  if (start || end) {
    q.transactionDate = {};
    if (start) q.transactionDate.$gte = new Date(start);
    if (end) q.transactionDate.$lte = new Date(end);
  }
  return this.find(q).sort({ transactionDate: -1 });
};

export default mongoose.model("TransactionFixing", TransactionFixingSchema);
