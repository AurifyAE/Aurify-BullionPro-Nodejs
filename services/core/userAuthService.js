import Account from "../../models/modules/AccountType.js";
import jwt from "jsonwebtoken";
import { createAppError } from "../../utils/errorHandler.js";
import {
  hashPassword,
  verifyPassword,
  encryptPassword,
} from "../../utils/passwordUtils.js";
import mongoose from "mongoose";
import MetalTransaction from "../../models/modules/MetalTransaction.js";

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "7d"; // Access token expiry
const JWT_REFRESH_EXPIRES_IN = "30d"; // Refresh token expiry
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

export const generateTokens = (payload) => {
  const accessToken = jwt.sign({ ...payload, type: "access" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "bullion-system",
    audience: "bullion-user",
  });

  const refreshToken = jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: "bullion-system",
    audience: "bullion-user",
  });

  return { accessToken, refreshToken };
};

export const verifyToken = (token) => {
  let type = "access";
  try {
    const decodedPayload = jwt.decode(token);
    if (decodedPayload && decodedPayload.type) {
      type = decodedPayload.type;
    }
    return jwt.verify(token, JWT_SECRET, {
      issuer: "bullion-system",
      audience: "bullion-user",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw createAppError(
        type === "refresh"
          ? "Refresh token has expired. Please log in again."
          : "Access token has expired",
        401,
        type === "refresh" ? "REFRESH_TOKEN_EXPIRED" : "ACCESS_TOKEN_EXPIRED"
      );
    }
    if (error.name === "JsonWebTokenError") {
      throw createAppError(
        type === "refresh" ? "Invalid refresh token" : "Invalid access token",
        401,
        type === "refresh" ? "INVALID_REFRESH_TOKEN" : "INVALID_ACCESS_TOKEN"
      );
    }
    throw createAppError("Token verification failed", 401, "TOKEN_ERROR");
  }
};

export const loginUser = async (accountCode, password, ipAddress = null) => {
  try {
    if (!accountCode || !password) {
      throw createAppError(
        "Account code and password are required",
        400,
        "MISSING_CREDENTIALS"
      );
    }

    const user = await Account.findOne({
      accountCode: accountCode.toUpperCase().trim(),
      isActive: true,
    }).select("+passwordHash +loginAttempts +lockUntil +lastLogin");

    if (!user) {
      throw createAppError(
        "Invalid account code or password",
        401,
        "INVALID_CREDENTIALS"
      );
    }

    // if (user.isLocked()) {
    //   const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
    //   throw createAppError(`Account is locked. Try again after ${lockTimeRemaining} minutes`, 423, "ACCOUNT_LOCKED");
    // }

    if (user.status !== "active") {
      throw createAppError("Account is not active", 403, "ACCOUNT_INACTIVE");
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      throw createAppError(
        "Invalid account code or password",
        401,
        "INVALID_CREDENTIALS"
      );
    }

    // await user.resetLoginAttempts();

    user.lastLogin = new Date();
    await user.save();

    const tokenPayload = {
      id: user._id,
      accountCode: user.accountCode,
      type: "user",
      name: user.customerName,
      permissions: [],
    };

    const { accessToken, refreshToken } = generateTokens(tokenPayload);

    const userData = {
      id: user._id,
      accountCode: user.accountCode,
      customerName: user.customerName,
      accountType: user.accountType,
      lastLogin: user.lastLogin,
    };

    return {
      success: true,
      message: "Login successful",
      data: {
        user: userData,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: JWT_EXPIRES_IN,
        },
        loginInfo: {
          lastLogin: user.lastLogin,
          ipAddress,
        },
      },
    };
  } catch (error) {
    if (error.isOperational) throw error;
    console.error("User login service error:", error);
    throw createAppError("Login failed", 500, "LOGIN_ERROR");
  }
};

export const refreshUserAccessToken = async (refreshToken) => {
  try {
    if (!refreshToken) {
      throw createAppError(
        "Refresh token is required",
        400,
        "MISSING_REFRESH_TOKEN"
      );
    }

    const decoded = verifyToken(refreshToken);

    if (decoded.type !== "refresh") {
      throw createAppError("Invalid token type", 401, "INVALID_TOKEN_TYPE");
    }

    const user = await Account.findById(decoded.id);
    if (!user || !user.isActive || user.status !== "active") {
      throw createAppError("User not found or inactive", 401, "USER_INACTIVE");
    }

    const tokenPayload = {
      id: user._id,
      accountCode: user.accountCode,
      type: "user",
      name: user.customerName,
      permissions: [],
    };

    const { accessToken } = generateTokens(tokenPayload);

    return {
      success: true,
      message: "Token refreshed successfully",
      data: {
        accessToken,
        expiresIn: JWT_EXPIRES_IN,
      },
    };
  } catch (error) {
    if (error.isOperational) throw error;
    console.error("User token refresh error:", error);
    throw createAppError("Token refresh failed", 500, "TOKEN_REFRESH_ERROR");
  }
};

export const logoutUser = async (userId) => {
  try {
    // For stateless JWT, logout can just be client-side token removal.
    // If implementing token blacklisting, add logic here (e.g., add refresh token to blacklist).

    return {
      success: true,
      message: "Logged out successfully",
    };
  } catch (error) {
    console.error("User logout service error:", error);
    throw createAppError("Logout failed", 500, "LOGOUT_ERROR");
  }
};

export const getUserProfile = async (userId) => {
  try {
    const user = await Account.findById(userId).select(
      "-passwordHash -passwordEncrypted -passwordIV -password"
    );

    if (!user || !user.isActive) {
      throw createAppError("User not found", 404, "USER_NOT_FOUND");
    }

    return {
      success: true,
      data: user.toJSON(),
    };
  } catch (error) {
    if (error.isOperational) throw error;
    console.error("Get user profile error:", error);
    throw createAppError("Failed to get profile", 500, "PROFILE_ERROR");
  }
};

export const changeUserPassword = async (userId, oldPassword, newPassword) => {
  try {
    if (!oldPassword || !newPassword) {
      throw createAppError(
        "Old and new passwords are required",
        400,
        "MISSING_PASSWORDS"
      );
    }

    const user = await Account.findById(userId).select("+passwordHash");

    if (!user) {
      throw createAppError("User not found", 404, "USER_NOT_FOUND");
    }

    const isValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) {
      throw createAppError(
        "Incorrect old password",
        401,
        "INVALID_OLD_PASSWORD"
      );
    }

    const newHash = await hashPassword(newPassword);
    const { encrypted, iv } = encryptPassword(newPassword); // If encryption is still needed

    user.passwordHash = newHash;
    user.passwordEncrypted = encrypted;
    user.passwordIV = iv;
    user.password = null;
    user.lastPasswordChange = new Date();

    await user.save();

    return {
      success: true,
      message: "Password changed successfully",
    };
  } catch (error) {
    if (error.isOperational) throw error;
    console.error("User password change error:", error);
    throw createAppError(
      "Password change failed",
      500,
      "PASSWORD_CHANGE_ERROR"
    );
  }
};

export const getUnfixedTransactionsWithAccount = async (
  page = 1,
  limit = 50,
  filters = {}
) => {
  try {
    // Ensure partyCode is provided
    if (!filters.partyCode) {
      throw createAppError("Party code is required", 400, "MISSING_PARTY_CODE");
    }

    const skip = (page - 1) * limit;
    const matchStage = {
      isActive: true,
      isFixed: false, // Only unfixed transactions
      partyCode: new mongoose.Types.ObjectId(filters.partyCode), // Match provided partyCode
    };

    // Fetch party account details
    const account = await Account.findById(filters.partyCode)
      .select(
        "accountCode customerName balances.goldBalance balances.cashBalance addresses"
      )
      .populate({
        path: "balances.cashBalance.currency",
        select: "code symbol",
        options: { strictPopulate: false }, // Allow population of nested field
      })
      .populate({
        path: "balances.goldBalance.currency",
        select: "code symbol",
        options: { strictPopulate: false }, // Allow population of nested field
      })
      .lean();

    if (!account) {
      throw createAppError("Party account not found", 404, "ACCOUNT_NOT_FOUND");
    }

    // Prepare account response with only requested fields
    const accountResponse = {
      accountCode: account.accountCode,
      customerName: account.customerName,
      goldBalance: {
        totalGrams: account.balances?.goldBalance?.totalGrams || 0,
        totalValue: account.balances?.goldBalance?.totalValue || 0,
        currency: account.balances?.goldBalance?.currency || null,
        lastUpdated: account.balances?.goldBalance?.lastUpdated || null,
      },
      cashBalance: {
        amount: account.balances?.cashBalance?.amount || 0,
        currency: account.balances?.cashBalance?.currency || null,
        lastUpdated: account.balances?.cashBalance?.lastUpdated || null,
      },
      email: account.addresses?.[0]?.email || null,
      phone: account.addresses?.[0]?.phoneNumber1 || null,
    };

    // Aggregation pipeline for transactions
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "currencymasters",
          localField: "partyCurrency",
          foreignField: "_id",
          as: "partyCurrencyDetails",
        },
      },
      {
        $unwind: {
          path: "$partyCurrencyDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "itemCurrency",
          foreignField: "_id",
          as: "itemCurrencyDetails",
        },
      },
      {
        $unwind: {
          path: "$itemCurrencyDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "currencymasters",
          localField: "baseCurrency",
          foreignField: "_id",
          as: "baseCurrencyDetails",
        },
      },
      {
        $unwind: {
          path: "$baseCurrencyDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          transactionType: 1,
          voucherDate: 1,
          voucherNumber: 1,
          status: 1,
          isFixed: 1,
          stockItems: 1,
          totalAmountSession: 1,
          createdAt: 1,
          updatedAt: 1,
          currencies: {
            party: {
              code: "$partyCurrencyDetails.code",
              symbol: "$partyCurrencyDetails.symbol",
            },
            item: {
              code: "$itemCurrencyDetails.code",
              symbol: "$itemCurrencyDetails.symbol",
            },
            base: {
              code: "$baseCurrencyDetails.code",
              symbol: "$baseCurrencyDetails.symbol",
            },
          },
        },
      },
      {
        $sort: { voucherDate: -1, createdAt: -1 },
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
          totals: [
            {
              $group: {
                _id: null,
                totalGoldGrams: {
                  $sum: {
                    $sum: "$stockItems.goldDebit",
                  },
                },
                totalGoldValue: {
                  $sum: {
                    $sum: "$stockItems.itemTotal.itemTotalAmount",
                  },
                },
                totalCashDebit: {
                  $sum: {
                    $sum: "$stockItems.cashDebit",
                  },
                },
                totalCashCredit: {
                  $sum: {
                    $sum: "$stockItems.cashCredit",
                  },
                },
                totalSessionAmount: {
                  $sum: "$totalAmountSession.totalAmountAED",
                },
              },
            },
          ],
        },
      },
    ];

    // Execute aggregation with lean option for performance
    const result = await MetalTransaction.aggregate(pipeline).option({
      lean: true,
    });

    const transactions = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;
    const totals = result[0].totals[0] || {
      totalGoldGrams: 0,
      totalGoldValue: 0,
      totalCashDebit: 0,
      totalCashCredit: 0,
      totalSessionAmount: 0,
    };

    return {
      account: accountResponse,
      transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
      },
      totals,
    };
  } catch (error) {
    console.error("Error in getUnfixedTransactionsWithAccounts:", error);
    throw createAppError(
      error.message || "Failed to retrieve unfixed transactions",
      error.statusCode || 500,
      error.errorCode || "TRANSACTION_RETRIEVAL_ERROR"
    );
  }
};
