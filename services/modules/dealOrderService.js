import mongoose from "mongoose";
import DealOrder from "../../models/modules/DealOrder.js";
import { createAppError } from "../../utils/errorHandler.js";

const sanitizeNumber = (val, fallback = 0) => {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

const getAdminId = (admin) => admin?.id || admin?._id || null;

class DealOrderService {
  static async generateOrderNumber() {
    let orderNumber;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loop

    // Generate a unique order number with format: OR + 3 random digits
    while (!isUnique && attempts < maxAttempts) {
      // Generate a random 3-digit number (001 to 999)
      const randomNum = Math.floor(Math.random() * 999) + 1;
      const padded = String(randomNum).padStart(3, "0");
      orderNumber = `OR${padded}`;

      // Check if this order number already exists
      const existing = await DealOrder.findOne({ orderNumber });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw createAppError(
        "Failed to generate unique order number",
        500,
        "ORDER_NUMBER_GENERATION_FAILED"
      );
    }

    return orderNumber;
  }

  static async createDealOrder(payload, adminContext) {
    const adminId = getAdminId(adminContext);
    if (!adminId) {
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const orderNumber =
      payload.orderNumber || (await DealOrderService.generateOrderNumber());

    const historyEntry = {
      stage: "created",
      status: payload.status || "draft",
      note: payload.progressNote || "Deal order created",
      updatedBy: adminId,
    };

    const dealOrder = await DealOrder.create({
      ...payload,
      orderNumber,
      progress: {
        currentStage: "created",
        history: [historyEntry],
      },
      createdBy: adminId,
      updatedBy: adminId,
    });

    return await DealOrderService.getDealOrderById(dealOrder._id);
  }

  static buildFilters(query = {}) {
    const filters = { isDeleted: false };

    if (query.status) {
      filters.status = query.status;
    }

    if (query.orderType) {
      filters.orderType = query.orderType;
    }

    if (query.transactionType) {
      filters.transactionType = query.transactionType;
    }

    if (query.stage) {
      filters["progress.currentStage"] = query.stage;
    }

    if (query.search) {
      const regex = new RegExp(query.search, "i");
      filters.$or = [{ orderNumber: regex }, { partyName: regex }];
    }

    if (query.startDate || query.endDate) {
      filters.createdAt = {};
      if (query.startDate) {
        filters.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filters.createdAt.$lte = new Date(query.endDate);
      }
    }

    // Filter by deliveryDate (single date - find orders with delivery on that day)
    // The date string comes as "YYYY-MM-DD" representing a date in UAE timezone
    // In DB, dates are stored as UTC midnight (e.g., "2025-12-19T00:00:00.000Z")
    // UAE date "2025-12-19" spans from 2025-12-18 20:00 UTC to 2025-12-19 20:00 UTC (exclusive)
    // So we match: >= 2025-12-18T20:00:00.000Z AND < 2025-12-19T20:00:00.000Z
    if (query.deliveryDate) {
      const dateStr = query.deliveryDate; // Format: "YYYY-MM-DD"
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Start of day in UAE (UTC+4): 2025-12-19 00:00:00 UAE = 2025-12-18 20:00:00 UTC
      const startOfDay = new Date(Date.UTC(year, month - 1, day - 1, 20, 0, 0, 0));
      
      // End of day: up to but not including next day's start in UAE
      // 2025-12-19 20:00:00 UTC = start of 2025-12-20 in UAE
      // So we use < 2025-12-19T20:00:00.000Z, which means <= 2025-12-19T19:59:59.999Z
      const endOfDay = new Date(Date.UTC(year, month - 1, day, 19, 59, 59, 999));

      filters.deliveryDate = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }

    return filters;
  }

  static async listDealOrders(query = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const filters = DealOrderService.buildFilters(query);
    console.log("filters:", filters);
    const FetchQuery = DealOrder.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "partyCode",
        select: "accountCode customerName"
      })
      .populate("salesmanId", "name code")
      .populate("stockItems.stockCode", "code description")
      .populate("partyCurrency", "currencyCode convertRate purchasePrice sellPrice")
      .populate("itemCurrency", "currencyCode convertRate purchasePrice sellPrice")
      .lean();

    const [data, total] = await Promise.all([
      FetchQuery,
      DealOrder.countDocuments(filters),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async getDealOrderById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createAppError("Invalid deal order id", 400, "INVALID_ID");
    }

    const dealOrder = await DealOrder.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate({
        path: "partyCode",
        select: "accountCode customerName"
      })
      .populate("salesmanId", "name code")
      .populate("stockItems.stockCode", "code description grossWeight purity")
      .populate("partyCurrency", "currencyCode convertRate purchasePrice sellPrice")
      .populate("itemCurrency", "currencyCode convertRate purchasePrice sellPrice")
      .lean();

    if (!dealOrder) {
      throw createAppError("Deal order not found", 404, "DEAL_ORDER_NOT_FOUND");
    }

    return dealOrder;
  }

  static async updateDealOrder(id, payload, adminContext) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createAppError("Invalid deal order id", 400, "INVALID_ID");
    }

    const adminId = getAdminId(adminContext);
    if (!adminId) {
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const dealOrder = await DealOrder.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { ...payload, updatedBy: adminId },
      { new: true }
    )
      .populate({
        path: "partyCode",
        select: "accountCode customerName"
      })
      .populate("salesmanId", "name code")
      .populate("stockItems.stockCode", "code description")
      .populate("partyCurrency", "currencyCode convertRate")
      .populate("itemCurrency", "currencyCode convertRate");
      console.log("dealOrder:", dealOrder);
    if (!dealOrder) {
      throw createAppError("Deal order not found", 404, "DEAL_ORDER_NOT_FOUND");
    }

    return dealOrder;
  }

  static async deleteDealOrder(id, adminContext) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createAppError("Invalid deal order id", 400, "INVALID_ID");
    }

    const adminId = getAdminId(adminContext);
    if (!adminId) {
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const dealOrder = await DealOrder.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        isDeleted: true,
        status: "cancelled",
        "progress.currentStage": "cancelled",
        $push: {
          "progress.history": {
            stage: "cancelled",
            status: "cancelled",
            note: "Order deleted",
            updatedBy: adminId,
            updatedAt: new Date(),
          },
        },
        updatedBy: adminId,
      },
      { new: true }
    )
      .populate({
        path: "partyCode",
        select: "accountCode customerName"
      })
      .populate("salesmanId", "name code");

    if (!dealOrder) {
      throw createAppError("Deal order not found", 404, "DEAL_ORDER_NOT_FOUND");
    }

    return dealOrder;
  }

  static async updateOrderStatus(id, payload, adminContext) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createAppError("Invalid deal order id", 400, "INVALID_ID");
    }

    const adminId = getAdminId(adminContext);
    if (!adminId) {
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const update = { updatedBy: adminId };
    const historyEntry = {
      updatedBy: adminId,
      updatedAt: new Date(),
    };

    if (payload.stage) {
      if (!DealOrder.progressStages.includes(payload.stage)) {
        throw createAppError("Invalid progress stage", 400, "INVALID_STAGE");
      }
      update["progress.currentStage"] = payload.stage;
      historyEntry.stage = payload.stage;
    }

    if (payload.status) {
      update.status = payload.status;
      historyEntry.status = payload.status;
    }

    if (payload.cancellationReason) {
      update.cancellationReason = payload.cancellationReason;
      historyEntry.note = payload.cancellationReason;
    }

    if (payload.note) {
      historyEntry.note = payload.note;
    }

    if (!historyEntry.stage && !historyEntry.status) {
      throw createAppError(
        "Nothing to update. Provide stage or status",
        400,
        "INVALID_UPDATE"
      );
    }

    update.$push = { "progress.history": historyEntry };

    const dealOrder = await DealOrder.findOneAndUpdate(
      { _id: id, isDeleted: false },
      update,
      { new: true }
    )
      .populate({
        path: "partyCode",
        select: "accountCode customerName"
      })
      .populate("salesmanId", "name code");

    if (!dealOrder) {
      throw createAppError("Deal order not found", 404, "DEAL_ORDER_NOT_FOUND");
    }

    return dealOrder;
  }
}

export default DealOrderService;

