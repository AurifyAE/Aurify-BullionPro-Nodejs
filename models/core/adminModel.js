import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minLength: [2, "Name must be at least 2 characters"],
      maxLength: [50, "Name cannot exceed 50 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minLength: [6, "Password must be at least 6 characters"],
      select: false,
    },

    // 🔑 RBAC Anchor
    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Designation",
      // required: true,
    },

    permissions: {
      type: Object,
      default: {},
    },


    type: {
      type: String,
      enum: ["super_admin", "admin", "manager", "operator", "viewer"],
      default: "viewer",
    },

    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

//
// ───────────────────────────────────────────
// Virtuals
// ───────────────────────────────────────────
//
adminSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

//
// ───────────────────────────────────────────
// Indexes
// ───────────────────────────────────────────
//
adminSchema.index({ email: 1 }, { unique: true });
adminSchema.index({ type: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ createdAt: -1 });

//
// ───────────────────────────────────────────
// Password Hashing
// ───────────────────────────────────────────
//
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

//
// ───────────────────────────────────────────
// Instance Methods
// ───────────────────────────────────────────
//
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

adminSchema.methods.incLoginAttempts = function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000,
    };
  }

  return this.updateOne(updates);
};

adminSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

//
// ───────────────────────────────────────────
// Static Methods
// ───────────────────────────────────────────
//
adminSchema.statics.findActive = function () {
  return this.find({ status: "active", isActive: true });
};

adminSchema.statics.findByType = function (type) {
  return this.find({ type, status: "active", isActive: true });
};

//
// ───────────────────────────────────────────
// Hide sensitive fields
// ───────────────────────────────────────────
//
adminSchema.methods.toJSON = function () {
  const admin = this.toObject();
  delete admin.password;
  delete admin.loginAttempts;
  delete admin.lockUntil;
  return admin;
};

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
