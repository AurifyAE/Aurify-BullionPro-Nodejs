import mongoose from "mongoose";

const progressStages = [
  "created",
  "sentToPurchase",
  "sentToSales",
  "awaitingApproval",
  "approved",
  "inFulfilment",
  "completed",
  "cancelled",
  "onHold",
];

const ProgressHistorySchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: progressStages,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      trim: true,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const StockItemSchema = new mongoose.Schema(
  {
    lineId: {
      type: String,
      index: true,
    },
    stockCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalStock",
      required: false,
    },
    description: {
      type: String,
      trim: true,
    },
    pieces: {
      type: Number,
      default: 0,
    },
    grossWeight: {
      type: Number,
      default: 0,
    },
    purity: {
      type: Number,
      default: 0,
    },
    pureWeight: {
      type: Number,
      default: 0,
    },
    purityStd: {
      type: Number,
      default: 0,
    },
    purityDifference: {
      type: Number,
      default: 0,
    },
    weightInOz: {
      type: Number,
      default: 0,
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
    metalRate: {
      type: new mongoose.Schema(
        {
          type: { type: mongoose.Schema.Types.Mixed },
          rate: Number,
          rateInGram: Number,
          bidValue: Number,
          currentBidValue: Number,
        },
        { _id: false }
      ),
      default: {},
    },
    metalRateRequirements: {
      type: new mongoose.Schema(
        {
          amount: Number,
          rateInGram: Number,
        },
        { _id: false }
      ),
      default: {},
    },
    makingUnit: {
      type: new mongoose.Schema(
        {
          unit: { type: String, default: null },
          makingRate: { type: Number, default: 0 },
          makingAmount: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: {},
    },
    premiumDiscount: {
      type: new mongoose.Schema(
        {
          currency: { type: String, default: "USD" },
          type: {
            type: String,
            enum: ["premium", "discount"],
            default: "premium",
          },
          amount: { type: Number, default: 0 },
          rate: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: {},
    },
    vat: {
      type: new mongoose.Schema(
        {
          percentage: { type: Number, default: 0 },
          amount: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: {},
    },
    itemTotal: {
      type: new mongoose.Schema(
        {
          baseAmount: { type: Number, default: 0 },
          makingChargesTotal: { type: Number, default: 0 },
          premiumTotal: { type: Number, default: 0 },
          subTotal: { type: Number, default: 0 },
          vatAmount: { type: Number, default: 0 },
          itemTotalAmount: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: {},
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    itemStatus: {
      type: String,
      default: "Pending",
    },
  },
  {
    _id: true,
    strict: false,
  }
);

const OtherChargesSchema = new mongoose.Schema(
  {
    code: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OtherCharges",
    },
    description: {
      type: String,
      trim: true,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    debit: {
      type: new mongoose.Schema(
        {
          account: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
          },
          baseCurrency: Number,
          foreignCurrency: Number,
          currency: { type: mongoose.Schema.Types.ObjectId, ref: "CurrencyMaster" },
        },
        { _id: false }
      ),
      default: {},
    },
    credit: {
      type: new mongoose.Schema(
        {
          account: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
          },
          baseCurrency: Number,
          foreignCurrency: Number,
          currency: { type: mongoose.Schema.Types.ObjectId, ref: "CurrencyMaster" },
        },
        { _id: false }
      ),
      default: {},
    },
    vatDetails: {
      type: new mongoose.Schema(
        {
          vatNo: { type: String, trim: true },
          invoiceNo: { type: String, trim: true },
          invoiceDate: { type: Date, default: Date.now },
          vatRate: { type: Number, default: 0 },
          vatAmount: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: {},
    },
  },
  { _id: true, strict: false }
);

const DealOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ["purchase", "sale", "purchaseReturn", "saleReturn"],
      required: true,
    },
    orderType: {
      type: String,
      enum: ["PURCHASE", "SALES", "PURCHASE_RETURN", "SALES_RETURN"],
      required: true,
    },
    partyCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    partyName: {
      type: String,
      trim: true,
    },
    partyCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
      required: true,
    },
    itemCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
    },
    itemCurrencyRate: {
      type: Number,
      default: 1,
      min: [0, "Item Currency Rate cannot be negative"],
    },
    // Fix/Unfix/Hedge fields (matching MetalTransaction)
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
    partyCurrencyRate: {
      type: Number,
      default: 1,
    },
    rate: {
      type: Number,
      default: 0,
    },
    rateInGrams: {
      type: Number,
      default: 0,
    },
    metalRateUnit: {
      type: String,
      default: null,
    },
    conversionRate: {
      type: Number,
      default: 0,
    },
    deliveryDate: {
      type: Date,
    },
    supplierInvoiceNumber: {
      type: String,
      trim: true,
    },
    supplierInvoiceDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    enteredBy: {
      type: String,
      trim: true,
    },
    salesmanId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    salesmanName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "pending", "inProgress", "onHold", "completed", "cancelled"],
      default: "draft",
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: null,
    },
    progress: {
      currentStage: {
        type: String,
        enum: progressStages,
        default: "created",
      },
      history: {
        type: [ProgressHistorySchema],
        default: [],
      },
    },
    stockItems: {
      type: [StockItemSchema],
      default: [],
    },
    otherCharges: {
      type: [OtherChargesSchema],
      default: [],
    },
    totalSummary: {
      type: new mongoose.Schema(
        {
          itemSubTotal: { type: Number, default: 0 },
          itemTotalVat: { type: Number, default: 0 },
          itemTotalAmount: { type: Number, default: 0 },
          totalOtherCharges: { type: Number, default: 0 },
          totalOtherChargesVat: { type: Number, default: 0 },
          netAmount: { type: Number, default: 0 },
          rounded: { type: Number, default: 0 },
          totalAmount: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: {},
    },
    baseCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrencyMaster",
    },
    notes: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
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

DealOrderSchema.statics.progressStages = progressStages;

const DealOrder =
  mongoose.models.DealOrder || mongoose.model("DealOrder", DealOrderSchema);

export default DealOrder;

