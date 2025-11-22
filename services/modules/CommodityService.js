import Commodity from "../../models/modules/Commodity.js";
import { createAppError } from "../../utils/errorHandler.js";

export default class CommodityService {
  // CREATE
  static async createCommodity(payload, adminId) {
    try {
      const {
        division,
        code,
        description,
        karatSelect,
        metalDecimal,
        lotEnabled,
        lotValue,
        lotPiece,
        rateType,
        defaultRateType,
        standardPurity,
      } = payload;

      if (!division || !code?.trim() || !karatSelect || defaultRateType == null) {
        throw createAppError("Missing required fields", 400, "REQUIRED_FIELD_MISSING");
      }

      const exists = await Commodity.isCodeExists(code);
      if (exists) {
        throw createAppError("Commodity code already exists", 409, "DUPLICATE_CODE");
      }

      const doc = new Commodity({
        division,
        code: code.trim().toUpperCase(),
        description: description?.trim() || null,
        karatSelect,
        standardPurity: Number(payload.standardPurity) || 0,
        metalDecimal: Number(metalDecimal) || 0,
        lotEnabled: !!lotEnabled,
        lotValue: lotEnabled ? Number(lotValue || 0) : null,
        lotPiece: lotEnabled ? Number(lotPiece || 0) : null,
        rateType: lotEnabled ? rateType || null : null,
        defaultRateType,
        createdBy: adminId,
      });

      await doc.save();

      return await Commodity.findById(doc._id)
        .populate("division", "branchName name code")
        .populate("karatSelect", "name value")
        .populate("rateType", "name")
        .populate("defaultRateType", "name")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  // LIST WITH PAGINATION + SEARCH
  static async listCommodities(page = 1, limit = 10, search = "") {
    try {
      const skip = (page - 1) * limit;
      const query = { status: true };
      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { description: new RegExp(search, "i") },
        ];
      }

      const [items, total] = await Promise.all([
        Commodity.find(query)
          .populate("division", "branchName name code")
          .populate("karatSelect", "karatCode standardPurity")
          .populate("rateType", "rateType convFactGms ")
          .populate("defaultRateType", "rateType convFactGms ")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Commodity.countDocuments(query),
      ]);

      return {
        items,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // GET BY ID
  static async getCommodityById(id) {
    try {
      const item = await Commodity.findById(id)
        .populate("division", "branchName name code")
        .populate("karatSelect", "name value")
        .populate("rateType", "name")
        .populate("defaultRateType", "name")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
      if (!item) throw createAppError("Commodity not found", 404, "NOT_FOUND");
      return item;
    } catch (error) {
      throw error;
    }
  }

  // UPDATE
  static async updateCommodity(id, payload, adminId) {
    try {
      const current = await Commodity.findById(id);
      if (!current) throw createAppError("Commodity not found", 404, "NOT_FOUND");

      if (payload.code && payload.code.toUpperCase() !== current.code) {
        const exists = await Commodity.isCodeExists(payload.code, id);
        if (exists) throw createAppError("Commodity code already exists", 409, "DUPLICATE_CODE");
      }

      const update = { ...payload };
      if (update.code) update.code = update.code.trim().toUpperCase();
      if (update.description !== undefined) {
        update.description = update.description?.trim() || null;
      }
      if (update.metalDecimal !== undefined) update.metalDecimal = Number(update.metalDecimal) || 0;
      if (update.standardPurity !== undefined) update.standardPurity = Number(update.standardPurity) || 0;
      if (update.lotEnabled !== undefined) update.lotEnabled = !!update.lotEnabled;
      if (update.lotEnabled) {
        update.lotValue = update.lotValue != null ? Number(update.lotValue) : null;
        update.lotPiece = update.lotPiece != null ? Number(update.lotPiece) : null;
      } else {
        update.lotValue = null;
        update.lotPiece = null;
        update.rateType = null;
      }

      update.updatedBy = adminId;

      const saved = await Commodity.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      })
        .populate("division", "branchName name code")
        .populate("karatSelect", "name value")
        .populate("rateType", "name")
        .populate("defaultRateType", "name")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return saved;
    } catch (error) {
      throw error;
    }
  }

  // DELETE (soft by status=false)
  static async deleteCommodity(id) {
    try {
      const item = await Commodity.findById(id);
      if (!item) throw createAppError("Commodity not found", 404, "NOT_FOUND");
      item.status = false;
      await item.save();
      return true;
    } catch (error) {
      throw error;
    }
  }
}


