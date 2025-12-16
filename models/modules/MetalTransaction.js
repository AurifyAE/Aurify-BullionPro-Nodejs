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

const StockItemSchema = new mongoose.Schema(
  {
    stockCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalStock",
      required: [true, "Stock Code is required"],
      index: true, // Added index for better query performance
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    pieces: {
      type: Number,
      default: 0,
      min: [0, "Pieces cannot be negative"],
    },
    passPurityDiff: {
      type: Boolean,
      default: true,
    },
    excludeVAT: {
      type: Boolean,
      default: false,
    },
    vatOnMaking: {
      type: Boolean,
      default: false,
    },
    grossWeight: {
      type: Number,
      default: 0,
      min: [0, "Gross Weight cannot be negative"],
    },
    currencyCode: {
      type: String,
      default: "AED",
    },
    currencyRate: {
      type: Number,
      default: 1,
    },
    purity: {
      type: Number,
      required: [true, "Purity is required"],
      min: [0, "Purity cannot be negative"],
      max: [100, "Purity cannot exceed 100%"],
    },
    purityStd: {
      type: Number,
      required: [true, "Standard Purity is required"],
      min: [0, "Standard Purity cannot be negative"],
      max: [100, "Standard Purity cannot exceed 100%"],
    },
    pureWeightStd: {
      type: Number,
      required: [true, "Standard Purity Weight is required"],
      min: [0, "Standard Purity Weight cannot be negative"],
    },
    pureWeight: {
      type: Number,
      required: [true, "pureWeight is required"],
      min: [0, "pureWeight cannot be negative"],
    },
    purityDifference: {
      type: Number,
      default: 0,
    },
    weightInOz: {
      type: Number,
      required: [true, "Weight in Oz is required"],
      min: [0, "Weight in Oz cannot be negative"],
    },
    FXGain: {
      type: Number,
      default: 0,
    },
    FXLoss: {
      type: Number,
      default: 0,
    },
    cashDebit: {
      type: Number,
      default: 0,
    },
    cashCredit: {
      type: Number,
      default: 0,
    },
    goldDebit: {
      type: Number,
      default: 0,
    },
    goldCredit: {
      type: Number,
      default: 0,
    },
    metalRate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      required: [true, "Metal Rate is required for stock item"],
    },

    metalRateRequirements: {
      amount: {
        type: Number,
        default: 0,
        min: [0, "Amount cannot be negative"],
      },
      rateInGram: {
        type: Number,
        default: 0,
        min: [0, "Rate cannot be negative"],
      },
      currentBidValue: {
        type: Number,
        default: 2500,
        min: [0, "Rate cannot be negative"],
      },
      bidValue: {
        type: Number,
        default: 2500,
        min: [0, "Rate cannot be negative"],
      },
    },

    makingUnit: {
      unit: {
        type: String,
        default: null,
      },
      makingRate: {
        type: Number,
        default: 0,
        min: [0, "Amount cannot be negative"],
      },
      makingAmount: {
        type: Number,
        default: 0,
      },
    },
    premiumDiscount: {
      amount: {
        type: Number,
        default: 0,
      },
      rate: {
        type: Number,
        default: 0,
      },
      usd: {
        type: Number,
        default: 0,
      },
      type: {
        type: String,
        enum: ["premium", "discount"],
        default: "premium",
      },
    },
    vat: {
      percentage: {
        type: Number,
        default: 0,
        min: [0, "Amount cannot be negative"],
      },
      amount: {
        type: Number,
        default: 0,
      },
    },

    itemTotal: {
      baseAmount: {
        type: Number,
        default: 0,
        min: [0, "Base Amount cannot be negative"],
      },
      makingChargesTotal: {
        type: Number,
        default: 0,
        min: [0, "Making Charges Total cannot be negative"],
      },
      premiumTotal: {
        type: Number,
        default: 0,
      },
      subTotal: {
        type: Number,
        default: 0,
        min: [0, "Sub Total cannot be negative"],
      },
      vatAmount: {
        type: Number,
        default: 0,
        min: [0, "VAT Amount cannot be negative"],
      },
      // Base amount on which VAT is calculated (Metal + Making or only Making)
      taxableAmount: {
        type: Number,
        default: 0,
        min: [0, "Taxable Amount cannot be negative"],
      },
      itemTotalAmount: {
        type: Number,
        default: 0,
        min: [0, "Item Total Amount cannot be negative"],
      },
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: [500, "Item notes cannot exceed 500 characters"],
    },

    itemStatus: {
      type: String,
      default: "Approved",
    },
  },
  {
    _id: true, // Each stock item will have its own _id
    timestamps: false, // We'll use the parent transaction timestamps
  }
);

const otherChargeSchema = new mongoose.Schema(
  {
    code: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OtherCharges",
      required: [true, "OtherCharges Code is required"],
      index: true, // Added index for better query performance
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    percentage: {
      type: Number,
      default: 0,
      min: [0, "Percentage cannot be negative"],
    },
    amount: {
      type: Number,
      default: 0,
      min: [0, "Amount cannot be negative"],
    },
    debit: {
      account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: [true, "Party Code is required"],
        index: true,
      },
      baseCurrency: {
        type: Number,
        default: 0,
        min: [0, "baseCurrency cannot be negative"],
      },
      foreignCurrency: {
        type: Number,
        default: 0,
        min: [0, "baseCurrency cannot be negative"],
      },
      currency: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CurrencyMaster",
        default: null,
      },
    },
    credit: {
      account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: [true, "Party Code is required"],
        index: true,
      },
      baseCurrency: {
        type: Number,
        default: 0,
        min: [0, "baseCurrency cannot be negative"],
      },
      foreignCurrency: {
        type: Number,
        default: 0,
        min: [0, "baseCurrency cannot be negative"],
      },
      currency: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CurrencyMaster",
        default: null,
      },
    },
    vatDetails: {
      vatNo: {
        type: String,
        default: null,
        trim: true,
      },
      invoiceNo: {
        type: String,
        default: null,
        trim: true,
      },
      invoiceDate: {
        type: Date,
        default: Date.now,
      },
      vatRate: {
        type: Number,
        default: 0,
      },
      vatAmount: {
        type: Number,
        default: 0,
      },
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, "Item notes cannot exceed 500 characters"],
    },
  },
  {
    _id: true, // Each stock item will have its own _id
    timestamps: false, // We'll use the parent transaction timestamps
  }
);

const MetalTransactionSchema = new mongoose.Schema(
  {
    // Transaction Type - Key field to differentiate between purchase and sale
    transactionType: {
      type: String,
      enum: [
        "purchase",
        "sale",
        "purchaseReturn",
        "saleReturn",
        "exportSale",
        "importPurchase",
        "exportSaleReturn",
        "importPurchaseReturn",
      ],
      required: [true, "Transaction type is required"],
      index: true,
    },

    // Basic Transaction Information
    fixed: {
      type: Boolean,
      default: false,
    },
    unfix: {
      type: Boolean,
      default: false,
    },
    hedge: {
      type: Boolean,
      default: false,
    },
    voucherType: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, "Voucher type cannot exceed 50 characters"],
    },
    prefix: {
      type: String,
      trim: true,
      default: null,
      maxlength: [10, "Prefix cannot exceed 10 characters"],
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
      // Allow null values but enforce uniqueness when present
    },
    hedgeVoucherNumber: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    // Party Information
    partyCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account", // For purchases: suppliers, For sales: customers
      required: [true, "Party Code is required"],
      index: true,
    },
    partyCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      required: [true, "Party Currency is required"],
    },
    // metalRate unit is a object iwth
    // metalRateUnit: {
    //     rateType: formData.metalRateid || "GOZ",
    //     rate: formData.rate || "",
    //     rateInGrams: Number(ratePerGram) || "", // need to edit
    //   }, this is sending from backend
    metalRateUnit: {
      rateType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MetalRateMaster",
      },
      rate: {
        type: Number,
      },
      rateInGrams: {
        type: Number,
      }
    },
    itemCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      default: null,
    },
    itemCurrencyRate: {
      type: Number,
      default: 1,
      min: [0, "Item Currency Rate cannot be negative"],
    },
    partyCurrencyRate: {
      type: Number,
      default: 1,
      min: [0, "Party Currency Rate cannot be negative"],
    },
    subLedger: {
      type: String,
      default: null,
      trim: true,
      maxlength: [100, "Sub Ledger cannot exceed 100 characters"],
    },
    supplierInvoiceNo: {
      type: String,
      default: null,
      trim: true,
    },
    supplierDate: {
      type: Date,
      default: null,
    },
    // Credit Terms
    crDays: {
      type: Number,
      default: 0,
      min: [0, "CR Days cannot be negative"],
    },
    creditDays: {
      type: Number,
      default: 0,
      min: [0, "Credit Days cannot be negative"],
    },
    baseCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      default: null,
    },
    dealOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DealOrder",
      default: null,
      index: true,
    },

    // MULTIPLE STOCK ITEMS
    stockItems: {
      type: [StockItemSchema],
      required: [true, "At least one stock item is required"],
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "Transaction must contain at least one stock item",
      },
    },
    otherCharges: {
      type: [otherChargeSchema],
      default: [],
    },

    totalSummary: {
      itemSubTotal: {
        type: Number,
        default: 0,
      },
      itemTotalVat: {
        type: Number,
        default: 0,
      },
      itemTotalAmount: {
        type: Number,
        default: 0,
      },
      totalOtherCharges: {
        type: Number,
        default: 0,
      },
      totalOtherChargesVat: {
        type: Number,
        default: 0,
      },
      netAmount: {
        type: Number,
        default: 0,
      },
      rounded: {
        type: Number,
        default: 0,
      },
      totalAmount: {
        type: Number,
        default: 0,
      },
    },

    // S3 ATTACHMENTS
    attachments: {
      type: [AttachmentSchema],
      default: [],
    },

    // Status and Tracking
    status: {
      type: String,
      enum: ["draft", "confirmed", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
    salesman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salesman",
      default: null,
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salesman",
      default: null,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    collection: "metaltransactions",
    optimisticConcurrency: true,
  }
);

// Optimized Compound Indexes for better performance
MetalTransactionSchema.index({
  transactionType: 1,
  partyCode: 1,
  voucherDate: -1,
});
MetalTransactionSchema.index({ transactionType: 1, status: 1, isActive: 1 });
MetalTransactionSchema.index({ transactionType: 1, createdAt: -1 });
MetalTransactionSchema.index({ "stockItems.stockCode": 1, transactionType: 1 });
MetalTransactionSchema.index({ voucherDate: -1, isActive: 1 });
MetalTransactionSchema.index({ partyCode: 1, isActive: 1, status: 1 });

// Virtual for formatted voucher date
MetalTransactionSchema.virtual("formattedVoucherDate").get(function () {
  if (!this.voucherDate) return null;
  return this.voucherDate.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
});

// Virtual to check if transaction is purchase
MetalTransactionSchema.virtual("isPurchase").get(function () {
  return this.transactionType === "purchase";
});

// Virtual to check if transaction is sale
MetalTransactionSchema.virtual("isSale").get(function () {
  return this.transactionType === "sale";
});

// Virtual to get total number of stock items
MetalTransactionSchema.virtual("totalStockItems").get(function () {
  return this.stockItems ? this.stockItems.length : 0;
});

// Instance method to update session totals
// MetalTransactionSchema.methods.updateSessionTotals = function (sessionTotals) {
//   if (sessionTotals) {
//     this.totalAmountSession.totalAmountAED = sessionTotals.totalAmountAED || 0;
//     this.totalAmountSession.netAmountAED = sessionTotals.netAmountAED || 0;
//     this.totalAmountSession.vatAmount = sessionTotals.vatAmount || 0;
//     this.totalAmountSession.vatPercentage = sessionTotals.vatPercentage || 0;
//   }
//   return this;
// };

// Instance method to calculate session totals from stock items
// MetalTransactionSchema.methods.calculateSessionTotals = function (
//   vatPercentage = 0
// ) {
//   if (!this.stockItems || this.stockItems.length === 0) {
//     return this;
//   }

//   // Calculate totals from stock items
//   const netAmount = this.stockItems.reduce((sum, item) => {
//     return sum + (item.itemTotal?.subTotal || 0);
//   }, 0);

//   this.totalAmountSession.netAmountAED = netAmount;

//   // Calculate VAT
//   if (vatPercentage > 0) {
//     this.totalAmountSession.vatPercentage = vatPercentage;
//     this.totalAmountSession.vatAmount = (netAmount * vatPercentage) / 100;
//   } else {
//     // Sum VAT from individual items
//     this.totalAmountSession.vatAmount = this.stockItems.reduce((sum, item) => {
//       return sum + (item.itemTotal?.vatAmount || 0);
//     }, 0);
//     this.totalAmountSession.vatPercentage =
//       netAmount > 0 ? (this.totalAmountSession.vatAmount / netAmount) * 100 : 0;
//   }

//   this.totalAmountSession.totalAmountAED =
//     this.totalAmountSession.netAmountAED + this.totalAmountSession.vatAmount;

//   return this;
// };

// Static method to update session totals for multiple transactions
// MetalTransactionSchema.statics.updateMultipleSessionTotals = async function (
//   transactionIds,
//   sessionTotals
// ) {
//   return this.updateMany(
//     { _id: { $in: transactionIds } },
//     {
//       $set: {
//         "totalAmountSession.totalAmountAED": sessionTotals.totalAmountAED || 0,
//         "totalAmountSession.netAmountAED": sessionTotals.netAmountAED || 0,
//         "totalAmountSession.vatAmount": sessionTotals.vatAmount || 0,
//         "totalAmountSession.vatPercentage": sessionTotals.vatPercentage || 0,
//         updatedAt: new Date(),
//       },
//     }
//   );
// };

// Static method to get purchases by party
MetalTransactionSchema.statics.getPurchasesByParty = async function (
  partyId,
  limit = 50
) {
  return this.find({
    transactionType: "purchase",
    partyCode: partyId,
    isActive: true,
  })
    .sort({ voucherDate: -1, createdAt: -1 })
    .limit(limit)
    .populate("partyCode", "name code")
    .populate("partyCurrency", "code symbol")
    .populate("itemCurrency", "code symbol")
    .populate("stockItems.stockCode", "code description")
    .populate("stockItems.metalRate", "metalType rate")
    .populate("createdBy", "name email");
};

// Static method to get sales by party
MetalTransactionSchema.statics.getSalesByParty = async function (
  partyId,
  limit = 50
) {
  return this.find({
    transactionType: "sale",
    partyCode: partyId,
    isActive: true,
  })
    .sort({ voucherDate: -1, createdAt: -1 })
    .limit(limit)
    .populate("partyCode", "name code")
    .populate("partyCurrency", "code symbol")
    .populate("itemCurrency", "code symbol")
    .populate("stockItems.stockCode", "code description")
    .populate("stockItems.metalRate", "metalType rate")
    .populate("createdBy", "name email");
};

// Static method to get transactions by type and date range
MetalTransactionSchema.statics.getTransactionsByDateRange = async function (
  transactionType,
  startDate,
  endDate,
  limit = 100
) {
  return this.find({
    transactionType,
    voucherDate: {
      $gte: startDate,
      $lte: endDate,
    },
    isActive: true,
  })
    .sort({ voucherDate: -1 })
    .limit(limit)
    .populate("partyCode", "name code")
    .populate("stockItems.stockCode", "code description");
};

// Static method to get purchase statistics
MetalTransactionSchema.statics.getPurchaseStats = async function (
  partyId = null
) {
  const matchCondition = {
    transactionType: "purchase",
    isActive: true,
    status: "completed",
  };
  if (partyId) {
    matchCondition.partyCode = new mongoose.Types.ObjectId(partyId);
  }

  return this.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalStockItems: { $sum: { $size: "$stockItems" } },
        // Session totals
        sessionTotalAmount: { $sum: "$totalAmountSession.totalAmountAED" },
        sessionNetAmount: { $sum: "$totalAmountSession.netAmountAED" },
        sessionVatAmount: { $sum: "$totalAmountSession.vatAmount" },
        avgTransactionValue: { $avg: "$totalAmountSession.totalAmountAED" },
      },
    },
  ]);
};

// Static method to get sale statistics
// MetalTransactionSchema.statics.getSaleStats = async function (partyId = null) {
//   const matchCondition = {
//     transactionType: "sale",
//     isActive: true,
//     status: "completed",
//   };
//   if (partyId) {
//     matchCondition.partyCode = new mongoose.Types.ObjectId(partyId);
//   }

//   return this.aggregate([
//     { $match: matchCondition },
//     {
//       $group: {
//         _id: null,
//         totalTransactions: { $sum: 1 },
//         totalStockItems: { $sum: { $size: "$stockItems" } },
//         // Session totals

//       },
//     },
//   ]);
// };

// Instance method to add stock item to transaction
MetalTransactionSchema.methods.addStockItem = function (stockItemData) {
  this.stockItems.push(stockItemData);
  return this;
};

// Instance method to remove stock item from transaction
MetalTransactionSchema.methods.removeStockItem = function (stockItemId) {
  this.stockItems = this.stockItems.filter(
    (item) => item._id.toString() !== stockItemId.toString()
  );
  return this;
};

// Instance method to get stock item by id
MetalTransactionSchema.methods.getStockItem = function (stockItemId) {
  return this.stockItems.find(
    (item) => item._id.toString() === stockItemId.toString()
  );
};

const MetalTransaction = mongoose.model(
  "MetalTransaction",
  MetalTransactionSchema
);
export default MetalTransaction;
