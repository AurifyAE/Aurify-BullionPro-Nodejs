import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  fileName: { type: String, default: null },
  filePath: { type: String, default: null },
  fileType: { type: String, enum: ['image', 'pdf'], default: null },
  s3Key: { type: String, default: null },
  uploadedAt: { type: Date, default: Date.now },
});

const vatGstDetailsSchema = new mongoose.Schema({
  vatStatus: {
    type: String,
    enum: ['REGISTERED', 'UNREGISTERED', 'EXEMPTED'],
    default: 'UNREGISTERED',
    required: [true, 'VAT status is required'],
  },
  vatNumber: { type: String, trim: true, maxlength: 50, default: '' },
  documents: {
    type: [documentSchema],
    default: [],
  },
});

const AccountSchema = new mongoose.Schema(
  {
    // Basic Account Information
    accountType: {
      type: String,
      default: 'DEBTOR',
      required: [true, 'Account type is required'],
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [10, 'Title cannot exceed 10 characters'],
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    accountCode: {
      type: String,
      required: [true, 'Account code is required'],
      trim: true,
      uppercase: true,
      maxlength: [20, 'Account code cannot exceed 20 characters'],
      match: [/^[A-Z0-9]+$/, 'Account code should contain only uppercase letters and numbers'],
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
    },
    classification: {
      type: String,
      trim: true,
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, 'Remarks cannot exceed 500 characters'],
      default: null,
    },

    // Balance Information
    balances: {
      goldBalance: {
        totalGrams: { type: Number, default: 0 },
        totalValue: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now },
      },
      cashBalance: {
        type: [
          {
            currency: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'CurrencyMaster',
              required: true,
            },
            amount: { type: Number, default: 0 },
            isDefault: { type: Boolean, default: false },
            lastUpdated: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
      totalOutstanding: { type: Number, default: 0 },
      lastBalanceUpdate: { type: Date, default: Date.now },
    },

    // A/C Definition
    acDefinition: {
      currencies: {
        type: [
          {
            currency: { type: mongoose.Schema.Types.ObjectId, ref: 'CurrencyMaster' },
            isDefault: { type: Boolean, default: false },
            minRate: { type: Number, default: 1.0 },
            maxRate: { type: Number, default: 1.0 },
          },
        ],
        required: [true, 'At least one currency is required'],
        validate: {
          validator: function (currencies) {
            return currencies && currencies.length > 0;
          },
          message: 'At least one currency must be specified',
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
          Margin: {
            type: Number,
            min: 0,
            max: 100,
            required: [true, 'Margin is required'],
          },
        },
      ],
      default: [],
    },

    // Address Details
    addresses: {
      type: [
        {
          streetAddress: { type: String, trim: true, maxlength: 200, default: null },
          city: { type: String, trim: true, maxlength: 50, default: null },
          country: { type: String, trim: true, maxlength: 50, default: null },
          zipCode: { type: String, trim: true, maxlength: 20, default: null },
          phoneNumber1: { type: String, trim: true, match: /^[0-9]{10,15}$/, default: null },
          phoneNumber2: { type: String, trim: true, match: /^[0-9]{10,15}$/, default: null },
          phoneNumber3: { type: String, trim: true, match: /^[0-9]{10,15}$/, default: null },
          email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
            default: null,
          },
          telephone: { type: String, trim: true, match: /^[0-9]{10,15}$/, default: null },
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
          name: { type: String, trim: true, maxlength: 100, required: true },
          designation: { type: String, trim: true, maxlength: 50, default: null },
          email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
            required: true,
          },
          mobile: { type: String, trim: true, match: /^[0-9]{10,15}$/, default: null },
          document: {
            fileName: { type: String, default: null },
            filePath: { type: String, default: null },
            fileType: { type: String, enum: ['image', 'pdf'], default: null },
            s3Key: { type: String, default: null },
            uploadedAt: { type: Date, default: Date.now },
          },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    // VAT/GST Details
    vatGstDetails: vatGstDetailsSchema, // Changed to single embedded document

    // Bank Details
    bankDetails: {
      type: [
        {
          bankName: { type: String, trim: true, maxlength: 100, default: null },
          swiftId: { type: String, trim: true, uppercase: true, maxlength: 20, default: null },
          iban: { type: String, trim: true, uppercase: true, maxlength: 50, default: null },
          accountNumber: { type: String, trim: true, maxlength: 30, default: null },
          branchCode: { type: String, trim: true, maxlength: 20, default: null },
          purpose: { type: String, default: null },
          country: { type: String, trim: true, maxlength: 50, default: null },
          city: { type: String, trim: true, maxlength: 50, default: null },
          routingCode: { type: String, trim: true, maxlength: 20, default: null },
          address: { type: String, trim: true, maxlength: 200, default: null },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    // KYC Details
    kycDetails: {
      type: [
        {
          documentType: { type: String, trim: true, default: null },
          documentNumber: { type: String, trim: true, maxlength: 50, default: null },
          issueDate: {
            type: Date,
            default: null,
          },
          expiryDate: {
            type: Date,
            validate: {
              validator: function (value) {
                return !value || !this.issueDate || value > this.issueDate;
              },
              message: 'Expiry date must be after issue date',
            },
            default: null,
          },
          documents: {
            type: [documentSchema],
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
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance (unchanged)
AccountSchema.index({ accountCode: 1 });
AccountSchema.index({ customerName: 1 });
AccountSchema.index({ status: 1 });
AccountSchema.index({ isActive: 1 });
AccountSchema.index({ createdAt: -1 });
AccountSchema.index({ 'employees.email': 1 });
AccountSchema.index({ 'vatGstDetails.vatNumber': 1 });
AccountSchema.index({ 'balances.totalOutstanding': 1 });
AccountSchema.index({ 'balances.goldBalance.totalGrams': 1 });
AccountSchema.index({ 'balances.cashBalance.currency': 1 });
AccountSchema.index({ 'balances.cashBalance.amount': 1 });

// Pre-save middleware (unchanged)
AccountSchema.pre('save', function (next) {
  if (this.accountCode) {
    this.accountCode = this.accountCode.toUpperCase();
  }

  if (this.acDefinition?.currencies?.length > 0 && this.isNew) {
    const existingCurrencies = this.balances.cashBalance.map(
      (cb) => cb.currency?.toString()
    );

    this.acDefinition.currencies.forEach((currencyDef) => {
      const currencyId = currencyDef.currency?.toString();
      if (currencyId && !existingCurrencies.includes(currencyId)) {
        this.balances.cashBalance.push({
          currency: currencyDef.currency,
          amount: 0,
          isDefault: currencyDef.isDefault || false,
          lastUpdated: new Date(),
        });
      }
    });
  }

  const ensureSingle = (items, field) => {
    if (!items?.length) return;
    const found = items.filter((item) => item[field]);
    if (found.length > 1) {
      items.forEach((item, index) => {
        if (index > 0) item[field] = false;
      });
    }
  };

  if (this.addresses) ensureSingle(this.addresses, 'isPrimary');
  if (this.employees) ensureSingle(this.employees, 'isPrimary');
  if (this.bankDetails) ensureSingle(this.bankDetails, 'isPrimary');
  if (this.acDefinition?.branches) ensureSingle(this.acDefinition.branches, 'isDefault');

  next();
});

// Static and Instance Methods (unchanged, included for completeness)
AccountSchema.statics.isAccountCodeExists = async function (accountCode, excludeId = null) {
  const query = { accountCode: accountCode.toUpperCase() };
  if (excludeId) query._id = { $ne: excludeId };
  return !!(await this.findOne(query));
};

AccountSchema.statics.getActiveAccounts = function () {
  return this.find({ isActive: true, status: 'active' });
};

AccountSchema.methods.getPrimaryContact = function () {
  return this.employees?.find((emp) => emp.isPrimary) || this.employees?.[0];
};

AccountSchema.methods.getPrimaryAddress = function () {
  return this.addresses?.find((addr) => addr.isPrimary) || this.addresses?.[0];
};

AccountSchema.methods.getPrimaryBank = function () {
  return this.bankDetails?.find((bank) => bank.isPrimary) || this.bankDetails?.[0];
};

AccountSchema.methods.getDefaultCurrencies = function () {
  return this.acDefinition?.currencies?.filter((c) => c.isDefault) || [];
};

AccountSchema.methods.getDefaultCashBalances = function () {
  return this.balances.cashBalance?.filter((cb) => cb.isDefault) || [];
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

AccountSchema.methods.updateCashBalance = function (amount, currencyId) {
  if (!currencyId) {
    throw new Error('Currency ID is required to update cash balance');
  }

  const currencyIdStr = currencyId.toString();
  const existingBalance = this.balances.cashBalance.find(
    (cb) => cb.currency?.toString() === currencyIdStr
  );

  if (existingBalance) {
    existingBalance.amount = amount;
    existingBalance.lastUpdated = new Date();
  } else {
    this.balances.cashBalance.push({
      currency: currencyId,
      amount: amount,
      isDefault: false,
      lastUpdated: new Date(),
    });
  }

  this.balances.lastBalanceUpdate = new Date();
  return this.save();
};

AccountSchema.methods.getCashBalance = function (currencyId = null) {
  if (currencyId) {
    const balance = this.balances.cashBalance.find(
      (cb) => cb.currency?.toString() === currencyId.toString()
    );
    return balance?.amount || 0;
  }

  const defaultBalances = this.getDefaultCashBalances();
  return defaultBalances.reduce((sum, cb) => sum + (cb.amount || 0), 0);
};

AccountSchema.methods.getCashBalanceByCurrency = function (currencyId) {
  const balance = this.balances.cashBalance.find(
    (cb) => cb.currency?.toString() === currencyId.toString()
  );
  return balance || null;
};

AccountSchema.methods.getAllCashBalances = function () {
  return this.balances.cashBalance || [];
};

AccountSchema.methods.calculateTotalOutstanding = function () {
  const totalCashAmount = this.balances.cashBalance.reduce(
    (sum, cb) => sum + (cb.amount || 0),
    0
  );
  const goldValue = this.balances.goldBalance.totalValue || 0;
  this.balances.totalOutstanding = totalCashAmount + goldValue;
  return this.balances.totalOutstanding;
};

AccountSchema.methods.setDefaultCurrencies = function (currencyIds) {
  const currencyIdStrs = currencyIds.map((id) => id.toString());

  if (this.acDefinition?.currencies) {
    this.acDefinition.currencies.forEach((curr) => {
      curr.isDefault = currencyIdStrs.includes(curr.currency?.toString());
    });

    currencyIdStrs.forEach((currencyId) => {
      if (
        !this.acDefinition.currencies.some(
          (curr) => curr.currency?.toString() === currencyId
        )
      ) {
        this.acDefinition.currencies.push({
          currency: currencyId,
          isDefault: true,
          minRate: 1.0,
          maxRate: 1.0,
        });
      }
    });
  }

  this.balances.cashBalance.forEach((cb) => {
    cb.isDefault = currencyIdStrs.includes(cb.currency?.toString());
  });

  currencyIdStrs.forEach((currencyId) => {
    if (
      !this.balances.cashBalance.some(
        (cb) => cb.currency?.toString() === currencyId
      )
    ) {
      this.balances.cashBalance.push({
        currency: currencyId,
        amount: 0,
        isDefault: true,
        lastUpdated: new Date(),
      });
    }
  });

  this.balances.lastBalanceUpdate = new Date();
  return this.save();
};

AccountSchema.methods.addOrUpdateCurrencyBalance = function (
  currencyId,
  amount,
  isDefault = false
) {
  const currencyIdStr = currencyId.toString();
  const existingBalance = this.balances.cashBalance.find(
    (cb) => cb.currency?.toString() === currencyIdStr
  );

  if (existingBalance) {
    existingBalance.amount = amount;
    existingBalance.isDefault = isDefault;
    existingBalance.lastUpdated = new Date();
  } else {
    this.balances.cashBalance.push({
      currency: currencyId,
      amount: amount,
      isDefault: isDefault,
      lastUpdated: new Date(),
    });
  }

  this.balances.lastBalanceUpdate = new Date();
  return this.save();
};

AccountSchema.methods.removeCurrencyBalance = function (currencyId) {
  const currencyIdStr = currencyId.toString();
  const index = this.balances.cashBalance.findIndex(
    (cb) => cb.currency?.toString() === currencyIdStr
  );

  if (index > -1) {
    this.balances.cashBalance.splice(index, 1);
    this.balances.lastBalanceUpdate = new Date();
  }

  return this.save();
};

const Account = mongoose.model('Account', AccountSchema);
export default Account;