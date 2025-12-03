import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema(
    {
        metal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MetalStock",
            required: [true, "Metal reference is required"],
        },
        pcs: {
            type: Boolean,
            default: false,
        },
        pcsCount: {
            type: Number,
            default: 0,
        },
         pcsValue: {
            type: Number,
            default: 0,
        },
        grossWeight: {
            type: Number,
            default: 0,
        },
        pureWeight: {
            type: Number,
            default: 0, 
        },
        purity: {
            type: Number,
        },
        status: {
            type: String,
            enum: ["active", "sold", "reserved", "damaged"],
            default: "active",
        },
        isDraft: {
            type: Boolean,
            default: false,
            index: true,
        },
        draftId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Drafting",
            default: null,
        },
        remarks: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
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

// === Indexes for fast search ===
InventorySchema.index({ metal: 1 });
InventorySchema.index({ status: 1 });
InventorySchema.index({ pcs: 1 });
InventorySchema.index({ createdAt: -1 });

const Inventory = mongoose.model("Inventory", InventorySchema);

export default Inventory;
