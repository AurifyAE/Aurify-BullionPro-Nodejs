import Admin from "../../models/core/adminModel.js";
import Account from "../../models/modules/AccountType.js";
import Designation from "../../models/modules/Designation.js";
import {
  loginAdmin,
  refreshAccessToken,
  logoutAdmin,
  getAdminProfile,
} from "../../services/core/authService.js";
import { createAppError } from "../../utils/errorHandler.js";
import { decryptPassword, verifyPassword } from "../../utils/passwordUtils.js";

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await loginAdmin(email, password, ipAddress);
    console.log(result)
    // for login
    // const isValid = await verifyPassword(password, account.passwordHash);

    res.cookie("refreshToken", result.data.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        admin: result.data.admin,
        Adminname: result.data.admin.name,
        accessToken: result.data.tokens.accessToken,
        refreshToken: result.data.tokens.refreshToken,
        expiresIn: result.data.tokens.expiresIn,
        loginInfo: result.data.loginInfo,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {

    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) {
      throw createAppError(
        "Refresh token not provided",
        400,
        "MISSING_REFRESH_TOKEN"
      );
    }
    const result = await refreshAccessToken(refreshToken);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const adminId = req.admin?.id;

    const result = await logoutAdmin(adminId);

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const viewPassword = async (req, res) => {
  try {
    const { accountId } = req.query;
    // // Normally: check if req.user.role === "ADMIN" before proceeding
    const account = await Account.findById(accountId);

    if (!account) return res.status(404).json({ error: "Account not found" });

    const plainPassword = decryptPassword(account.passwordEncrypted, account.passwordIV);
    res.status(200).json({ password: plainPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const verifyToken = async (req, res, next) => {
  try {
    const adminId = req.admin?.id;
    if (!req.admin) {
      throw createAppError("Not an admin user", 403, "FORBIDDEN");
    }
    res.status(200).json({
      success: true,
      message: "Token verified successfully",
      data: req.admin,
    });
  } catch (error) {
    console.log(error)
    next(error);
  }
};


export const createAdmin = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      designationId,
      type,
      status,
      permissions,
    } = req.body;

    if (!name || !email || !password || !designationId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const designation = await Designation.findById(designationId);
    if (!designation) {
      return res.status(400).json({ message: "Invalid designation" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Admin already exists" });
    }

    const admin = await Admin.create({
      name,
      email,
      password,
      designationId,
      type,
      status,
      permissions: permissions || designation.permissions,
    });

    res.status(201).json({
      success: true,
      data: admin,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdmins = async (req, res, next) => {
  try {
    const admins = await Admin.find().select('-passwordHash');
    res.status(200).json({
      success: true,
      data: admins,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await Admin.findById(id).select('-passwordHash');
    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (err) {
    next(err);
  }
};
