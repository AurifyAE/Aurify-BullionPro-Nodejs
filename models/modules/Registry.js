import mongoose from "mongoose";

const RegistrySchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: [true, "Transaction ID is required"],
      trim: true,
      uppercase: true,

    },
    metalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalTransaction",
    },
    InventoryLogID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryLog",
    },
    fixingTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionFixing",
    },
    EntryTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Entry",
    },
    TransferTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FundTransfer",
    },
    costCenter: {
      type: String,
      ref: "CostCenterMaster",
      trim: true,
      default: null,
      uppercase: true,
    },
    type: {
      type: String,
      required: [true, "Transaction type is required"],
    },
    description: {
      type: String,
      required: [true, "Transaction description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    isBullion: {
      type: Boolean,
      default: null,
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
    value: {
      type: Number,
      required: [true, "Transaction value is required"],
      // min: [0, "Value cannot be negative"],
    },
    goldBidValue: {
      type: Number,
      default: null,
      // min: [0, "Gold bid value cannot be negative"],
    },
    debit: {
      type: Number,
      default: 0,
      // min: [0, "Debit cannot be negative"],
    },
    credit: {
      type: Number,
      default: 0,
      // min: [0, "Credit cannot be negative"],
    },
    metalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MetalStock', // Reference to metal master for inv update
    },
    purity: {
      type: Number,
      default: null,
    },
    pureWeight: {
      type: Number,
      default: null,
    },
    grossWeight: {
      type: Number,
      default: null,
    },
    runningBalance: {
      type: Number,
      default: 0,
    },
    previousBalance: {
      type: Number,
      default: 0,
    },
    transactionDate: {
      type: Date,
      required: [true, "Transaction date is required"],
      default: () => new Date(),
    },
    reference: {
      type: String,
      trim: true,
      maxlength: [100, "Reference cannot exceed 100 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "completed",
    },
    isActive: {
      type: Boolean,
      default: true,
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
  }
);

// Indexes for better performance
RegistrySchema.index({ transactionId: 1 });
RegistrySchema.index({ costCenter: 1 });
RegistrySchema.index({ type: 1 });
RegistrySchema.index({ transactionDate: -1 });
RegistrySchema.index({ costCenter: 1, transactionDate: -1 });
RegistrySchema.index({ status: 1 });
RegistrySchema.index({ createdAt: -1 });

// Virtual for formatted transaction date
RegistrySchema.virtual("formattedDate").get(function () {
  return this.transactionDate.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

// Pre-save middleware to ensure uppercase codes and generate transaction ID
RegistrySchema.pre("save", async function (next) {
  try {
    // Ensure cost center is uppercase
    if (this.costCenter) {
      this.costCenter = this.costCenter.toUpperCase();
    }

    // Generate transaction ID if not provided
    if (!this.transactionId) {
      const year = new Date().getFullYear();
      let isUnique = false;
      let transactionId;

      // Keep generating until we get a unique transaction ID
      while (!isUnique) {
        const randomNumber = Math.floor(Math.random() * 900) + 100; // Generates 3-digit random number (100-999)
        transactionId = `TXN${year}${randomNumber}`;

        // Check if this transaction ID already exists
        const existing = await this.constructor.findOne({ transactionId });
        if (!existing) {
          isUnique = true;
        }
      }

      this.transactionId = transactionId;
    }

    // Validate debit/credit logic
    if (this.debit > 0 && this.credit > 0) {
      throw new Error("Transaction cannot have both debit and credit amounts");
    }

    // Calculate running balance if not provided
    if (this.isNew) {
      // Get the last transaction for this cost center
      const lastTransaction = await this.constructor
        .findOne({ costCenter: this.costCenter })
        .sort({ transactionDate: -1, createdAt: -1 });

      if (lastTransaction) {
        this.previousBalance = lastTransaction.runningBalance;
      } else {
        this.previousBalance = 0;
      }

      // Calculate running balance based on debit/credit
      if (this.debit > 0) {
        this.runningBalance = this.previousBalance - this.debit;
      } else if (this.credit > 0) {
        this.runningBalance = this.previousBalance + this.credit;
      } else {
        this.runningBalance = this.previousBalance;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static method to generate next random transaction ID
RegistrySchema.statics.generateTransactionId = async function (year = null) {
  const currentYear = year || new Date().getFullYear();
  let isUnique = false;
  let transactionId;

  // Keep generating until we get a unique transaction ID
  while (!isUnique) {
    const randomNumber = Math.floor(Math.random() * 900) + 100; // Generates 3-digit random number (100-999)
    transactionId = `TXN${currentYear}${randomNumber}`;

    // Check if this transaction ID already exists
    const existing = await this.findOne({ transactionId });
    if (!existing) {
      isUnique = true;
    }
  }

  return transactionId;
};

// Static method to get balance for a cost center
RegistrySchema.statics.getBalance = async function (costCenterCode) {
  const lastTransaction = await this.findOne({
    costCenter: costCenterCode.toUpperCase(),
  }).sort({ transactionDate: -1, createdAt: -1 });

  return lastTransaction ? lastTransaction.runningBalance : 0;
};

// Static method to get transactions by cost center
RegistrySchema.statics.getTransactionsByCostCenter = async function (
  costCenterCode,
  limit = 50
) {
  return this.find({
    costCenter: costCenterCode.toUpperCase(),
  })
    .sort({ transactionDate: -1 })
    .limit(limit)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");
};

// Static method to get transactions by type
RegistrySchema.statics.getTransactionsByType = async function (
  type,
  limit = 50
) {
  return this.find({ type })
    .sort({ transactionDate: -1 })
    .limit(limit)
    .populate("createdBy", "name email");
};

const Registry = mongoose.model("Registry", RegistrySchema);
export default Registry;
