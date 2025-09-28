import mongoose from "mongoose";

const entrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "Entry type is required"],
      enum: [
        "metal-receipt",
        "metal-payment",
        "cash receipt",
        "cash payment",
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
          type: mongoose.Schema.Types.ObjectId,
          ref: "Branch",
          default: null,
        },
        cashType: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "AccountMaster",
          required: [true, "Cash type is required for cash entries"],
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
          default: 0
        },
        vatPercentage: {
          type: Number,
          default: 0
        },
        vatAmount: {
          type: Number,
          default: 0
        }
      },
    ],
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
      return next(new Error("stockItems array cannot be empty for metal entries"));
    }
    // Clear cash array for metal entries
    this.cash = undefined;
  } else if (["cash-receipt", "cash-payment", "currency-receipt"].includes(this.type)) {
    if (!this.cash?.length) {
      return next(new Error("Cash array cannot be empty for cash entries"));
    }
    // Clear stockItems array for cash entries
    this.stockItems = undefined;
  }

  // Calculate totals for metal entries
  if (this.stockItems?.length) {
    this.totalGrossWeight = this.stockItems.reduce((sum, item) => sum + (item.grossWeight || 0), 0);
    this.totalPurityWeight = this.stockItems.reduce((sum, item) => sum + (item.purityWeight || 0), 0);
    this.totalNetWeight = this.stockItems.reduce((sum, item) => sum + (item.netWeight || 0), 0);
    this.totalOzWeight = this.stockItems.reduce((sum, item) => sum + (item.ozWeight || 0), 0);
  } else {
    this.totalGrossWeight = 0;
    this.totalPurityWeight = 0;
    this.totalNetWeight = 0;
    this.totalOzWeight = 0;
  }

  // Calculate total amount for cash entries
  if (this.cash?.length) {
    this.totalAmount = this.cash.reduce((sum, cashItem) => sum + (cashItem.amount || 0), 0);
  } else {
    this.totalAmount = 0;
  }

  next();
});

// Indexes for better query performance
entrySchema.index({ type: 1, voucherDate: -1 });
entrySchema.index({ party: 1, createdAt: -1 });
entrySchema.index({ enteredBy: 1, createdAt: -1 });

const Entry = mongoose.model("Entry", entrySchema);

export default Entry;