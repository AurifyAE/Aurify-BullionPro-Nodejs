import DealOrderService from "../../services/modules/dealOrderService.js";
import { createAppError } from "../../utils/errorHandler.js";

const ensureArrayWithData = (value) =>
  Array.isArray(value) && value.length > 0;

export const createDealOrder = async (req, res, next) => {
  try {
    const payload = req.body || {};

    if (!payload.orderType) {
      throw createAppError("orderType is required", 400, "VALIDATION_ERROR");
    }
    if (!payload.transactionType) {
      throw createAppError(
        "transactionType is required",
        400,
        "VALIDATION_ERROR"
      );
    }
    if (!payload.partyCode) {
      throw createAppError("partyCode is required", 400, "VALIDATION_ERROR");
    }
    if (!ensureArrayWithData(payload.stockItems)) {
      throw createAppError(
        "At least one stock item is required",
        400,
        "VALIDATION_ERROR"
      );
    }

    const dealOrder = await DealOrderService.createDealOrder(
      payload,
      req.admin
    );

    res.status(201).json({
      success: true,
      message: "Deal order created successfully",
      data: dealOrder,
    });
  } catch (error) {
    next(error);
  }
};

export const getDealOrders = async (req, res, next) => {
  try {
    const result = await DealOrderService.listDealOrders(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getDealOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dealOrder = await DealOrderService.getDealOrderById(id);
    res.status(200).json({
      success: true,
      data: dealOrder,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDealOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    if (payload.stockItems && !ensureArrayWithData(payload.stockItems)) {
      throw createAppError(
        "stockItems must contain at least one entry",
        400,
        "VALIDATION_ERROR"
      );
    }

    const dealOrder = await DealOrderService.updateDealOrder(
      id,
      payload,
      req.admin
    );

    res.status(200).json({
      success: true,
      message: "Deal order updated successfully",
      data: dealOrder,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDealOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    await DealOrderService.deleteDealOrder(id, req.admin);
    res.status(200).json({
      success: true,
      message: "Deal order deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateDealOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    const dealOrder = await DealOrderService.updateOrderStatus(
      id,
      {
        stage: payload.stage,
        status: payload.status,
        note: payload.note,
      },
      req.admin
    );

    res.status(200).json({
      success: true,
      message: "Deal order status updated successfully",
      data: dealOrder,
    });
  } catch (error) {
    next(error);
  }
};

