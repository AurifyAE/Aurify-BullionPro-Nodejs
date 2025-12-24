import DealStrategy from "../../models/modules/DealStrategy.js";
import { createAppError } from "../../utils/errorHandler.js";
import mongoose from "mongoose";

class DealStrategyService {
  // Create or update deal strategy for a date
  static async createOrUpdateDealStrategy(strategyData, adminId) {
    try {
      const { date, lbma, uaegd, local } = strategyData;

      // Normalize date to UAE timezone start of day
      // The date will be normalized in the model pre-save hook
      // But we need to pass it correctly for findByDate
      // Use the same normalization function logic
      let normalizedDate;
      if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Parse as UAE local date: "2025-12-23 00:00 UAE" = "2025-12-22 20:00 UTC"
        const [year, month, day] = date.split('-').map(Number);
        normalizedDate = new Date(Date.UTC(year, month - 1, day - 1, 20, 0, 0, 0));
      } else {
        normalizedDate = new Date(date);
        const year = normalizedDate.getFullYear();
        const month = normalizedDate.getMonth();
        const day = normalizedDate.getDate();
        normalizedDate = new Date(Date.UTC(year, month, day - 1, 20, 0, 0, 0));
      }

      // Check if strategy already exists for this date
      const existingStrategy = await DealStrategy.findByDate(normalizedDate);

      if (existingStrategy) {
        // Update existing strategy
        existingStrategy.lbma = {
          value: lbma.value,
          type: lbma.type || "premium",
        };
        existingStrategy.uaegd = {
          value: uaegd.value,
          type: uaegd.type || "premium",
        };
        existingStrategy.local = {
          value: local.value,
          type: local.type || "premium",
        };
        existingStrategy.updatedBy = adminId;

        const updated = await existingStrategy.save();
        return updated;
      } else {
        // Create new strategy
        const newStrategy = new DealStrategy({
          date: normalizedDate,
          lbma: {
            value: lbma.value,
            type: lbma.type || "premium",
          },
          uaegd: {
            value: uaegd.value,
            type: uaegd.type || "premium",
          },
          local: {
            value: local.value,
            type: local.type || "premium",
          },
          createdBy: adminId,
          updatedBy: adminId,
        });

        const saved = await newStrategy.save();
        return saved;
      }
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error (date already exists)
        throw createAppError(
          "A deal strategy already exists for this date",
          400,
          "DUPLICATE_DATE"
        );
      }
      throw createAppError(
        `Failed to save deal strategy: ${error.message}`,
        500,
        "SAVE_ERROR"
      );
    }
  }

  // Get deal strategy by date
  static async getDealStrategyByDate(date) {
    try {
      const strategy = await DealStrategy.findByDate(date)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .lean();

      return strategy;
    } catch (error) {
      throw createAppError(
        `Failed to fetch deal strategy: ${error.message}`,
        500,
        "FETCH_ERROR"
      );
    }
  }

  // Get all deal strategies with pagination
  static async getAllDealStrategies(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        fromDate,
        toDate,
        sortBy = "date",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const query = {};

      // Date range filter - normalize to UAE timezone
      if (fromDate || toDate) {
        query.date = {};
        if (fromDate) {
          let from;
          if (typeof fromDate === 'string' && fromDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = fromDate.split('-').map(Number);
            from = new Date(Date.UTC(year, month - 1, day - 1, 20, 0, 0, 0));
          } else {
            from = new Date(fromDate);
            const year = from.getFullYear();
            const month = from.getMonth();
            const day = from.getDate();
            from = new Date(Date.UTC(year, month, day - 1, 20, 0, 0, 0));
          }
          query.date.$gte = from;
        }
        if (toDate) {
          let to;
          if (typeof toDate === 'string' && toDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = toDate.split('-').map(Number);
            to = new Date(Date.UTC(year, month - 1, day - 1, 19, 59, 59, 999));
          } else {
            to = new Date(toDate);
            const year = to.getFullYear();
            const month = to.getMonth();
            const day = to.getDate();
            to = new Date(Date.UTC(year, month, day - 1, 19, 59, 59, 999));
          }
          query.date.$lte = to;
        }
      }

      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const [strategies, total] = await Promise.all([
        DealStrategy.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        DealStrategy.countDocuments(query),
      ]);

      return {
        strategies,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      };
    } catch (error) {
      throw createAppError(
        `Failed to fetch deal strategies: ${error.message}`,
        500,
        "FETCH_ERROR"
      );
    }
  }

  // Get latest deal strategy
  static async getLatestDealStrategy() {
    try {
      const strategy = await DealStrategy.findOne()
        .sort({ date: -1 })
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .lean();

      return strategy;
    } catch (error) {
      throw createAppError(
        `Failed to fetch latest deal strategy: ${error.message}`,
        500,
        "FETCH_ERROR"
      );
    }
  }
}

export default DealStrategyService;

