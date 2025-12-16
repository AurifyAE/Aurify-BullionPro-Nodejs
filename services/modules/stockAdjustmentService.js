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
}

export default StockAdjustmentService;
