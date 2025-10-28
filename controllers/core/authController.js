import Account from "../../models/modules/AccountType.js";
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
    console.log("Refresh Token:", refreshToken);
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
    if(!req.admin){
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
