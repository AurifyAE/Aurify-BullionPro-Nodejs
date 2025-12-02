import mongoose from "mongoose";

const DraftingSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    draftNumber: {
      type: String,
      required: true,
      unique: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    partyName: {
      type: String,
    },
    stockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalStock",
    },
    stockCode: {
      type: String,
    },
    grossWeight: {
      type: Number,
    },
    // PDF Parsed Fields
    laboratoryName: {
      type: String,
    },
    certificateNumber: {
      type: String,
    },
    itemCode: {
      type: String,
    },
    customerName: {
      type: String,
    },
    address: {
      type: String,
    },
    city: {
      type: String,
    },
    contact: {
      type: String,
    },
    testMethod: {
      type: String,
    },
    dateProcessed: {
      type: Date,
    },
    dateAnalysed: {
      type: Date,
    },
    dateDelivery: {
      type: Date,
    },
    itemReference: {
      type: String,
    },
    itemType: {
      type: String,
    },
    goldBarWeight: {
      type: Number,
    },
    goldAuPercent: {
      type: Number,
    },
    resultKarat: {
      type: Number,
    },
    determinationMethod: {
      type: String,
    },
    comments: {
      type: String,
    },
    analyserSignature: {
      type: String,
    },
    technicalManager: {
      type: String,
    },
    dateReport: {
      type: Date,
    },
    // Additional fields
    remarks: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },
    status: {
      type: String,
      enum: ["draft", "confirmed", "rejected"],
      default: "draft",
    },
    // Voucher fields
    voucherCode: {
      type: String,
    },
    voucherType: {
      type: String,
    },
    prefix: {
      type: String,
    },
    voucherDate: {
      type: Date,
    },
    // PDF file reference (if saved)
    pdfFile: {
      type: String, // Path or S3 key
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to generate transaction ID
DraftingSchema.pre("save", async function (next) {
  try {
    // Generate transaction ID if not provided and this is a new document
    if (this.isNew && !this.transactionId) {
      const year = new Date().getFullYear();
      let isUnique = false;
      let transactionId;

      // Keep generating until we get a unique transaction ID
      while (!isUnique) {
        const randomNumber = Math.floor(Math.random() * 9000) + 1000; // Generates 4-digit random number (1000-9999)
        transactionId = `DMT${year}${randomNumber}`;

        // Check if this transaction ID already exists
        const existing = await this.constructor.findOne({ transactionId });
        if (!existing) {
          isUnique = true;
        }
      }

      this.transactionId = transactionId;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Indexes for better query performance
DraftingSchema.index({ transactionId: 1 });
DraftingSchema.index({ draftNumber: 1 });
DraftingSchema.index({ partyId: 1 });
DraftingSchema.index({ status: 1 });
DraftingSchema.index({ createdAt: -1 });

const Drafting = mongoose.model("Drafting", DraftingSchema);

export default Drafting;

