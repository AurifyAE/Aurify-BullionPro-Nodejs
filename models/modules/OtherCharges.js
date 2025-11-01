import mongoose from "mongoose";

const OtherChargesSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [6, "Code cannot exceed 6 characters"],
      match: [/^[A-Z]{3}\d{3}$/, "Code must be 3 letters + 3 digits (e.g., MAK001)"],
      unique: true, // Ensure no duplicate codes
    },
    description: {
      type: String,
      required: [true, "Charge description is required"],
      trim: true,
      unique: true,
      maxlength: [100, "Description cannot exceed 100 characters"],
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

// === AUTO-GENERATE CODE: First 3 letters + 3-digit auto-increment ===
OtherChargesSchema.pre("save", async function (next) {
  if (this.isNew && this.description && !this.code) {
    const prefix = this.description.trim().slice(0, 3).toUpperCase();
    
    // Find all codes with the same prefix
    const existingCodes = await this.constructor.find({
      code: new RegExp(`^${prefix}\\d{3}$`)
    }).select('code');

    // Extract numbers and find the max
    let maxNumber = 0;
    existingCodes.forEach(doc => {
      const numPart = doc.code.substring(3);
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    });

    // Increment and format with leading zeros
    const nextNumber = maxNumber + 1;
    const formattedNumber = nextNumber.toString().padStart(3, '0');
    this.code = `${prefix}${formattedNumber}`;
  }
  next();
});

// Static: Check if description exists
OtherChargesSchema.statics.isDescriptionExists = async function (description, excludeId = null) {
  const query = { description: new RegExp(`^${description.trim()}$`, "i") };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

const OtherCharges = mongoose.model("OtherCharges", OtherChargesSchema);
export default OtherCharges;