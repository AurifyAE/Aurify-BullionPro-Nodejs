import StockBufferService from "../../services/modules/StockBufferService.js";
import { createAppError } from "../../utils/errorHandler.js";

/**
 * Create or update stock buffer
 * POST /api/v1/stock-buffer
 */
export const createOrUpdateStockBuffer = async (req, res, next) => {
  try {
    const adminId = req.admin?.id;

    if (!adminId) {
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const buffer = await StockBufferService.createOrUpdateStockBuffer(
      req.body,
      adminId
    );

    res.status(200).json({
      success: true,
      message: "Stock buffer saved successfully",
      data: buffer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get stock buffer by ID
 * GET /api/v1/stock-buffer/:id
 */
export const getStockBufferById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const buffer = await StockBufferService.getStockBufferById(id);

    res.status(200).json({
      success: true,
      message: "Stock buffer fetched successfully",
      data: buffer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all stock buffers
 * GET /api/v1/stock-buffer
 */
export const getAllStockBuffers = async (req, res, next) => {
  try {
    const buffers = await StockBufferService.getAllStockBuffers(req.query);

    res.status(200).json({
      success: true,
      message: "Stock buffers fetched successfully",
      data: buffers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get today's stock buffer
 * GET /api/v1/stock-buffer/today
 */
export const getTodayBuffer = async (req, res, next) => {
  try {
    const buffer = await StockBufferService.getTodayBuffer();

    res.status(200).json({
      success: true,
      message: buffer 
        ? "Today's buffer fetched successfully" 
        : "No buffer found for today",
      data: buffer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get buffer by date
 * GET /api/v1/stock-buffer/date/:date
 */
export const getBufferByDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    const buffer = await StockBufferService.getBufferByDate(date);

    res.status(200).json({
      success: true,
      message: buffer 
        ? "Buffer fetched successfully" 
        : "No buffer found for this date",
      data: buffer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate stock buffer
 * PATCH /api/v1/stock-buffer/:id/deactivate
 */
export const deactivateStockBuffer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id;

    if (!adminId) {
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const buffer = await StockBufferService.deactivateStockBuffer(id, adminId);

    res.status(200).json({
      success: true,
      message: "Stock buffer deactivated successfully",
      data: buffer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete stock buffer
 * DELETE /api/v1/stock-buffer/:id
 */
export const deleteStockBuffer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const buffer = await StockBufferService.deleteStockBuffer(id);

    res.status(200).json({
      success: true,
      message: "Stock buffer deleted successfully",
      data: buffer,
    });
  } catch (error) {
    next(error);
  }
};

