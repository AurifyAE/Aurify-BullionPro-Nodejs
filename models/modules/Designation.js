import mongoose from "mongoose";

const designationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    permissions: {
      type: Map,
      of: [String], // ["view", "create", "edit"]
      required: true,
    },

    isSystem: {
      type: Boolean,
      default: false, // for future system roles
    },
  },
  { timestamps: true }
);

export default mongoose.model("Designation", designationSchema);
