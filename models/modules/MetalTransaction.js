import mongoose from "mongoose";

// Sub-schema for individual stock items within a transaction
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
    grossWeight: {
      type: Number,
      default: 0,
      min: [0, "Gross Weight cannot be negative"],
    },
    purity: {
      type: Number,
      required: [true, "Purity is required"],
      min: [0, "Purity cannot be negative"],
      max: [100, "Purity cannot exceed 100%"],
    },
    standerdPurity: {
      type: Number,
      required: [true, "Standard Purity is required"],
      min: [0, "Standard Purity cannot be negative"],
      max: [100, "Standard Purity cannot exceed 100%"],
    },
    purityDiffWeight: {
      type: Number,
      default: 0,
    },
    purityWeight: {
      type: Number,
      required: [true, "Purity Weight is required"],
      min: [0, "Purity Weight cannot be negative"],
    },
    pureWeight: {
      type: Number,
      required: [true, "pureWeight is required"],
      min: [0, "pureWeight cannot be negative"],
    },
    weightInOz: {
      type: Number,
      required: [true, "Weight in Oz is required"],
      min: [0, "Weight in Oz cannot be negative"],
    },
    cashDebit: {
      type: Number,
      default: 0
    },
    cashCredit: {
      type: Number,
      default: 0
    },
    goldDebit: {
      type: Number,
      default: 0
    },
    goldCredit: {
      type: Number,
      default: 0
    },
    // Individual metal rate for this stock item
    metalRate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      required: [true, "Metal Rate is required for stock item"],
    },
    // Metal Rate & Requirements for this specific item
    metalRateRequirements: {
      amount: {
        type: Number,
        default: 0,
        min: [0, "Amount cannot be negative"],
      },
      rate: {
        type: Number,
        default: 0,
        min: [0, "Rate cannot be negative"],
      },
    },
    // Making Charges for this specific item
    makingCharges: {
      amount: {
        type: Number,
        default: 0,
        min: [0, "Amount cannot be negative"],
      },
      rate: {
        type: Number,
        default: 0,
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
    otherCharges: {
      amount: {
        type: Number,
        default: 0,
        min: [0, "Amount cannot be negative"],
      },
      // rate is actually the percentage
      rate: {
        type: Number,
        default: 0,
      },
      description: {
        type: String,
        default: null,
      },
    },
    // Premium for this specific item
    premium: {
      amount: {
        type: Number,
        default: 0,
      },
      rate: {
        type: Number,
        default: 0,
      },
    },
    // Item-specific totals
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
      itemTotalAmount: {
        type: Number,
        default: 0,
        min: [0, "Item Total Amount cannot be negative"],
      },
    },
    // Item-specific notes
    itemNotes: {
      type: String,
      trim: true,
      maxlength: [500, "Item notes cannot exceed 500 characters"],
    },
    // Item status
    itemStatus: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
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
      enum: ["purchase", "sale", "purchaseReturn", "saleReturn"],
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
      // Allow null values but enforce uniqueness when present
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
    itemCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      default: null,
    },
    subLedger: {
      type: String,
      default: null,
      trim: true,
      maxlength: [100, "Sub Ledger cannot exceed 100 characters"],
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

    // SESSION-SPECIFIC TOTALS - ONLY TOTALS KEPT
    totalAmountSession: {
      totalAmountAED: {
        type: Number,
        default: 0,
        min: [0, "Session Total Amount cannot be negative"],
      },
      netAmountAED: {
        type: Number,
        default: 0,
        min: [0, "Session Net Amount cannot be negative"],
      },
      vatAmount: {
        type: Number,
        default: 0,
        min: [0, "Session VAT Amount cannot be negative"],
      },
      vatPercentage: {
        type: Number,
        default: 0,
        min: [0, "Session VAT Percentage cannot be negative"],
        max: [100, "Session VAT Percentage cannot exceed 100%"],
      },
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
MetalTransactionSchema.methods.updateSessionTotals = function (sessionTotals) {
  if (sessionTotals) {
    this.totalAmountSession.totalAmountAED = sessionTotals.totalAmountAED || 0;
    this.totalAmountSession.netAmountAED = sessionTotals.netAmountAED || 0;
    this.totalAmountSession.vatAmount = sessionTotals.vatAmount || 0;
    this.totalAmountSession.vatPercentage = sessionTotals.vatPercentage || 0;
  }
  return this;
};

// Instance method to calculate session totals from stock items
MetalTransactionSchema.methods.calculateSessionTotals = function (
  vatPercentage = 0
) {
  if (!this.stockItems || this.stockItems.length === 0) {
    return this;
  }

  // Calculate totals from stock items
  const netAmount = this.stockItems.reduce((sum, item) => {
    return sum + (item.itemTotal?.subTotal || 0);
  }, 0);

  this.totalAmountSession.netAmountAED = netAmount;

  // Calculate VAT
  if (vatPercentage > 0) {
    this.totalAmountSession.vatPercentage = vatPercentage;
    this.totalAmountSession.vatAmount = (netAmount * vatPercentage) / 100;
  } else {
    // Sum VAT from individual items
    this.totalAmountSession.vatAmount = this.stockItems.reduce((sum, item) => {
      return sum + (item.itemTotal?.vatAmount || 0);
    }, 0);
    this.totalAmountSession.vatPercentage =
      netAmount > 0 ? (this.totalAmountSession.vatAmount / netAmount) * 100 : 0;
  }

  this.totalAmountSession.totalAmountAED =
    this.totalAmountSession.netAmountAED + this.totalAmountSession.vatAmount;

  return this;
};

// Static method to update session totals for multiple transactions
MetalTransactionSchema.statics.updateMultipleSessionTotals = async function (
  transactionIds,
  sessionTotals
) {
  return this.updateMany(
    { _id: { $in: transactionIds } },
    {
      $set: {
        "totalAmountSession.totalAmountAED": sessionTotals.totalAmountAED || 0,
        "totalAmountSession.netAmountAED": sessionTotals.netAmountAED || 0,
        "totalAmountSession.vatAmount": sessionTotals.vatAmount || 0,
        "totalAmountSession.vatPercentage": sessionTotals.vatPercentage || 0,
        updatedAt: new Date(),
      },
    }
  );
};

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
MetalTransactionSchema.statics.getSaleStats = async function (partyId = null) {
  const matchCondition = {
    transactionType: "sale",
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
