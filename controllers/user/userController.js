
import {
  loginUser,
  refreshUserAccessToken,
  logoutUser,
  getUserProfile,
  changeUserPassword,
  getUnfixedTransactionsWithAccount
} from '../../services/core/userAuthService.js';

export const login = async (req, res, next) => {
  try {
    const { accountCode, password } = req.body;
    const ipAddress = req.ip;
    const result = await loginUser(accountCode, password, ipAddress);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await refreshUserAccessToken(refreshToken);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const result = await logoutUser(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const result = await getUserProfile(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const result = await changeUserPassword(req.user.id, oldPassword, newPassword);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getUnfixedTransactionsWithAccounts = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, partyCode } = req.query;

    // Ensure user is authenticated or partyCode is provided
    if (!req.user?.id && !partyCode) {
      throw createAppError(
        "User authentication or party code required",
        401,
        "UNAUTHENTICATED_OR_MISSING_PARTY_CODE"
      );
    }

    const filters = {
      partyCode: partyCode || req.user.id, // Use query partyCode or fall back to req.user.id
    };

    const result = await getUnfixedTransactionsWithAccount(
      parseInt(page),
      parseInt(limit),
      filters
    );

    res.status(200).json({
      success: true,
      message: "Unfixed transactions with account details retrieved successfully",
      data: {
        account: result.account,
        transactions: result.transactions,
      },
      pagination: result.pagination,
      totals: result.totals,
    });
  } catch (error) {
    console.error("Error in getUnfixedTransactionsWithAccounts:", error);
    next(error);
  }
};