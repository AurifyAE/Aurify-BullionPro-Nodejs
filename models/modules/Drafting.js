import mongoose from "mongoose";

const DraftingSchema = new mongoose.Schema(
  {
    draftNumber: {
      type: String,
      required: true,
      unique: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountType",
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

// Indexes for better query performance
DraftingSchema.index({ draftNumber: 1 });
DraftingSchema.index({ partyId: 1 });
DraftingSchema.index({ status: 1 });
DraftingSchema.index({ createdAt: -1 });

const Drafting = mongoose.model("Drafting", DraftingSchema);

export default Drafting;

