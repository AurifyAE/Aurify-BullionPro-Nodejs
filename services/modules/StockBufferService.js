import StockBuffer from "../../models/modules/StockBuffer.js";
import InventoryService from "./inventoryService.js";
import { createAppError } from "../../utils/errorHandler.js";

class StockBufferService {
  /**
   * Create or update stock buffer (for total gold balance) - Daily based
   * When creating, automatically fetch current total gold balance
   */
  static async createOrUpdateStockBuffer(bufferData, adminId) {
    try {
      const { bufferGoal, date, remarks } = bufferData;

      if (!bufferGoal) {
        throw createAppError(
          "Buffer goal is required",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

      // Get current total gold balance
      const goldBalance = await InventoryService.getGoldBalanceFromLogs();
      const balanceWhenSet = goldBalance.totalPureGold || 0;

      // Normalize date to UAE timezone
      const targetDate = date ? new Date(date) : new Date();
      const normalizedDate = this.normalizeToUAEDate(targetDate);

      // Check if buffer exists for this date
      const existingBuffer = await StockBuffer.findByDate(normalizedDate);

      let buffer;
      if (existingBuffer) {
        // Update existing buffer for this date
        existingBuffer.bufferGoal = bufferGoal;
        existingBuffer.balanceWhenSet = balanceWhenSet;
        existingBuffer.remarks = remarks || existingBuffer.remarks;
        existingBuffer.updatedBy = adminId;

        buffer = await existingBuffer.save();
      } else {
        // Create new buffer for this date
        buffer = new StockBuffer({
          bufferGoal,
          balanceWhenSet,
          date: normalizedDate,
          remarks,
          createdBy: adminId,
        });

        buffer = await buffer.save();
      }

      return buffer;
    } catch (error) {
      console.error("[STOCK_BUFFER] Error creating/updating buffer:", error);
      if (error.code === 11000) {
        // Duplicate key error (date already exists)
        throw createAppError(
          "Buffer already exists for this date",
          400,
          "DUPLICATE_BUFFER_DATE"
        );
      }
      throw createAppError(
        `Failed to create/update stock buffer: ${error.message}`,
        error.statusCode || 500,
        error.errorCode || "STOCK_BUFFER_ERROR"
      );
    }
  }

  /**
   * Helper function to normalize date to UAE timezone
   */
  static normalizeToUAEDate(dateInput) {
    const date = new Date(dateInput);
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth();
    const utcDate = date.getUTCDate();

    // Create a new Date object representing 00:00:00.000 in UAE time (UTC+4)
    // This means 20:00:00.000 UTC of the previous day
    const uaeMidnightUtc = new Date(Date.UTC(utcYear, utcMonth, utcDate, 20, 0, 0, 0));
    return uaeMidnightUtc;
  }

  /**
   * Get stock buffer by ID
   */
  static async getStockBufferById(bufferId) {
    try {
      const buffer = await StockBuffer.findById(bufferId)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!buffer) {
        throw createAppError(
          "Stock buffer not found",
          404,
          "STOCK_BUFFER_NOT_FOUND"
        );
      }

      // Get current total gold balance
      const goldBalance = await InventoryService.getGoldBalanceFromLogs();
      const currentTotalBalance = goldBalance.totalPureGold || 0;

      const remainingToGoal = Math.max(0, buffer.bufferGoal - currentTotalBalance);
      const achieved = currentTotalBalance >= buffer.bufferGoal;
      const progress = buffer.bufferGoal > 0 
        ? Math.min(100, (currentTotalBalance / buffer.bufferGoal) * 100) 
        : 0;
      
      // Calculate difference from when buffer was set
      const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;

      return {
        ...buffer.toObject(),
        currentBalance: currentTotalBalance,
        remainingToGoal,
        achieved,
        progress: Math.round(progress * 100) / 100,
        differenceFromSet: Math.round(differenceFromSet * 100) / 100,
      };
    } catch (error) {
      if (error.errorCode === "STOCK_BUFFER_NOT_FOUND") {
        throw error;
      }
      throw createAppError(
        `Failed to get stock buffer: ${error.message}`,
        500,
        "GET_STOCK_BUFFER_ERROR"
      );
    }
  }

  /**
   * Get all stock buffers with current balance calculations
   */
  static async getAllStockBuffers(query = {}) {
    try {
      const { isActive } = query;

      const filter = {};
      if (isActive !== undefined) {
        filter.isActive = isActive === "true" || isActive === true;
      }

      const buffers = await StockBuffer.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ date: -1, createdAt: -1 });

      // Get current total gold balance
      const goldBalance = await InventoryService.getGoldBalanceFromLogs();
      const currentTotalBalance = goldBalance.totalPureGold || 0;

      // Enrich buffers with current balance and remaining calculation
      const enrichedBuffers = buffers.map((buffer) => {
        let remainingToGoal;
        let achieved;
        
        if (buffer.bufferGoal >= 0) {
          // Target is relative to balance when set
          // Example: balanceWhenSet = 2000, target = 1000, so target balance = 3000
          // Remaining = target - (current - balanceWhenSet)
          // Or: Remaining = (balanceWhenSet + target) - current
          const targetBalance = buffer.balanceWhenSet + buffer.bufferGoal;
          const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;
          remainingToGoal = Math.max(0, buffer.bufferGoal - differenceFromSet);
          achieved = currentTotalBalance >= targetBalance;
        } else {
          // Negative goal: need to reduce to this amount (sell)
          const targetAmount = Math.abs(buffer.bufferGoal);
          const targetBalance = buffer.balanceWhenSet - targetAmount; // Reduce by target amount
          const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;
          remainingToGoal = Math.max(0, targetAmount + differenceFromSet); // How much more to sell
          achieved = currentTotalBalance <= targetBalance;
        }
        
        let progress = 0;
        if (buffer.bufferGoal >= 0) {
          // Progress = how much of the target increment has been achieved
          const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;
          progress = buffer.bufferGoal > 0 
            ? Math.min(100, Math.max(0, (differenceFromSet / buffer.bufferGoal) * 100))
            : 0;
        } else {
          // For negative goals: progress = how much has been sold / total to sell
          const targetAmount = Math.abs(buffer.bufferGoal);
          const totalToSell = targetAmount;
          const sold = buffer.balanceWhenSet - currentTotalBalance;
          if (totalToSell > 0) {
            progress = Math.min(100, Math.max(0, (sold / totalToSell) * 100));
          } else {
            progress = achieved ? 100 : 0;
          }
        }
        
        // Calculate difference from when buffer was set
        const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;

        return {
          ...buffer.toObject(),
          currentBalance: currentTotalBalance,
          remainingToGoal,
          achieved,
          progress: Math.round(progress * 100) / 100, // Round to 2 decimal places
          differenceFromSet: Math.round(differenceFromSet * 100) / 100,
        };
      });

      return enrichedBuffers;
    } catch (error) {
      console.error("[STOCK_BUFFER] Error getting all buffers:", error);
      throw createAppError(
        `Failed to get stock buffers: ${error.message}`,
        500,
        "GET_ALL_STOCK_BUFFERS_ERROR"
      );
    }
  }

  /**
   * Get today's stock buffer with current balance calculations
   */
  static async getTodayBuffer() {
    try {
      const today = this.normalizeToUAEDate(new Date());
      const buffer = await StockBuffer.findByDate(today)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!buffer) {
        return null;
      }

      // Get current total gold balance
      const goldBalance = await InventoryService.getGoldBalanceFromLogs();
      const currentTotalBalance = goldBalance.totalPureGold || 0;

      // Calculate remaining to goal
      // Simple calculation: target - current
      // If current is negative, this becomes: target - (-current) = target + |current|
      // If current is positive, this becomes: target - current
      let remainingToGoal;
      let achieved;
      
      if (buffer.bufferGoal >= 0) {
        // Positive goal: target is increment from balance when set
        // targetBalance = balanceWhenSet + bufferGoal
        // remaining = bufferGoal - (current - balanceWhenSet)
        const targetBalance = buffer.balanceWhenSet + buffer.bufferGoal;
        const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;
        remainingToGoal = Math.max(0, buffer.bufferGoal - differenceFromSet);
        achieved = currentTotalBalance >= targetBalance;
      } else {
        // Negative goal: need to reduce by this amount from balance when set
        const targetAmount = Math.abs(buffer.bufferGoal);
        const targetBalance = buffer.balanceWhenSet - targetAmount; // Reduce by target amount
        const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;
        remainingToGoal = Math.max(0, targetAmount + differenceFromSet); // How much more to sell
        achieved = currentTotalBalance <= targetBalance;
      }
      
      // Calculate progress percentage
      let progress = 0;
      if (buffer.bufferGoal >= 0) {
        // For positive goals: progress = differenceFromSet / bufferGoal
        // How much of the target increment has been achieved
        const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;
        progress = buffer.bufferGoal > 0 
          ? Math.min(100, Math.max(0, (differenceFromSet / buffer.bufferGoal) * 100))
          : 0;
      } else {
        // For negative goals: progress = how much has been sold / total to sell
        const targetAmount = Math.abs(buffer.bufferGoal);
        const totalToSell = targetAmount;
        const sold = buffer.balanceWhenSet - currentTotalBalance;
        if (totalToSell > 0) {
          progress = Math.min(100, Math.max(0, (sold / totalToSell) * 100));
        } else {
          progress = achieved ? 100 : 0;
        }
      }
      
      // Calculate difference from when buffer was set
      const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;

      return {
        ...buffer.toObject(),
        currentBalance: currentTotalBalance,
        remainingToGoal,
        achieved,
        progress: Math.round(progress * 100) / 100,
        differenceFromSet: Math.round(differenceFromSet * 100) / 100,
      };
    } catch (error) {
      console.error("[STOCK_BUFFER] Error getting today's buffer:", error);
      throw createAppError(
        `Failed to get today's stock buffer: ${error.message}`,
        500,
        "GET_TODAY_BUFFER_ERROR"
      );
    }
  }

  /**
   * Get buffer by date
   */
  static async getBufferByDate(date) {
    try {
      const normalizedDate = this.normalizeToUAEDate(new Date(date));
      const buffer = await StockBuffer.findByDate(normalizedDate)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!buffer) {
        return null;
      }

      // Get current total gold balance
      const goldBalance = await InventoryService.getGoldBalanceFromLogs();
      const currentTotalBalance = goldBalance.totalPureGold || 0;

      const remainingToGoal = Math.max(0, buffer.bufferGoal - currentTotalBalance);
      const achieved = currentTotalBalance >= buffer.bufferGoal;
      const progress = buffer.bufferGoal > 0 
        ? Math.min(100, (currentTotalBalance / buffer.bufferGoal) * 100) 
        : 0;
      
      const differenceFromSet = currentTotalBalance - buffer.balanceWhenSet;

      return {
        ...buffer.toObject(),
        currentBalance: currentTotalBalance,
        remainingToGoal,
        achieved,
        progress: Math.round(progress * 100) / 100,
        differenceFromSet: Math.round(differenceFromSet * 100) / 100,
      };
    } catch (error) {
      console.error("[STOCK_BUFFER] Error getting buffer by date:", error);
      throw createAppError(
        `Failed to get buffer by date: ${error.message}`,
        500,
        "GET_BUFFER_BY_DATE_ERROR"
      );
    }
  }

  /**
   * Deactivate stock buffer (soft delete)
   */
  static async deactivateStockBuffer(bufferId, adminId) {
    try {
      const buffer = await StockBuffer.findById(bufferId);

      if (!buffer) {
        throw createAppError(
          "Stock buffer not found",
          404,
          "STOCK_BUFFER_NOT_FOUND"
        );
      }

      buffer.isActive = false;
      buffer.updatedBy = adminId;
      await buffer.save();

      return buffer;
    } catch (error) {
      if (error.errorCode === "STOCK_BUFFER_NOT_FOUND") {
        throw error;
      }
      throw createAppError(
        `Failed to deactivate stock buffer: ${error.message}`,
        500,
        "DEACTIVATE_STOCK_BUFFER_ERROR"
      );
    }
  }

  /**
   * Delete stock buffer (hard delete)
   */
  static async deleteStockBuffer(bufferId) {
    try {
      const buffer = await StockBuffer.findByIdAndDelete(bufferId);

      if (!buffer) {
        throw createAppError(
          "Stock buffer not found",
          404,
          "STOCK_BUFFER_NOT_FOUND"
        );
      }

      return buffer;
    } catch (error) {
      if (error.errorCode === "STOCK_BUFFER_NOT_FOUND") {
        throw error;
      }
      throw createAppError(
        `Failed to delete stock buffer: ${error.message}`,
        500,
        "DELETE_STOCK_BUFFER_ERROR"
      );
    }
  }
}

export default StockBufferService;
