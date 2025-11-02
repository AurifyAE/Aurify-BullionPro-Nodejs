import mongoose from "mongoose";

const AccountModeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Account mode name is required"],
      trim: true,
      unique: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    prefix: {
      type: String,
      required: [true, "Prefix is required"],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: [5, "Prefix cannot exceed 5 characters"],
      match: [/^[A-Z0-9]{1,5}$/, "Prefix must contain only uppercase letters and numbers (max 5 characters)"],
    },
    status: {
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
  }
);

// Ensure prefix is always uppercase before saving
AccountModeSchema.pre("save", function (next) {
  if (this.prefix) {
    this.prefix = this.prefix.trim().toUpperCase();
  }
  next();
});

// Static: Check if name exists
AccountModeSchema.statics.isNameExists = async function (name, excludeId = null) {
  const query = { name: new RegExp(`^${name.trim()}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

// Static: Check if prefix exists
AccountModeSchema.statics.isPrefixExists = async function (prefix, excludeId = null) {
  const query = { prefix: prefix.trim().toUpperCase() };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

// Static: Generate next account code for this mode
AccountModeSchema.statics.generateNextAccountCode = async function (accountModeId, AccountModel) {
  const accountMode = await this.findById(accountModeId);
  
  if (!accountMode) {
    throw new Error('Account mode not found');
  }

  const prefix = accountMode.prefix;
  
  // Find the highest existing account code with this prefix
  const lastAccount = await AccountModel.findOne({
    accountCode: new RegExp(`^${prefix}\\d+$`)
  })
  .sort({ accountCode: -1 })
  .lean();

  let nextNumber = 1;
  
  if (lastAccount && lastAccount.accountCode) {
    // Extract the numeric part from the last account code
    const numberPart = lastAccount.accountCode.replace(prefix, '');
    const currentNumber = parseInt(numberPart, 10);
    
    if (!isNaN(currentNumber)) {
      nextNumber = currentNumber + 1;
    }
  }

  // Format with leading zeros (e.g., 0001, 0002, etc.)
  const paddedNumber = String(nextNumber).padStart(4, '0');
  const newAccountCode = `${prefix}${paddedNumber}`;

  return newAccountCode;
};

const AccountMode = mongoose.model("AccountMode", AccountModeSchema);
export default AccountMode;