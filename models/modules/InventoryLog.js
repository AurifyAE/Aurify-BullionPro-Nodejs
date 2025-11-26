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
        "importPurchase",
        "exportSaleReturn",
        "importPurchaseReturn",
        "initial",
        "saleReturn",
        "purchaseReturn",
        "metalReceipt",
        "metalPayment",
      ],
      required: true,
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
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
      min: [0, "Gross Weight cannot be negative"],
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
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

const InventoryLog = mongoose.model("InventoryLog", inventoryLogSchema);

export default InventoryLog;
