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

        if (!query.includeCancelled) {
            filter.status = { $ne: "Cancelled" };
        }
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
                .populate("from.stockId", "code")
                .populate("to.stockId", "code")
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

    static async getStockAdjustmentById(id) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw createAppError("Invalid stock adjustment ID", 400);
        }

        const adjustment = await StockAdjustment.findById(id)
            .populate("division", "code")
            .populate("enteredBy", "name email")
            .populate("from.stockId", "code standardPurity")
            .populate("to.stockId", "code standardPurity")
            .lean();

        if (!adjustment) {
            throw createAppError("Stock adjustment not found", 404);
        }

        return adjustment;
    }

    static async updateStockAdjustment(id, data, adminId) {
        // 1. Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw createAppError("Invalid stock adjustment ID", 400);
        }

        // 2. Fetch existing adjustment
        const existing = await StockAdjustment.findById(id);
        if (!existing) {
            throw createAppError("Stock adjustment not found", 404);
        }

        // 3. Prevent editing cancelled records
        if (existing.status === "Cancelled") {
            throw createAppError("Cancelled adjustment cannot be edited", 400);
        }

        // 4. Resolve division (ID expected, but support name just in case)
        // let divisionId = data.division;

        // if (divisionId && !mongoose.Types.ObjectId.isValid(divisionId)) {
        //     const divisionDoc = await Division.findOne({ name: divisionId });
        //     if (!divisionDoc) {
        //         throw createAppError("Invalid division", 400);
        //     }
        //     divisionId = divisionDoc._id;
        // }

        // 5. Build update payload (snapshot overwrite)
        const updatePayload = {
            voucherType: data.voucherType || existing.voucherType,
            division: existing.division,
            status: data.status || existing.status,

            from: {
                stockId: data.fromData.stockId,
                grossWeight: data.fromData.grossWeight,
                purity: data.fromData.purity,
                pureWeight: data.fromData.pureWeight,
                avgMakingRate: data.fromData.avgRate ?? 0,
                avgMakingAmount: data.fromData.avgAmount ?? 0,
            },

            to: {
                stockId: data.toData.stockId,
                grossWeight: data.toData.grossWeight,
                purity: data.toData.purity,
                pureWeight: data.toData.pureWeight,
                avgMakingRate: data.toData.avgRate ?? 0,
                avgMakingAmount: data.toData.avgAmount ?? 0,
            },
        };

        // 6. Persist update
        const updated = await StockAdjustment.findByIdAndUpdate(
            id,
            updatePayload,
            { new: true }
        )
            .populate("division", "description code")
            .populate("enteredBy", "name email")
            .populate("from.stockId", "code")
            .populate("to.stockId", "code");

        return updated;
    }

    static async deleteStockAdjustment(id, adminId) {
        // 1. Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw createAppError("Invalid stock adjustment ID", 400);
        }

        // 2. Fetch adjustment
        const adjustment = await StockAdjustment.findById(id);

        if (!adjustment) {
            throw createAppError("Stock adjustment not found", 404);
        }

        // // 3. Prevent deleting completed adjustments
        // if (adjustment.status === "Completed") {
        //     throw createAppError(
        //         "Completed stock adjustments cannot be deleted",
        //         400
        //     );
        // }

        // 4. Cancel (soft delete)
        adjustment.status = "Cancelled";
        adjustment.cancelledBy = adminId; // optional (recommended)
        adjustment.cancelledAt = new Date(); // optional (recommended)

        await adjustment.save();

        return adjustment;
    }

}

export default StockAdjustmentService;
