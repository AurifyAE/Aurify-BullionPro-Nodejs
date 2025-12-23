import DealStrategyService from "../../services/modules/DealStrategyService.js";
import { createAppError } from "../../utils/errorHandler.js";

// Create or update deal strategy
export const createOrUpdateDealStrategy = async (req, res, next) => {
  try {
    const { date, lbma, uaegd, local } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      throw createAppError("Admin ID is required", 401, "UNAUTHORIZED");
    }

    // Validation
    if (!date) {
      throw createAppError("Date is required", 400, "MISSING_DATE");
    }

    if (!lbma || lbma.value === undefined || lbma.value === null) {
      throw createAppError("LBMA value is required", 400, "MISSING_LBMA");
    }

    if (!uaegd || uaegd.value === undefined || uaegd.value === null) {
      throw createAppError("UAE GD value is required", 400, "MISSING_UAEGD");
    }

    if (!local || local.value === undefined || local.value === null) {
      throw createAppError("Local value is required", 400, "MISSING_LOCAL");
    }

    // Validate types
    const validTypes = ["premium", "discount"];
    if (lbma.type && !validTypes.includes(lbma.type)) {
      throw createAppError(
        "LBMA type must be 'premium' or 'discount'",
        400,
        "INVALID_LBMA_TYPE"
      );
    }
    if (uaegd.type && !validTypes.includes(uaegd.type)) {
      throw createAppError(
        "UAE GD type must be 'premium' or 'discount'",
        400,
        "INVALID_UAEGD_TYPE"
      );
    }
    if (local.type && !validTypes.includes(local.type)) {
      throw createAppError(
        "Local type must be 'premium' or 'discount'",
        400,
        "INVALID_LOCAL_TYPE"
      );
    }

    const strategy = await DealStrategyService.createOrUpdateDealStrategy(
      {
        date,
        lbma: {
          value: parseFloat(lbma.value),
          type: lbma.type || "premium",
        },
        uaegd: {
          value: parseFloat(uaegd.value),
          type: uaegd.type || "premium",
        },
        local: {
          value: parseFloat(local.value),
          type: local.type || "premium",
        },
      },
      adminId
    );

    res.status(200).json({
      success: true,
      message: "Deal strategy saved successfully",
      data: strategy,
    });
  } catch (error) {
    next(error);
  }
};

// Get deal strategy by date
export const getDealStrategyByDate = async (req, res, next) => {
  try {
    const { date } = req.params;

    if (!date) {
      throw createAppError("Date is required", 400, "MISSING_DATE");
    }

    const strategy = await DealStrategyService.getDealStrategyByDate(date);

    if (!strategy) {
      return res.status(200).json({
        success: true,
        message: "No deal strategy found for this date",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Deal strategy fetched successfully",
      data: strategy,
    });
  } catch (error) {
    next(error);
  }
};

// Get all deal strategies
export const getAllDealStrategies = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      fromDate,
      toDate,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const result = await DealStrategyService.getAllDealStrategies({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    });

    res.status(200).json({
      success: true,
      message: "Deal strategies fetched successfully",
      data: result.strategies,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get latest deal strategy
export const getLatestDealStrategy = async (req, res, next) => {
  try {
    const strategy = await DealStrategyService.getLatestDealStrategy();

    if (!strategy) {
      return res.status(200).json({
        success: true,
        message: "No deal strategy found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Latest deal strategy fetched successfully",
      data: strategy,
    });
  } catch (error) {
    next(error);
  }
};

