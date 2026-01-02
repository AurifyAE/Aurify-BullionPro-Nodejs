import mongoose from "mongoose";

const inventoryLogSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      index: true, // Enables faster search on code
    },
    transactionType: {
      type: String,
      enum: [
        "sale",
        "purchase",
        "transfer",
        "opening",
        "adjustment",
        "exportSale",
        "draft",
        "importPurchase",
        "exportSaleReturn",
        "importPurchaseReturn",
        "initial",
        "saleReturn",
        "purchaseReturn",
        "metalReceipt",
        "metalPayment",
        "hedgeMetalPayment",
        "hedgeMetalReceipt",
        "hedgeMetalReciept", // Support both spellings for backward compatibility
      ],
      required: true,
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DivisionMaster",
      default: null,
      index: true,
    },
    pcs: {
      type: Boolean,
      default: false,
    },
    stockCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalStock",
      required: [true, "Stock Code is required"],
      index: true,
    },
    voucherCode: {
      type: String,
      default: "",
    },
    voucherType: {
      type: String,
      default: "",
    },
    voucherDate: {
      type: Date,
      required: [true, "Voucher date is required"],
    },
    grossWeight: {
      type: Number,
      default: 0,
      // Note: For purity difference entries (isPurityDifferenceEntry: true), 
      // grossWeight should always be 0 as these entries don't represent actual weight changes
    },
    pcs: {
      type: Number,
      default: 0,
    },
    purity: {
      type: Number,
      default: 0,
      min: [0, "Purity cannot be negative"],
    },
    avgMakingRate: {
      type: Number,
      default: 0,
    },
    avgMakingAmount: {
      type: Number,
      default: 0,
    },
    premiumDiscountAmount: {
      type: Number,
      default: 0,
      // Premium = positive amount, Discount = negative amount
      // This allows easy calculation: positive = premium, negative = discount
    },
    premiumDiscountRate: {
      type: Number,
      default: 0,
    },
    purityDifference: {
      type: Number,
      default: 0,
      // Positive = gain (treated as "add" in reports), Negative = loss (treated as "remove" in reports)
      // This is for reporting purposes only and does not affect actual inventory
    },
    isPurityDifferenceEntry: {
      type: Boolean,
      default: false,
      // If true, this entry is specifically for tracking purity difference gain/loss
      // Action will be "add" for gain (positive) and "remove" for loss (negative)
      // IMPORTANT: grossWeight must be 0 for these entries - they don't affect actual inventory weight
    },
    action: {
      type: String,
      enum: ["add", "update", "delete", "remove"],
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
    note: {
      type: String,
      default: "",
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    isDraft: {
      type: Boolean,
      default: false,
      index: true,
    },
    draftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drafting",
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

const InventoryLog = mongoose.model("InventoryLog", inventoryLogSchema);

export default InventoryLog;
