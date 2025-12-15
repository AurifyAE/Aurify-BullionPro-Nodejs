import mongoose from "mongoose";

const CommoditySchema = new mongoose.Schema(
  {
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DivisionMaster",
      required: [true, "Division is required"],
    },
    code: {
      type: String,
      required: [true, "Commodity code is required"],
      trim: true,
      uppercase: true,
      maxlength: [20, "Code cannot exceed 20 characters"],
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
      default: null,
    },
    karatSelect: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KaratMaster",
      required: [true, "Karat is required"],
    },
    standardPurity: {
      type: String,
      
      required: [true, "Standard purity is required"],
    },
    metalDecimal: {
      type: Number,
      required: [true, "Metal decimal is required"],
      min: [0, "Metal decimal must be >= 0"],
    },
    lotEnabled: {
      type: Boolean,
      default: false,
    },
    lotValue: {
      type: Number,
      default: null,
    },
    lotPiece: {
      type: Number,
      default: null,
    },
    rateType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      default: null,
    },
    defaultRateType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MetalRateMaster",
      required: [true, "Default rate type is required"],
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
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


// Static: Check if code exists
CommoditySchema.statics.isCodeExists = async function (code, excludeId) {
  const query = { code: (code || "").toUpperCase().trim() };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await this.findOne(query);
  return !!existing;
};

const Commodity = mongoose.model("Commodity", CommoditySchema);
export default Commodity;


