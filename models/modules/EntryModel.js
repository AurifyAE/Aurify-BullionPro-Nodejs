import mongoose from "mongoose";

// Attachment subdocument schema
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

const entrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "Entry type is required"],
      enum: [
        "metal-receipt",
        "metal-payment",
        "cash-receipt",
        "cash-payment",
        "currency-receipt",
      ],
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VoucherMaster",
    },
    voucherCode: {
      type: String,
    },
    voucherDate: {
      type: Date,
      required: [true, "Voucher date is required"],
    },
    invoiceReference: {
      type: String,
      trim: true,
      default: null,
    },
    invoiceDate: {
      type: Date,
      default: null,
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: [0, "Total amount must be positive"],
    },
    totalGrossWeight: {
      type: Number,
      default: 0,
      min: [0, "Total gross weight must be positive"],
    },
    totalPurityWeight: {
      type: Number,
      default: 0,
      min: [0, "Total purity weight must be positive"],
    },
    totalNetWeight: {
      type: Number,
      default: 0,
      min: [0, "Total net weight must be positive"],
    },
    totalOzWeight: {
      type: Number,
      default: 0,
      min: [0, "Total oz weight must be positive"],
    },
    stockItems: [
      {
        stock: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MetalStock",
          required: [true, "Stock reference is required for stockItems"],
        },
        grossWeight: {
          type: Number,
          required: [true, "Gross weight is required for stockItems"],
          min: [0, "Gross weight must be positive"],
        },
        purity: {
          type: Number,
          required: [true, "Purity is required for stockItems"],
          min: [0, "Purity must be positive"],
        },
        purityWeight: {
          type: Number,
          required: [true, "Purity weight is required for stockItems"],
          min: [0, "Purity weight must be positive"],
        },
        netWeight: {
          type: Number,
          required: [true, "Net weight is required for stockItems"],
          min: [0, "Net weight must be positive"],
        },
        ozWeight: {
          type: Number,
          required: [true, "Oz weight is required for stockItems"],
          min: [0, "Oz weight must be positive"],
        },
        pieces: {
          type: Number,
          default: 0,
          min: [0, "Pieces must be non-negative"],
        },
        remarks: {
          type: String,
          trim: true,
        },
      },
    ],
    cash: [
      {
        branch: {
          type: String,
          default: null,
        },
        cashType: {
          type: String,
          required: [true, "Cash type is required for cash entries"],
          enum: ["cash", "bank", "cheque", "transfer", "card"],
        },
        currency: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "CurrencyMaster",
          required: [true, "Currency is required for cash entries"],
        },
        amount: {
          type: Number,
          required: [true, "Amount is required for cash entries"],
          min: [0, "Amount must be positive"],
        },
        amountWithTnr: {
          type: Number,
          default: 0,
          min: [0, "Amount with TNR must be positive"],
        },
        remarks: {
          type: String,
          trim: true,
        },
        Totalamount: {
          type: Number,
          default: 0,
        },
        vatPercentage: {
          type: Number,
          default: 0,
        },
        vatAmount: {
          type: Number,
          default: 0,
        },
        // Additional fields for different cash types
        account: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
          default: null,
        },
        chequeNo: {
          type: String,
          trim: true,
        },
        chequeDate: {
          type: Date,
          default: null,
        },
        chequeBank: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
          default: null,
        },
        transferReference: {
          type: String,
          trim: true,
        },
        transferAccount: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
          default: null,
        },
        cardChargePercent: {
          type: Number,
          default: 0,
        },
        cardChargeAmount: {
          type: Number,
          default: 0,
        },
        // FX Rate fields for gain/loss calculation
        fxRate: {
          type: Number,
          default: 1,
        },
        fxBaseRate: {
          type: Number,
          default: 1,
        },
        fxGain: {
          type: Number,
          default: 0,
        },
        fxLoss: {
          type: Number,
          default: 0,
        },
        // PDC (Post-Dated Cheque) fields
        isPDC: {
          type: Boolean,
          default: false,
        },
        pdcStatus: {
          type: String,
          enum: ["pending", "cleared", "bounced", null],
          default: null,
        },
        pdcIssueAccount: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
          default: null,
        },
        pdcReceiptAccount: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
          default: null,
        },
      },
    ],
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "cancelled"],
      default: "approved",
    },
    // Attachments array
    attachments: {
      type: [AttachmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate totals and validate
entrySchema.pre("save", function (next) {
  // Validate required fields based on type
  if (["metal-receipt", "metal-payment"].includes(this.type)) {
    if (!this.stockItems?.length) {
      return next(
        new Error("stockItems array cannot be empty for metal entries")
      );
    }
    // Clear cash array for metal entries
    this.cash = undefined;
  } else if (
    ["cash-receipt", "cash-payment", "currency-receipt"].includes(this.type)
  ) {
    if (!this.cash?.length) {
      return next(new Error("Cash array cannot be empty for cash entries"));
    }
    // Clear stockItems array for cash entries
    this.stockItems = undefined;
  }

  // Calculate totals for metal entries
  if (this.stockItems?.length) {
    this.totalGrossWeight = this.stockItems.reduce(
      (sum, item) => sum + (item.grossWeight || 0),
      0
    );
    this.totalPurityWeight = this.stockItems.reduce(
      (sum, item) => sum + (item.purityWeight || 0),
      0
    );
    this.totalNetWeight = this.stockItems.reduce(
      (sum, item) => sum + (item.netWeight || 0),
      0
    );
    this.totalOzWeight = this.stockItems.reduce(
      (sum, item) => sum + (item.ozWeight || 0),
      0
    );
  } else {
    this.totalGrossWeight = 0;
    this.totalPurityWeight = 0;
    this.totalNetWeight = 0;
    this.totalOzWeight = 0;
  }

  // Calculate total amount for cash entries
  if (this.cash?.length) {
    this.totalAmount = this.cash.reduce(
      (sum, cashItem) => sum + (cashItem.amount || 0),
      0
    );
  } else {
    this.totalAmount = 0;
  }

  next();
});

// Indexes for better query performance
entrySchema.index({ type: 1, voucherDate: -1 });
entrySchema.index({ party: 1, createdAt: -1 });
entrySchema.index({ enteredBy: 1, createdAt: -1 });
entrySchema.index({ "attachments.uploadedBy": 1 });

const Entry = mongoose.model("Entry", entrySchema);

export default Entry;
