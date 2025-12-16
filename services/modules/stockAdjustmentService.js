import mongoose from "mongoose";
import StockAdjustment from "../../models/modules/StockAdjustment.js"; // adjust path
// import Division from "../../models/modules/Division.js";
import { createAppError } from "../../utils/errorHandler.js";

export class StockAdjustmentService {
    static async addStockAdjustment(data, adminId) {
        try {
            // 1. Basic validation
            if (!data.fromData || !data.toStock) {
                throw createAppError("From / To stock data missing", 400);
            }

            // 2. Resolve division (supports name or ObjectId)
            // let divisionId = data.division;

            // if (!mongoose.Types.ObjectId.isValid(divisionId)) {
            //     const divisionDoc = await Division.findOne({ name: divisionId });
            //     if (!divisionDoc) {
            //         throw createAppError("Invalid division", 400);
            //     }
            //     divisionId = divisionDoc._id;
            // }

            const stockAdjustmentDoc = {
                from: {
                    stockId: data.fromData.stockId,
                    grossWeight: data.fromData.grossWeight,
                    purity: data.fromData.purity,
                    pureWeight: data.fromData.pureWeight,
                    avgMakingRate: data.fromData.avgRate ?? 0,
                    avgMakingAmount: data.fromData.avgAmount ?? 0,
                },

                to: {
                    stockId: data.toStock.stockId,
                    grossWeight: data.toStock.grossWeight,
                    purity: data.toStock.purity,
                    pureWeight: data.toStock.pureWeight,
                    avgMakingRate: data.toStock.avgRate ?? 0,
                    avgMakingAmount: data.toStock.avgAmount ?? 0,
                },

                status: data.status || "Pending",

                voucherNumber: data.voucherNo,
                voucherType: data.voucherType || "STOCK-ADJ",

                division: "68d4eeddaac2a0c78fb796e0", //divisionId,
                enteredBy: adminId,
            };

            // 4. Persist
            const adjustment = await StockAdjustment.create(stockAdjustmentDoc);

            return adjustment;
        } catch (error) {
            throw error;
        }
    }
    static async getAllStockAdjustments(query) {
        const {
            page = 1,
            limit = 20,
            status,
            division,
            fromDate,
            toDate,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = query;

        const filter = {};

        // Status filter
        if (status) {
            filter.status = status;
        }

        // Division filter
        if (division && mongoose.Types.ObjectId.isValid(division)) {
            filter.division = division;
        }

        // Date range filter
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            StockAdjustment.find(filter)
                .populate("division", "code")
                .populate("enteredBy", "name email")
                .populate("from.stockId", "stockCode")
                .populate("to.stockId", "stockCode")
                .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),

            StockAdjustment.countDocuments(filter),
        ]);

        return {
            data,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
            },
        };
    }

}

export default StockAdjustmentService;
