import mongoose from "mongoose";

const AccountSchema = new mongoose.Schema(
  {
    // Basic Account Information
    accountType: {
      type: String,
      default: "DEBTOR",
      // enum: ["DEBTOR", "SUPPLIER"],
      required: [true, "Account type is required"],
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [10, "Title cannot exceed 10 characters"],
    },
    accountCode: {
      type: String,
      required: [true, "Account code is required"],
      trim: true,
      uppercase: true,
      maxlength: [20, "Account code cannot exceed 20 characters"],
      match: [
        /^[A-Z0-9]+$/,
        "Account code should contain only uppercase letters and numbers",
      ],
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [100, "Customer name cannot exceed 100 characters"],
    },
    classification: {
      type: String,
      trim: true,
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, "Remarks cannot exceed 500 characters"],
      default: null,
    },
    // password
    password: {
      type: String,
      trim: true,
      default: null,
    },
    passwordHash: { type: String, required: true },
    passwordEncrypted: { type: String, required: true },
    passwordIV: { type: String, required: true },
    // Balance Information
    balances: {
      goldBalance: {
        totalGrams: { type: Number, default: 0 },
        totalValue: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now },
      },
      cashBalance: {
        currency: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "CurrencyMaster",
          default: null,
        },
        amount: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now },
      },
      totalOutstanding: { type: Number, default: 0 },
      lastBalanceUpdate: { type: Date, default: Date.now },
    },

    // A/C Definition
    acDefinition: {
      currencies: {
        type: [
          {
            currency: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "CurrencyMaster",
            },
            isDefault: { type: Boolean, default: false },
          },
        ],
        required: [true, "At least one currency is required"],
        validate: {
          validator: function (currencies) {
            return currencies && currencies.length > 0;
          },
          message: "At least one currency must be specified",
        },
      },
      branches: {
        type: [
          {
            branch: { type: mongoose.Schema.Types.ObjectId },
            isDefault: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
    },

    // Limits & Margins
    limitsMargins: {
      type: [
        {
          creditDaysAmt: { type: Number, min: 0, default: 0 },
          creditDaysMtl: { type: Number, min: 0, default: 0 },
          shortMargin: {
            type: Number,
            min: 0,
            max: 100,
            required: [true, "Short margin is required"],
          },
          longMargin: { type: Number, min: 0, max: 100, default: 0 },
        },
      ],
      default: [],
    },

    // Address Details
    addresses: {
      type: [
        {
          streetAddress: {
            type: String,
            trim: true,
            maxlength: 200,
            default: null,
          },
          city: { type: String, trim: true, maxlength: 50, default: null },
          country: { type: String, trim: true, maxlength: 50, default: null },
          zipCode: { type: String, trim: true, maxlength: 20, default: null },
          phoneNumber1: {
            type: String,
            trim: true,
            match: /^[0-9]{10,15}$/,
            default: null,
          },
          phoneNumber2: {
            type: String,
            trim: true,
            match: /^[0-9]{10,15}$/,
            default: null,
          },
          phoneNumber3: {
            type: String,
            trim: true,
            match: /^[0-9]{10,15}$/,
            default: null,
          },
          email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [
              /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
              "Please enter a valid email",
            ],
            default: null,
          },
          telephone: {
            type: String,
            trim: true,
            match: /^[0-9]{10,15}$/,
            default: null,
          },
          website: { type: String, trim: true, default: null },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    // Employee Details
    employees: {
      type: [
        {
          name: { type: String, trim: true, maxlength: 100, default: null },
          designation: {
            type: String,
            trim: true,
            maxlength: 50,
            default: null,
          },
          email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [
              /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
              "Please enter a valid email",
            ],
            default: null,
          },
          mobile: {
            type: String,
            trim: true,
            match: /^[0-9]{10,15}$/,
            default: null,
          },
          poAlert: { type: Boolean, default: false },
          soAlert: { type: Boolean, default: false },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    // VAT/GST Details - FIXED: Made completely optional
    vatGstDetails: {
      type: {
        vatStatus: {
          type: String,
          enum: ["REGISTERED", "UNREGISTERED", "EXEMPTED"],
          default: null,
        },
        vatNumber: { type: String, trim: true, maxlength: 50, default: null },
        documents: {
          type: [
            {
              fileName: { type: String, default: null },
              filePath: { type: String, default: null },
              fileType: { type: String, default: null },
              s3Key: { type: String, default: null },
              uploadedAt: { type: Date, default: Date.now },
            },
          ],
          default: [],
        },
      },
      default: null, // FIXED: Made the entire vatGstDetails optional
    },

    // Bank Details
    bankDetails: {
      type: [
        {
          bankName: { type: String, trim: true, maxlength: 100, default: null },
          swiftId: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: 20,
            default: null,
          },
          iban: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: 50,
            default: null,
          },
          accountNumber: {
            type: String,
            trim: true,
            maxlength: 30,
            default: null,
          },
          branchCode: {
            type: String,
            trim: true,
            maxlength: 20,
            default: null,
          },
          purpose: { type: String, default: null },
          country: { type: String, trim: true, maxlength: 50, default: null },
          city: { type: String, trim: true, maxlength: 50, default: null },
          routingCode: {
            type: String,
            trim: true,
            maxlength: 20,
            default: null,
          },
          address: { type: String, trim: true, maxlength: 200, default: null },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    // KYC Details - FIXED: Made completely optional
    kycDetails: {
      type: [
        {
          documentType: { type: String, trim: true, default: null },
          documentNumber: {
            type: String,
            trim: true,
            maxlength: 50,
            default: null,
          },
          issueDate: {
            type: Date,
            default: null, // FIXED: Made optional
          },
          expiryDate: {
            type: Date,
            validate: {
              validator: function (value) {
                return !value || !this.issueDate || value > this.issueDate;
              },
              message: "Expiry date must be after issue date",
            },
            default: null,
          },
          documents: {
            type: [
              {
                fileName: { type: String, default: null },
                filePath: { type: String, default: null },
                fileType: { type: String, default: null },
                s3Key: { type: String, default: null },
                uploadedAt: { type: Date, default: Date.now },
              },
            ],
            default: [],
          },
          isVerified: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    isSupplier: { type: Boolean, default: false },

    // Status and Activity
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
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
    lastLogin: { type: Date, default: null },
    lastPasswordChange: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
AccountSchema.index({ accountCode: 1 });
AccountSchema.index({ customerName: 1 });
AccountSchema.index({ status: 1 });
AccountSchema.index({ isActive: 1 });
AccountSchema.index({ createdAt: -1 });
AccountSchema.index({ "employees.email": 1 });
AccountSchema.index({ "vatGstDetails.vatNumber": 1 });
AccountSchema.index({ "balances.totalOutstanding": 1 });
AccountSchema.index({ "balances.goldBalance.totalGrams": 1 });
AccountSchema.index({ "balances.cashBalance.amount": 1 });

// Pre-save middleware
AccountSchema.pre("save", function (next) {
  // Uppercase account code
  if (this.accountCode) {
    this.accountCode = this.accountCode.toUpperCase();
  }

  // Set default currency for cash balance
  if (this.acDefinition?.currencies?.length > 0) {
    const defaultCurrency = this.acDefinition.currencies.find(
      (c) => c.isDefault
    );
    if (defaultCurrency && !this.balances.cashBalance.currency) {
      this.balances.cashBalance.currency = defaultCurrency.currency;
    }
  }

  // Helper function to ensure single primary/default
  const ensureSingle = (items, field) => {
    if (!items?.length) return;
    const found = items.filter((item) => item[field]);
    if (found.length > 1) {
      items.forEach((item, index) => {
        if (index > 0) item[field] = false;
      });
    }
  };

  // Ensure single primary/default items (only if arrays exist and are not null)
  if (this.addresses) ensureSingle(this.addresses, "isPrimary");
  if (this.employees) ensureSingle(this.employees, "isPrimary");
  if (this.bankDetails) ensureSingle(this.bankDetails, "isPrimary");
  if (this.acDefinition?.currencies)
    ensureSingle(this.acDefinition.currencies, "isDefault");

  next();
});

// Static Methods
AccountSchema.statics.isAccountCodeExists = async function (
  accountCode,
  excludeId = null
) {
  const query = { accountCode: accountCode.toUpperCase() };
  if (excludeId) query._id = { $ne: excludeId };
  return !!(await this.findOne(query));
};

AccountSchema.statics.getActiveAccounts = function () {
  return this.find({ isActive: true, status: "active" });
};

// Instance Methods
AccountSchema.methods.getPrimaryContact = function () {
  return this.employees?.find((emp) => emp.isPrimary) || this.employees?.[0];
};

AccountSchema.methods.getPrimaryAddress = function () {
  return this.addresses?.find((addr) => addr.isPrimary) || this.addresses?.[0];
};

AccountSchema.methods.getPrimaryBank = function () {
  return (
    this.bankDetails?.find((bank) => bank.isPrimary) || this.bankDetails?.[0]
  );
};

AccountSchema.methods.getDefaultCurrency = function () {
  const defaultCurrency = this.acDefinition?.currencies?.find(
    (c) => c.isDefault
  );
  return defaultCurrency?.currency || null;
};

AccountSchema.methods.updateGoldBalance = function (grams, value) {
  Object.assign(this.balances.goldBalance, {
    totalGrams: grams,
    totalValue: value,
    lastUpdated: new Date(),
  });
  this.balances.lastBalanceUpdate = new Date();
  return this.save();
};

AccountSchema.methods.updateCashBalance = function (amount, currency = null) {
  const targetCurrency = currency || this.getDefaultCurrency();

  Object.assign(this.balances.cashBalance, {
    currency: targetCurrency,
    amount: amount,
    lastUpdated: new Date(),
  });
  this.balances.lastBalanceUpdate = new Date();
  return this.save();
};

AccountSchema.methods.getCashBalance = function () {
  return this.balances.cashBalance.amount || 0;
};

AccountSchema.methods.getCashBalanceCurrency = function () {
  return this.balances.cashBalance.currency;
};

AccountSchema.methods.calculateTotalOutstanding = function () {
  const cashAmount = this.balances.cashBalance.amount || 0;
  const goldValue = this.balances.goldBalance.totalValue || 0;
  this.balances.totalOutstanding = cashAmount + goldValue;
  return this.balances.totalOutstanding;
};

AccountSchema.methods.setDefaultCashCurrency = function (currencyId) {
  // Update cash balance currency
  Object.assign(this.balances.cashBalance, {
    currency: currencyId,
    lastUpdated: new Date(),
  });
  this.balances.lastBalanceUpdate = new Date();

  // Update A/C Definition
  if (this.acDefinition?.currencies) {
    // Reset all to non-default
    this.acDefinition.currencies.forEach((curr) => (curr.isDefault = false));

    // Set new default or add if doesn't exist
    const existingCurrency = this.acDefinition.currencies.find(
      (curr) => curr.currency?.toString() === currencyId.toString()
    );

    if (existingCurrency) {
      existingCurrency.isDefault = true;
    } else {
      this.acDefinition.currencies.push({
        currency: currencyId,
        isDefault: true,
      });
    }
  }

  return this.save();
};

const Account = mongoose.model("Account", AccountSchema);
export default Account;
