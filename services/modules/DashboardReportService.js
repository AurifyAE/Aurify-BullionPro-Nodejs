import mongoose from "mongoose";
import moment from "moment";
import Registry from "../../models/modules/Registry.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import MetalStock from "../../models/modules/MetalStock.js";
import TransactionFixing from "../../models/modules/TransactionFixing.js";
import Account from "../../models/modules/AccountType.js";
import Entry from "../../models/modules/EntryModel.js";
import MetalTransaction from "../../models/modules/MetalTransaction.js";

const { ObjectId } = mongoose.Types;

export class DashboardReportService {
    /**
     * Fetches dashboard report data based on date range and optional filters
     * @param {Object} filters - Filters including fromDate, toDate, and optional parameters
     * @returns {Object} Aggregated dashboard data
     */


    getDateRange(filters) {
        const now = new Date();
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        let fromDate, toDate;

        // ✅ If user gives dates
        if (filters.fromDate) {
            fromDate = new Date(filters.fromDate);
        } else {
            // ✅ Default to 30 days ago
            fromDate = new Date();
            fromDate.setDate(now.getDate() - 30);
        }

        if (filters.toDate) {
            toDate = new Date(filters.toDate);
        } else {
            toDate = todayEnd;
        }

        return { fromDate, toDate };
    }


    async getDashboardReport(filters) {
        try {
            // Validate and format input filters
            const validatedFilters = this.validateFilters(filters);

            // Execute all aggregation pipelines in parallel
            const [
                totalTransactions,
                totalRevenue,
                revenueAndProfit,
                stockMovement,
                stockAnalysis,
                salesAnalysis,
                fixingRegistry,
                ownStock,
            ] = await Promise.all([
                this.getTotalTransactions(validatedFilters),
                this.getTotalRevenue(validatedFilters),
                this.getRevenueAndProfit(validatedFilters),
                this.getStockMovement(validatedFilters),
                this.getStockAnalysis(validatedFilters),
                this.getSalesAnalysis(validatedFilters),
                this.getFixingRegistry(validatedFilters),
                this.getOwnStock(validatedFilters),
            ]);
            // Format the response
            return {
                success: true,
                data: {
                    totalTransactions,
                    totalRevenue,
                    revenueAndProfit,
                    stockMovement,
                    stockAnalysis,
                    salesAnalysis,
                    fixingRegistry,
                    ownStock,
                },
                filters: validatedFilters,
            };
        } catch (error) {
            throw new Error(`Failed to generate dashboard report: ${error.message}`);
        }
    }

    /**
     * Validates and formats input filters
     * @param {Object} filters - Input filters
     * @returns {Object} Validated and formatted filters
     */
    validateFilters(filters = {}) {
        const { fromDate, toDate, groupByRange, voucher, division } = filters;

        // Initialize dates
        let startDate = null;
        let endDate = null;

        if (fromDate) startDate = moment(fromDate).startOf("day").toDate();
        if (toDate) endDate = moment(toDate).endOf("day").toDate();

        if (startDate && endDate && startDate > endDate) {
            throw new Error("From date cannot be greater than to date");
        }

        return {
            startDate: startDate ? startDate.toISOString() : null,
            endDate: endDate ? endDate.toISOString() : null,
            groupByRange: groupByRange || { stockCode: [], karat: [] },
            voucher: voucher || [],
            division: division || [],
        };
    }

/**
 * Fetches total number of transactions within the date range from MetalTransaction and FixingRegistry
 * @param {Object} filters - Validated filters
 * @returns {Number} Total transaction count
 */
async getTotalTransactions(filters) {
    const matchConditions = { isActive: true };

    if (filters.startDate || filters.endDate) {
        matchConditions.transactionDate = {};
        if (filters.startDate) {
            matchConditions.transactionDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            matchConditions.transactionDate.$lte = new Date(filters.endDate);
        }
    }

    const pipeline = [
        { $match: matchConditions },
        { $count: "totalTransactions" }
    ];
    const [transatResult, metalResult] = await Promise.all([
        TransactionFixing.aggregate(pipeline),
        MetalTransaction.aggregate(pipeline)
    ]);

    const fixingCount = transatResult[0]?.totalTransactions || 0;
    const metalCount = metalResult[0]?.totalTransactions || 0;

    return fixingCount + metalCount;
}

    /**
     * Fetches total revenue within the date range
     * @param {Object} filters - Validated filters
     * @returns {Number} Total revenue
     */
    async getTotalRevenue(filters) {
        const matchConditions = {
            isActive: true,
            type: { $in: ["sale", "sales-fixing"] },
        };

        if (filters.startDate || filters.endDate) {
            matchConditions.transactionDate = {};
            if (filters.startDate) {
                matchConditions.transactionDate.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                matchConditions.transactionDate.$lte = new Date(filters.endDate);
            }
        }

        const pipeline = [
            { $match: matchConditions },
            {
                $lookup: {
                    from: "metaltransactions",
                    localField: "metalTransactionId",
                    foreignField: "_id",
                    as: "metalTransaction",
                },
            },
            { $unwind: { path: "$metalTransaction", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: "$metalTransaction.totalAmountSession.totalAmountAED",
                    },
                },
            },
            { $project: { _id: 0, totalRevenue: 1 } },
        ];

        const result = await Registry.aggregate(pipeline);
        return result[0]?.totalRevenue || 0;
    }

    /**
     * Fetches revenue and profit data for bar chart
     * @param {Object} filters - Validated filters
     * @returns {Array} Revenue and profit data by date
     */
    async getRevenueAndProfit(filters) {
        const matchConditions = {
            isActive: true,
            $or: [{ type: "sale" }, { type: "purchase" }],
        };

        if (filters.startDate || filters.endDate) {
            matchConditions.transactionDate = {};
            if (filters.startDate) {
                matchConditions.transactionDate.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                matchConditions.transactionDate.$lte = new Date(filters.endDate);
            }
        }

        const pipeline = [
            { $match: matchConditions },
            {
                $lookup: {
                    from: "metaltransactions",
                    localField: "metalTransactionId",
                    foreignField: "_id",
                    as: "metalTransaction",
                },
            },
            { $unwind: { path: "$metalTransaction", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
                        type: "$metalTransaction.transactionType",
                    },
                    totalAmount: {
                        $sum: "$metalTransaction.totalAmountSession.totalAmountAED",
                    },
                    totalCost: {
                        $sum: {
                            $cond: [
                                { $eq: ["$metalTransaction.transactionType", "purchase"] },
                                "$metalTransaction.totalAmountSession.totalAmountAED",
                                0,
                            ],
                        },
                    },
                },
            },
            {
                $group: {
                    _id: "$_id.date",
                    revenue: {
                        $sum: {
                            $cond: [{ $eq: ["$_id.type", "sale"] }, "$totalAmount", 0],
                        },
                    },
                    cost: {
                        $sum: {
                            $cond: [{ $eq: ["$_id.type", "purchase"] }, "$totalCost", 0],
                        },
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    revenue: 1,
                    profit: { $subtract: ["$revenue", "$cost"] },
                },
            },
            { $sort: { date: 1 } },
        ];

        return await Registry.aggregate(pipeline);
    }

    /**
     * Fetches stock movement (total gross weight, pure weight, etc. per stock)
     * @param {Object} filters - Validated filters
     * @returns {Array} Stock movement data
     */
    async getStockMovement(filters) {
        const pipeline = [];
        const matchConditions = {};

        if (filters.startDate || filters.endDate) {
            matchConditions.createdAt = {};
            if (filters.startDate) {
                matchConditions.createdAt.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                matchConditions.createdAt.$lte = new Date(filters.endDate);
            }
        }
        if (filters.groupByRange?.stockCode?.length) {
            matchConditions.stockCode = { $in: filters.groupByRange.stockCode };
        }
        if (filters.voucher?.length) {
            const regexFilters = filters.voucher.map((v) => new RegExp(`^${v.prefix}`, "i"));
            matchConditions.voucherCode = { $in: regexFilters };
        }

        pipeline.push({ $match: matchConditions });

        // Lookup stock details from metalstocks collection
        pipeline.push({
            $lookup: {
                from: "metalstocks",
                localField: "stockCode",
                foreignField: "_id",
                as: "stockDetails",
            },
        });

        // Unwind the stockDetails array
        pipeline.push({
            $unwind: {
                path: "$stockDetails",
                preserveNullAndEmptyArrays: true,
            },
        });

        // Lookup karat purity from karatmasters
        pipeline.push({
            $lookup: {
                from: "karatmasters",
                localField: "stockDetails.karat",
                foreignField: "_id",
                as: "karatDetails",
            },
        });

        // Unwind the karatDetails array
        pipeline.push({
            $unwind: {
                path: "$karatDetails",
                preserveNullAndEmptyArrays: true,
            },
        });

        if (filters.groupByRange?.karat?.length) {
            pipeline.push({
                $match: {
                    "stockDetails.karat": { $in: filters.groupByRange.karat },
                },
            });
        }

        if (filters.division?.length) {
            pipeline.push({
                $match: {
                    "karatDetails.division": { $in: filters.division },
                },
            });
        }

        // Group by stockCode to calculate totals
        pipeline.push({
            $group: {
                _id: "$stockCode",
                stockId: { $first: "$stockDetails._id" },
                code: { $first: "$stockDetails.code" },
                purity: { $first: "$karatDetails.standardPurity" },
                description: { $first: "$stockDetails.description" },
                totalValue: { $first: "$stockDetails.totalValue" },
                pcs: { $first: "$stockDetails.pcs" },
                weightData: {
                    $push: {
                        pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
                        grossWeight: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$transactionType", "sale"] }, then: { $multiply: ["$grossWeight", -1] } },
                                    { case: { $eq: ["$transactionType", "metalPayment"] }, then: { $multiply: ["$grossWeight", -1] } },
                                    { case: { $eq: ["$transactionType", "purchaseReturn"] }, then: { $multiply: ["$grossWeight", -1] } },
                                    { case: { $eq: ["$transactionType", "saleReturn"] }, then: "$grossWeight" },
                                    { case: { $eq: ["$transactionType", "purchase"] }, then: "$grossWeight" },
                                    { case: { $eq: ["$transactionType", "metalReceipt"] }, then: "$grossWeight" },
                                    { case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" },
                                ],
                                default: 0,
                            },
                        },
                        pureWeight: {
                            $multiply: [
                                {
                                    $switch: {
                                        branches: [
                                            { case: { $eq: ["$transactionType", "sale"] }, then: { $multiply: ["$grossWeight", -1] } },
                                            { case: { $eq: ["$transactionType", "metalPayment"] }, then: { $multiply: ["$grossWeight", -1] } },
                                            { case: { $eq: ["$transactionType", "purchaseReturn"] }, then: { $multiply: ["$grossWeight", -1] } },
                                            { case: { $eq: ["$transactionType", "saleReturn"] }, then: "$grossWeight" },
                                            { case: { $eq: ["$transactionType", "purchase"] }, then: "$grossWeight" },
                                            { case: { $eq: ["$transactionType", "metalReceipt"] }, then: "$grossWeight" },
                                            { case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" },
                                        ],
                                        default: 0,
                                    },
                                },
                                "$karatDetails.standardPurity",
                            ],
                        },
                    },
                },
                metalReceipt: {
                    $push: {
                        pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
                        grossWeight: {
                            $switch: {
                                branches: [{ case: { $eq: ["$transactionType", "metalReceipt"] }, then: "$grossWeight" }],
                                default: 0,
                            },
                        },
                    },
                },
                openingBalance: {
                    $push: {
                        pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
                        grossWeight: {
                            $switch: {
                                branches: [{ case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" }],
                                default: 0,
                            },
                        },
                    },
                },
                metalPayment: {
                    $push: {
                        pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
                        grossWeight: {
                            $switch: {
                                branches: [{ case: { $eq: ["$transactionType", "metalPayment"] }, then: "$grossWeight" }],
                                default: 0,
                            },
                        },
                    },
                },
            },
        });

        // Project to reshape the result
        pipeline.push({
            $project: {
                _id: 0,
                stockId: 1,
                code: 1,
                purity: 1,
                description: 1,
                totalValue: 1,
                pcs: 1,
                opening: {
                    grossWeight: { $sum: "$openingBalance.grossWeight" },
                    pcs: { $sum: "$openingBalance.pcs" },
                },
                weight: {
                    pcs: { $sum: "$weightData.pcs" },
                    grossWeight: { $sum: "$weightData.grossWeight" },
                    pureWeight: { $sum: "$weightData.pureWeight" },
                    net: { $sum: "$weightData.pureWeight" },
                },
                netPurchase: {
                    pcs: null,
                    grossWeight: { $sum: "$weightData.grossWeight" },
                },
                receipt: {
                    pcs: null,
                    grossWeight: { $sum: "$metalReceipt.grossWeight" },
                },
                payment: {
                    pcs: null,
                    grossWeight: { $sum: "$metalPayment.grossWeight" },
                },
                closing: {
                    pcs: null,
                    grossWeight: { $sum: "$weightData.grossWeight" },
                    pureWeight: { $sum: "$weightData.pureWeight" },
                },
            },
        });

        // Remove entries with all zero values
        pipeline.push({
            $match: {
                $or: [
                    { "opening.grossWeight": { $ne: 0 } },
                    { "weight.grossWeight": { $ne: 0 } },
                    { "payment.grossWeight": { $ne: 0 } },
                    { "receipt.grossWeight": { $ne: 0 } },
                    { "closing.grossWeight": { $ne: 0 } },
                ],
            },
        });

        return await InventoryLog.aggregate(pipeline);
    }

    /**
     * Fetches stock analysis (net amount per stock, including metal receipts from Entry collection)
     * @param {Object} filters - Validated filters
     * @returns {Array} Stock analysis data
     */
    async getStockAnalysis(filters) {
        // Pipeline for Registry collection (GOLD_STOCK transactions)
        const registryPipeline = [
            {
                $match: {
                    isActive: true,
                    type: "GOLD_STOCK",
                    ...(filters.startDate || filters.endDate
                        ? {
                            transactionDate: {
                                ...(filters.startDate && { $gte: new Date(filters.startDate) }),
                                ...(filters.endDate && { $lte: new Date(filters.endDate) }),
                            },
                        }
                        : {}),
                },
            },
            {
                $lookup: {
                    from: "metaltransactions",
                    localField: "metalTransactionId",
                    foreignField: "_id",
                    as: "metalTransaction",
                },
            },
            { $unwind: { path: "$metalTransaction", preserveNullAndEmptyArrays: true } },
            {
                $unwind: {
                    path: "$metalTransaction.stockItems",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: "metalstocks",
                    localField: "metalTransaction.stockItems.stockCode",
                    foreignField: "_id",
                    as: "stockDetails",
                },
            },
            { $unwind: { path: "$stockDetails", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$stockDetails.code",
                    netAmount: {
                        $sum: { $ifNull: ["$metalTransaction.stockItems.itemTotal.itemTotalAmount", 0] },
                    },
                },
            },
        ];

        // Pipeline for Entry collection (metal-receipt transactions)
        const entryPipeline = [
            {
                $match: {
                    type: "metal-receipt",
                    ...(filters.startDate || filters.endDate
                        ? {
                            voucherDate: {
                                ...(filters.startDate && { $gte: new Date(filters.startDate) }),
                                ...(filters.endDate && { $lte: new Date(filters.endDate) }),
                            },
                        }
                        : {}),
                },
            },
            {
                $unwind: {
                    path: "$stockItems",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: "metalstocks",
                    localField: "stockItems.stock",
                    foreignField: "_id",
                    as: "stockDetails",
                },
            },
            { $unwind: { path: "$stockDetails", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$stockDetails.code",
                    netAmount: {
                        $sum: { $ifNull: ["$totalGrossWeight", 0] }, // Use totalAmount for metal-receipt
                    },
                },
            },
        ];

        // Execute both pipelines in parallel
        const [registryResults, entryResults] = await Promise.all([
            Registry.aggregate(registryPipeline),
            Entry.aggregate(entryPipeline),
        ]);

        // Combine results by stockCode
        const combinedResults = {};
        [...registryResults, ...entryResults].forEach((result) => {
            if (result._id) {
                if (!combinedResults[result._id]) {
                    combinedResults[result._id] = { stockCode: result._id, netAmount: 0 };
                }
                combinedResults[result._id].netAmount += result.netAmount;
            }
        });

        // Convert to array and sort
        const finalResults = Object.values(combinedResults)
            .map(({ stockCode, netAmount }) => ({ stockCode, netAmount }))
            .sort((a, b) => a.stockCode.localeCompare(b.stockCode));

        return finalResults;
    }



    async getSalesAnalysis(filters) {
        try {
            filters.voucher = [
                { voucherType: 'PURCHASE-RETURN', prefix: 'PR' },
                { voucherType: 'MP', prefix: 'MP' },
                { voucherType: 'METAL-RECEIPT', prefix: 'MR' },
                { voucherType: 'METAL-SALE', prefix: 'SAL' },
                { voucherType: 'OPENING-STOCK-BALANCE', prefix: 'OSB' },
                { voucherType: 'METAL-STOCK', prefix: 'MS' },
                { voucherType: 'OPENING-BALANCE', prefix: 'OB' },
                { voucherType: 'TRANSFER', prefix: 'T' },
                { voucherType: 'CURRENCY-RECEIPT', prefix: 'CR' },
                { voucherType: 'SALES-FIXING', prefix: 'SF' },
                { voucherType: 'SALES-RETURN', prefix: 'SR' },
                { voucherType: 'METAL-PURCHASE', prefix: 'PRM' },
                { voucherType: 'CURRENCY-PAYMENT', prefix: 'CP' },
                { voucherType: 'PURCHASE-FIXING', prefix: 'PF' }
            ]

            const date = this.getValidatedDateRange(filters);
            const salesPipeline = this.buildSalesAnalysis(date);
            const purchasePipeline = this.buildSalesAnalysisPurchase();


            const salesReport = await Registry.aggregate(salesPipeline).exec();
            //   console.log('====================================');
            //   console.log(salesReport);

            const purchaseReport = await Registry.aggregate(purchasePipeline).exec();

            const reportData = this.calculateSalesAnalysis(salesReport, purchaseReport);

            return {
                success: true,
                message: "Sales analysis report generated successfully",
                data: reportData,
                totalRecords: reportData.transactions ? reportData.transactions.length : 0,
            };
        } catch (error) {
            console.error('Aggregation error:', error); // Enhanced logging for prod debugging
            throw new Error(`Failed to generate sales analysis report: ${error.message}`);
        }
    }

    getValidatedDateRange(filters) {
        const now = new Date();
        // filters.fromDate="2025-09-24"
        // filters.toDate="2025-10-13"
        // ✅ Default: last 30 days if no date provided
        let startDate = filters.fromDate
            ? moment(filters.fromDate).startOf("day").toDate()
            : moment(now).subtract(30, "days").startOf("day").toDate();

        let endDate = filters.toDate
            ? moment(filters.toDate).endOf("day").toDate()
            : moment(now).endOf("day").toDate();
        //   const startDate = moment(filters.fromDate).startOf("day").toDate(); // 00:00:00
        //   const endDate = moment(filters.toDate).endOf("day").toDate();       // 23:59:59.999

        // ✅ Validate date range
        if (startDate > endDate) {
            throw new Error("From date cannot be greater than to date");
        }
        return {
            ...filters,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            //   startDate: startDate.toISOString(),
            //   endDate: endDate.toISOString(),
            groupBy: filters.groupBy || ["stockCode"],
            groupByRange: {
                stockCode: filters.groupByRange?.stockCode || [],
                categoryCode: filters.groupByRange?.categoryCode || [],
                karat: filters.groupByRange?.karat || [],
                type: filters.groupByRange?.type || [],
                size: filters.groupByRange?.size || [],
                color: filters.groupByRange?.color || [],
                brand: filters.groupByRange?.brand || [],
            },
        };
    }


    buildSalesAnalysisPurchase() {
        const pipeline = [];

        // Step 1: Base match condition
        const now = new Date();
        const currentYear = now.getFullYear();

        // If current month is Jan/Feb/Mar, financial year started last year
        const financialYearStart = new Date(
            now.getMonth() < 3 ? currentYear - 1 : currentYear,
            3, // April is month 3 (0-indexed)
            1,
            0, 0, 0, 0
        );

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const matchConditions = {
            isActive: true,
            transactionDate: {
                $gte: financialYearStart,
                $lte: todayEnd,
            },
        };


        // Step 4: Include documents where metalTransactionId exists
        matchConditions.metalTransactionId = { $exists: true, $ne: null };

        // Step 5: Apply the initial match
        pipeline.push({ $match: matchConditions });

        // Step 6: Group by reference to select the first record
        pipeline.push({
            $group: {
                _id: "$reference",
                transactionId: { $first: "$transactionId" },
                metalTransactionId: { $first: "$metalTransactionId" },
                description: { $first: "$description" },
                transactionDate: { $first: "$transactionDate" },
            },
        });

        // Step 7: Project to restore fields for lookup
        pipeline.push({
            $project: {
                _id: 0,
                transactionId: 1,
                metalTransactionId: 1,
                reference: "$_id",
                description: 1,
                transactionDate: 1,
            },
        });

        // Step 8: Lookup metalTransaction data
        pipeline.push({
            $lookup: {
                from: "metaltransactions",
                localField: "metalTransactionId",
                foreignField: "_id",
                as: "metaltransactions",
            },
        });

        // Step 9: Unwind metaltransactions
        pipeline.push({
            $unwind: {
                path: "$metaltransactions",
                preserveNullAndEmptyArrays: false, // Only keep documents with valid metaltransactions
            },
        });

        // Step 10: Filter for purchase transactions only
        pipeline.push({
            $match: {
                "metaltransactions.transactionType": { $in: ["purchase", "saleReturn"] },
            },
        });

        // Step 11: Unwind stockItems from metaltransactions
        pipeline.push({
            $unwind: {
                path: "$metaltransactions.stockItems",
                preserveNullAndEmptyArrays: false, // Only keep documents with valid stockItems
            },
        });

        // Step 12: Lookup metalstocks for stock details
        pipeline.push({
            $lookup: {
                from: "metalstocks",
                localField: "metaltransactions.stockItems.stockCode",
                foreignField: "_id",
                as: "metaldetail",
            },
        });

        // Step 13: Unwind metaldetail
        pipeline.push({
            $unwind: {
                path: "$metaldetail",
                preserveNullAndEmptyArrays: true,
            },
        });

        // Step 14: Lookup karat details
        pipeline.push({
            $lookup: {
                from: "karatmasters",
                localField: "metaldetail.karat",
                foreignField: "_id",
                as: "karatDetails",
            },
        });

        // Step 15: Unwind karatDetails
        pipeline.push({
            $unwind: {
                path: "$karatDetails",
                preserveNullAndEmptyArrays: true,
            },
        });

        // Step 16: Lookup metal rate details
        pipeline.push({
            $lookup: {
                from: "metalratemasters",
                localField: "metaltransactions.stockItems.metalRate",
                foreignField: "_id",
                as: "metalRate",
            },
        });

        // Step 17: Unwind metalRate
        pipeline.push({
            $unwind: {
                path: "$metalRate",
                preserveNullAndEmptyArrays: true,
            },
        });

        // Step 18: Project the required fields
        pipeline.push({
            $project: {
                stockCode: "$metaltransactions.stockItems.stockCode",
                description: "$metaltransactions.stockItems.description",
                pcs: { $ifNull: ["$metaltransactions.stockItems.pieces", 0] },
                grossWeight: { $ifNull: ["$metaltransactions.stockItems.grossWeight", 0] },
                premium: { $ifNull: ["$metaltransactions.stockItems.premium.amount", 0] },
                makingCharge: { $ifNull: ["$metaltransactions.stockItems.makingCharges.amount", 0] },
                discount: { $literal: 0 }, // Explicitly set to 0
                purity: { $ifNull: ["$metaltransactions.stockItems.purity", 0] },
                pureWeight: { $ifNull: ["$metaltransactions.stockItems.pureWeight", 0] },
                totalAmount: {
                    $ifNull: ["$metaltransactions.totalAmountSession.totalAmountAED", 0],
                },
                metalValue: { $ifNull: ["$metaltransactions.stockItems.metalRateRequirements.rate", 0] },
                _id: 0,
            },
        });

        // Step 19: Group by stockCode to consolidate transactions
        pipeline.push({
            $group: {
                _id: "$stockCode",
                description: { $first: "$description" }, // Take the first description
                pcs: { $sum: "$pcs" }, // Sum pieces
                grossWeight: { $sum: "$grossWeight" }, // Sum gross weight
                premium: { $sum: "$premium" }, // Sum premium
                makingCharge: { $sum: "$makingCharge" }, // Sum making charges
                discount: { $sum: "$discount" }, // Sum discount
                purity: { $first: "$purity" }, // Take the first purity
                pureWeight: { $sum: "$pureWeight" }, // Sum pure weight
                metalValue: { $sum: "$metalValue" }, // Sum metal value
                totalAmount: { $sum: "$totalAmount" }, // Sum total amount
            },
        });

        // Step 20: Project to format the transactions array
        pipeline.push({
            $project: {
                _id: 0,
                stockCode: "$_id", // Use the grouped _id as stockCode
                description: 1,
                pcs: 1,
                grossWeight: 1,
                premium: 1,
                makingCharge: 1,
                discount: 1,
                purity: 1,
                pureWeight: 1,
                metalValue: 1,
                total: "$totalAmount",
            },
        });

        // Step 21: Group to calculate totals and collect transactions
        pipeline.push({
            $group: {
                _id: null,
                transactions: {
                    $push: {
                        stockCode: "$stockCode",
                        description: "$description",
                        pcs: "$pcs",
                        grossWeight: "$grossWeight",
                        premium: "$premium",
                        discount: "$discount",
                        purity: "$purity",
                        pureWeight: "$pureWeight",
                        metalValue: "$metalValue",
                        makingCharge: "$makingCharge",
                        total: "$total",
                    },
                },
                totalPcs: { $sum: "$pcs" },
                totalGrossWeight: { $sum: "$grossWeight" },
                totalPremium: { $sum: "$premium" },
                totalDiscount: { $sum: "$discount" },
                totalPureWeight: { $sum: "$pureWeight" },
                totalMetalValue: { $sum: "$metalValue" },
                totalMakingCharge: { $sum: "$makingCharge" },
            },
        });

        // Step 22: Project the final output
        pipeline.push({
            $project: {
                _id: 0,
                transactions: 1,
                totals: {
                    totalPcs: "$totalPcs",
                    totalGrossWeight: "$totalGrossWeight",
                    totalPremium: "$totalPremium",
                    totalDiscount: "$totalDiscount",
                    totalPureWeight: "$totalPureWeight",
                    totalMetalValue: "$totalMetalValue",
                    totalMakingCharge: "$totalMakingCharge",
                },
            },
        });

        return pipeline;
    }

    calculateSalesAnalysis(salesReport, purchaseReport) {
        const salesTransactions = salesReport[0]?.transactions || [];
        const purchaseTransactions = purchaseReport[0]?.transactions || [];

        const purchaseMap = new Map();
        purchaseTransactions.forEach(p => {
            const stockCodeStr = p.stockCode.toString();
            if (!purchaseMap.has(stockCodeStr)) {
                purchaseMap.set(stockCodeStr, {
                    makingCharge: p.makingCharge || 0,
                    grossWeight: p.grossWeight || 0,
                    total: p.total || 0,
                });
            } else {
                // Sum if duplicate stockCodes (edge case)
                const existing = purchaseMap.get(stockCodeStr);
                purchaseMap.set(stockCodeStr, {
                    makingCharge: existing.makingCharge + (p.makingCharge || 0),
                    grossWeight: existing.grossWeight + (p.grossWeight || 0),
                    total: existing.total + (p.total || 0),
                });
            }
        });

        const combinedTransactions = salesTransactions.map(sale => {
            const stockCodeStr = sale.stockCode.toString();
            const purchase = purchaseMap.get(stockCodeStr) || {
                makingCharge: 0,
                grossWeight: 0,
                total: 0,
            };

            const saleGrossWeight = sale.grossWeight || 0;
            const saleMakingCharge = sale.makingCharge || 0;
            const purchaseGrossWeight = purchase.grossWeight || 0;
            const purchaseMakingCharge = purchase.makingCharge || 0;

            const avgPurchaseMakingCharge = purchaseGrossWeight > 0 ? purchaseMakingCharge / purchaseGrossWeight : 0;
            const avgSaleMakingCharge = saleGrossWeight > 0 ? saleMakingCharge / saleGrossWeight : 0;

            const cost = avgPurchaseMakingCharge * saleGrossWeight;
            const profitMakingRate = avgSaleMakingCharge - avgPurchaseMakingCharge;
            const profitMakingAmount = saleMakingCharge - cost; // Fixed: Use calculated cost, not direct subtract (more accurate for avg)

            return {
                id: sale.stockCode,
                stockCode: sale.code,
                description: sale.description,
                pcs: sale.pcs || 0,
                grossWeight: saleGrossWeight,
                saleMakingCharge,
                purchaseMakingCharge,
                avgPurchaseMakingCharge,
                avgSaleMakingCharge,
                cost,
                profitMakingRate,
                profitMakingAmount,
                totalSale: sale.total || 0,
                totalPurchase: purchase.total || 0,
                profit: (sale.total || 0) - (purchase.total || 0),
            };
        });

        const totals = {
            totalPcs: combinedTransactions.reduce((sum, t) => sum + t.pcs, 0),
            totalGrossWeight: combinedTransactions.reduce((sum, t) => sum + t.grossWeight, 0),
            totalMakingCharge: combinedTransactions.reduce((sum, t) => sum + t.saleMakingCharge, 0),
            totalCost: combinedTransactions.reduce((sum, t) => sum + t.cost, 0),
            totalProfitMakingAmount: combinedTransactions.reduce((sum, t) => sum + t.profitMakingAmount, 0),
            totalProfit: combinedTransactions.reduce((sum, t) => sum + t.profit, 0),
        };

        return {
            transactions: combinedTransactions,
            totals,
        };
    }



    buildSalesAnalysis(filters) {

        const pipeline = [];
        const referenceRegex = [];


        if (filters.voucher && Array.isArray(filters.voucher) && filters.voucher.length > 0) {
            filters.voucher.forEach(({ prefix }) => {
                const pattern = /^[A-Z]+$/.test(prefix) ? `^${prefix}` : `^${prefix}\\d+`;
                referenceRegex.push({ reference: { $regex: pattern, $options: "i" } });
            });
        }
        const matchConditions = {
            isActive: true,
            $or: [
                ...referenceRegex,
                { reference: { $exists: false } },
            ],
        };


        // Step 2: Add date filters (optional startDate and endDate)
        if (filters.startDate || filters.endDate) {
            matchConditions.transactionDate = {};
            if (filters.startDate) {
                matchConditions.transactionDate.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                matchConditions.transactionDate.$lte = new Date(filters.endDate);
            }
        }


        // Step 4: Include documents where metalTransactionId exists
        matchConditions.metalTransactionId = { $exists: true, $ne: null };

        // Step 5: Apply the initial match
        pipeline.push({ $match: matchConditions });

        // Step 6: Group by reference to select the first record
        pipeline.push({
            $group: {
                _id: "$reference",
                transactionId: { $first: "$transactionId" },
                metalTransactionId: { $first: "$metalTransactionId" },
                description: { $first: "$description" },
                transactionDate: { $first: "$transactionDate" },
            },
        });

        // Step 7: Project to restore fields for lookup
        pipeline.push({
            $project: {
                _id: 0,
                transactionId: 1,
                metalTransactionId: 1,
                reference: "$_id",
                description: 1,
                transactionDate: 1,
            },
        });

        // Step 8: Lookup metalTransaction data
        pipeline.push({
            $lookup: {
                from: "metaltransactions",
                localField: "metalTransactionId",
                foreignField: "_id",
                as: "metaltransactions",
            },
        });

        // Step 9: Unwind metaltransactions
        pipeline.push({
            $unwind: {
                path: "$metaltransactions",
                preserveNullAndEmptyArrays: false, // Only keep documents with valid metaltransactions
            },
        });

        // Step 10: Filter for sales transactions only
        pipeline.push({
            $match: {
                "metaltransactions.transactionType": { $in: ["sale", "purchaseReturn"] },
            },
        });

        // Step 11: Unwind stockItems from metaltransactions
        pipeline.push({
            $unwind: {
                path: "$metaltransactions.stockItems",
                preserveNullAndEmptyArrays: false, // Only keep documents with valid stockItems
            },
        });

        // Step 12: Lookup metalstocks for stock details
        pipeline.push({
            $lookup: {
                from: "metalstocks",
                localField: "metaltransactions.stockItems.stockCode",
                foreignField: "_id",
                as: "metaldetail",
            },
        });
        if (filters.groupByRange?.stockCode?.length > 0) {
            pipeline.push({
                $match: {
                    "metaldetail._id": {
                        $in: filters.groupByRange.stockCode.map(id => new ObjectId(id)),
                    },
                },
            });
        }

        // Step 13: Unwind metaldetail
        pipeline.push({
            $unwind: {
                path: "$metaldetail",
                preserveNullAndEmptyArrays: true,
            },
        });

        // Step 14: Lookup karat details
        pipeline.push({
            $lookup: {
                from: "karatmasters",
                localField: "metaldetail.karat",
                foreignField: "_id",
                as: "karatDetails",
            },
        });

        // Step 15: Unwind karatDetails
        pipeline.push({
            $unwind: {
                path: "$karatDetails",
                preserveNullAndEmptyArrays: true,
            },
        });

        // Step 16: Lookup metal rate details
        pipeline.push({
            $lookup: {
                from: "metalratemasters",
                localField: "metaltransactions.stockItems.metalRate",
                foreignField: "_id",
                as: "metalRate",
            },
        });

        // Step 17: Unwind metalRate
        pipeline.push({
            $unwind: {
                path: "$metalRate",
                preserveNullAndEmptyArrays: true,
            },
        });


        // Step 18: Project the required fields
        pipeline.push({
            $project: {
                stockCode: "$metaltransactions.stockItems.stockCode",
                code: "$metaldetail.code",
                description: "$metaltransactions.stockItems.description",
                pcs: { $ifNull: ["$metaltransactions.stockItems.pieces", 0] },
                grossWeight: { $ifNull: ["$metaltransactions.stockItems.grossWeight", 0] },
                premium: { $ifNull: ["$metaltransactions.stockItems.premium.amount", 0] },
                makingCharge: { $ifNull: ["$metaltransactions.stockItems.makingCharges.amount", 0] },
                discount: { $literal: 0 }, // Explicitly set to 0
                purity: { $ifNull: ["$metaltransactions.stockItems.purity", 0] },
                pureWeight: { $ifNull: ["$metaltransactions.stockItems.pureWeight", 0] },
                totalAmount: {
                    $ifNull: ["$metaltransactions.totalAmountSession.totalAmountAED", 0],
                },
                metalValue: { $ifNull: ["$metaltransactions.stockItems.metalRateRequirements.rate", 0] },
                _id: 0,
            },
        });

        // Step 19: Group by stockCode to consolidate transactions
        pipeline.push({
            $group: {
                _id: "$stockCode",
                description: { $first: "$description" }, // Take the first description
                code: { $first: "$code" }, // Take the first description
                pcs: { $sum: "$pcs" }, // Sum pieces
                grossWeight: { $sum: "$grossWeight" }, // Sum gross weight
                premium: { $sum: "$premium" }, // Sum premium
                makingCharge: { $sum: "$makingCharge" }, // Sum making charges
                discount: { $sum: "$discount" }, // Sum discount
                purity: { $first: "$purity" }, // Take the first purity
                pureWeight: { $sum: "$pureWeight" }, // Sum pure weight
                metalValue: { $sum: "$metalValue" }, // Sum metal value
                totalAmount: { $sum: "$totalAmount" }, // Sum total amount
            },
        });

        // Step 20: Project to format the transactions array
        pipeline.push({
            $project: {
                _id: 0,
                stockCode: "$_id", // Use the grouped _id as stockCode
                description: 1,
                code: 1,
                pcs: 1,
                grossWeight: 1,
                premium: 1,
                makingCharge: 1,
                discount: 1,
                purity: 1,
                pureWeight: 1,
                metalValue: 1,
                total: "$totalAmount",
            },
        });

        // Step 21: Group to calculate totals and collect transactions
        pipeline.push({
            $group: {
                _id: null,
                transactions: {
                    $push: {
                        stockCode: "$stockCode",
                        description: "$description",
                        code: "$code",
                        pcs: "$pcs",
                        grossWeight: "$grossWeight",
                        premium: "$premium",
                        discount: "$discount",
                        purity: "$purity",
                        pureWeight: "$pureWeight",
                        metalValue: "$metalValue",
                        makingCharge: "$makingCharge",
                        total: "$total",
                    },
                },
                totalPcs: { $sum: "$pcs" },
                totalGrossWeight: { $sum: "$grossWeight" },
                totalPremium: { $sum: "$premium" },
                totalDiscount: { $sum: "$discount" },
                totalPureWeight: { $sum: "$pureWeight" },
                totalMetalValue: { $sum: "$metalValue" },
                totalMakingCharge: { $sum: "$makingCharge" },
            },
        });

        // Step 22: Project the final output
        pipeline.push({
            $project: {
                _id: 0,
                transactions: 1,
                totals: {
                    totalPcs: "$totalPcs",
                    totalGrossWeight: "$totalGrossWeight",
                    totalPremium: "$totalPremium",
                    totalDiscount: "$totalDiscount",
                    totalPureWeight: "$totalPureWeight",
                    totalMetalValue: "$totalMetalValue",
                    totalMakingCharge: "$totalMakingCharge",
                },
            },
        });

        return pipeline;
    }

    /**
     * Fetches fixing registry data
     * @param {Object} filters - Validated filters
     * @returns {Array} Fixing registry data
     */
    async getFixingRegistry(filters) {
        const matchConditions = {
            type: { $in: ["purchase-fixing", "sales-fixing"] },
        };

        if (filters.startDate || filters.endDate) {
            matchConditions.transactionDate = {};
            if (filters.startDate) {
                matchConditions.transactionDate.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                matchConditions.transactionDate.$lte = new Date(filters.endDate);
            }
        }

        const pipeline = [
            { $match: matchConditions },
            {
                $lookup: {
                    from: "accounts",
                    localField: "party",
                    foreignField: "_id",
                    as: "partyDetails",
                },
            },
            { $unwind: { path: "$partyDetails", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    voucher: "$reference",
                    date: { $dateToString: { format: "%d/%m/%Y", date: "$transactionDate" } },
                    partyName: "$partyDetails.customerName",
                    stockIn: "$goldCredit",
                    stockOut: "$goldDebit",
                    balance: {
                        $subtract: ["$runningBalance", { $add: ["$goldDebit", { $ifNull: ["$goldCredit", 0] }] }],
                    },
                    rate: "$goldBidValue",
                    value: {
                        $multiply: ["$goldBidValue", { $subtract: ["$goldCredit", "$goldDebit"] }],
                    },
                },
            },
            { $sort: { date: -1 } },
        ];

        return await Registry.aggregate(pipeline);
    }

    /**
     * Fetches own stock data
     * @param {Object} filters - Validated filters
     * @returns {Object} Own stock summary and categories
     */
    //   async getOwnStock(filters) {
    //     const stockPipeline = [
    //       {
    //         $match: {
    //           isActive: true,
    //           type: { $in: ["purchase-fixing", "sale-fixing", "sales-fixing"] },
    //           ...(filters.startDate || filters.endDate
    //             ? {
    //                 transactionDate: {
    //                   ...(filters.startDate && { $gte: new Date(filters.startDate) }),
    //                   ...(filters.endDate && { $lte: new Date(filters.endDate) }),
    //                 },
    //               }
    //             : {}),
    //         },
    //       },
    //       {
    //         $group: {
    //           _id: "$type",
    //           totalGrossWeight: { $sum: "$grossWeight" },
    //           totalValue: { $sum: "$value" },
    //           transactionCount: { $sum: 1 },
    //           latestTransactionDate: { $max: "$transactionDate" },
    //         },
    //       },
    //       {
    //         $project: {
    //           _id: 0,
    //           category: "$_id",
    //           description: {
    //             $switch: {
    //               branches: [
    //                 { case: { $eq: ["$_id", "purchase-fixing"] }, then: "Purchase Fixing" },
    //                 { case: { $eq: ["$_id", "sale-fixing"] }, then: "Sale Fixing" },
    //                 { case: { $eq: ["$_id", "sales-fixing"] }, then: "Sales Fixing" },
    //               ],
    //               default: "Unknown Category",
    //             },
    //           },
    //           totalGrossWeight: 1,
    //           totalValue: 1,
    //           transactionCount: 1,
    //           latestTransactionDate: 1,
    //           avgGrossWeight: {
    //             $cond: {
    //               if: { $eq: ["$transactionCount", 0] },
    //               then: 0,
    //               else: { $divide: ["$totalGrossWeight", "$transactionCount"] },
    //             },
    //           },
    //         },
    //       },
    //       { $sort: { category: 1 } },
    //     ];

    //     const receivablesPayablesPipeline = [
    //       {
    //         $facet: {
    //           receivables: [
    //             { $match: { "balances.goldBalance.totalGrams": { $lt: 0 } } },
    //             {
    //               $group: {
    //                 _id: null,
    //                 totalReceivableGrams: { $sum: { $abs: "$balances.goldBalance.totalGrams" } },
    //               },
    //             },
    //           ],
    //           payables: [
    //             { $match: { "balances.goldBalance.totalGrams": { $gt: 0 } } },
    //             {
    //               $group: {
    //                 _id: null,
    //                 totalPayableGrams: { $sum: "$balances.goldBalance.totalGrams" },
    //               },
    //             },
    //           ],
    //         },
    //       },
    //       {
    //         $project: {
    //           totalReceivableGrams: { $arrayElemAt: ["$receivables.totalReceivableGrams", 0] },
    //           totalPayableGrams: { $arrayElemAt: ["$payables.totalPayableGrams", 0] },
    //         },
    //       },
    //     ];

    //     const [stockData, receivablesPayables] = await Promise.all([
    //       Registry.aggregate(stockPipeline),
    //       Account.aggregate(receivablesPayablesPipeline),
    //     ]);

    //     const summary = {
    //       totalGrossWeight: stockData.reduce((sum, item) => sum + (item.totalGrossWeight || 0), 0),
    //       totalValue: stockData.reduce((sum, item) => sum + (item.totalValue || 0), 0),
    //       totalReceivableGrams: receivablesPayables[0]?.totalReceivableGrams || 0,
    //       totalPayableGrams: receivablesPayables[0]?.totalPayableGrams || 0,
    //     };

    //     return {
    //       summary,
    //       categories: stockData,
    //     };
    //   }

    async getOwnStock(filters) {
        try {
            // 1. Validate and normalize filters
            filters.voucher = [
                { voucherType: 'PURCHASE-RETURN', prefix: 'PR' },
                { voucherType: 'MP', prefix: 'MP' },
                { voucherType: 'METAL-RECEIPT', prefix: 'MR' },
                { voucherType: 'METAL-SALE', prefix: 'SAL' },
                { voucherType: 'OPENING-STOCK-BALANCE', prefix: 'OSB' },
                { voucherType: 'METAL-STOCK', prefix: 'MS' },
                { voucherType: 'OPENING-BALANCE', prefix: 'OB' },
                { voucherType: 'TRANSFER', prefix: 'T' },
                { voucherType: 'CURRENCY-RECEIPT', prefix: 'CR' },
                { voucherType: 'SALES-FIXING', prefix: 'SF' },
                { voucherType: 'SALES-RETURN', prefix: 'SR' },
                { voucherType: 'METAL-PURCHASE', prefix: 'PRM' },
                { voucherType: 'CURRENCY-PAYMENT', prefix: 'CP' },
                { voucherType: 'PURCHASE-FIXING', prefix: 'PF' }
            ]
            const validatedFilters = this.validateFilters(filters);
            // 2. Construct aggregation pipelines
            const stockPipeline = this.OwnStockPipeLine(validatedFilters);
            const receivablesPayablesPipeline = this.getReceivablesAndPayables();

            // 3. Run both aggregations in parallel

            const reportData = await Registry.aggregate(stockPipeline)
            const receivablesAndPayables = await Account.aggregate(receivablesPayablesPipeline)

            const finilized = this.formatedOwnStock(reportData, receivablesAndPayables)

            // 5. Return structured response
            return {
                success: true,
                data: finilized,
            };

        } catch (error) {
            console.error("Error generating stock report:", error);
            throw new Error(
                `Failed to generate metal stock ledger report: ${error.message}`
            );
        }
    }

    formatedOwnStock(reportData, receivablesAndPayables) {
        const summary = {
            totalGrossWeight: 0,
            netGrossWeight: 0,
            totalValue: 0,
            totalReceivableGrams: 0,
            totalPayableGrams: 0,
            avgGrossWeight: 0,
            avgReceivableGrams: 0,
            avgPayableGrams: 0,
            avgBidValue: 0
        };

        // Extract receivable/payable safely
        if (receivablesAndPayables?.length) {
            summary.totalReceivableGrams = receivablesAndPayables[0].totalReceivableGrams || 0;
            summary.totalPayableGrams = receivablesAndPayables[0].totalPayableGrams || 0;
            summary.avgReceivableGrams = receivablesAndPayables[0].avgReceivableGrams || 0;
            summary.avgPayableGrams = receivablesAndPayables[0].avgPayableGrams || 0;
        }

        const categories = reportData.map((item) => {
            summary.totalGrossWeight += item.totalGrossWeight || 0;
            summary.netGrossWeight += item.netGrossWeight || 0;
            summary.totalValue += item.totalValue || 0;

            return {
                category: item.category,
                description: item.description,
                transactionCount: item.transactionCount,
                totalValue: item.totalValue,
                avgGrossWeight: item.avgGrossWeight,
                totalGrossWeight: item.totalGrossWeight,
                avgBidValue: item.avgBidValue,
                netGrossWeight: item.netGrossWeight,
                latestTransactionDate: item.latestTransactionDate,
            };
        });

        return {
            summary,
            categories
        };
    }
    OwnStockPipeLine(filters) {
        const pipeline = [];
        const referenceRegex = [];

        if (filters.voucher && Array.isArray(filters.voucher) && filters.voucher.length > 0) {
            filters.voucher.forEach(({ prefix }) => {
                const pattern = /^[A-Z]+$/.test(prefix) ? `^${prefix}` : `^${prefix}\\d+`;
                referenceRegex.push({ reference: { $regex: pattern, $options: "i" } });
            });
        }

        /* ------------------------------------------
           Step 2: Build match conditions
        ------------------------------------------ */
        const matchConditions = {
            isActive: true,
            type: { $in: ["purchase-fixing", "sale-fixing", "sales-fixing"] },
            $or: [
                ...referenceRegex,
                { reference: { $exists: false } },
            ],
        };

        // Step 3: Date filtering (optional, based on filters)
        if (filters.startDate || filters.endDate) {
            matchConditions.transactionDate = {};
            if (filters.startDate) {
                matchConditions.transactionDate.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                matchConditions.transactionDate.$lte = new Date(filters.endDate);
            }
        }

        // Step 4: Push $match to pipeline
        pipeline.push({ $match: matchConditions });


        /* ------------------------------------------
           Step 5: Lookup related collections
        ------------------------------------------ */
        pipeline.push({
            $lookup: {
                from: "metaltransactions",
                localField: "metalTransactionId",
                foreignField: "_id",
                as: "metaltransactions",
            },
        });
        pipeline.push({
            $unwind: {
                path: "$metaltransactions",
                preserveNullAndEmptyArrays: true,
            },
        });

        // pipeline.push({
        //   $unwind: {
        //     path: "$metaltransactions.stockItems",
        //     preserveNullAndEmptyArrays: true,
        //   },
        // });

        pipeline.push({
            $lookup: {
                from: "transactionfixings",
                localField: "fixingTransactionId",
                foreignField: "_id",
                as: "transactionfixings",
            },
        });

        pipeline.push({
            $lookup: {
                from: "entries",
                localField: "EntryTransactionId",
                foreignField: "_id",
                as: "entries",
            },
        });

        pipeline.push({
            $lookup: {
                from: "metalstocks",
                localField: "metalId",
                foreignField: "_id",
                as: "metalstocks",
            },
        });

        /* ------------------------------------------
           Step 6: Unwind joined data (safe unwind)
        ------------------------------------------ */

        pipeline.push({
            $unwind: { path: "$transactionfixings", preserveNullAndEmptyArrays: true },
        });
        pipeline.push({
            $unwind: { path: "$entries", preserveNullAndEmptyArrays: true },
        });
        pipeline.push({
            $unwind: { path: "$metalstocks", preserveNullAndEmptyArrays: true },
        });


        /* ------------------------------------------
           Step 7: Sort by transactionDate to ensure consistent $first selection
        ------------------------------------------ */
        pipeline.push({ $sort: { transactionDate: 1 } });

        // pipeline.push({
        //   $unwind: {
        //     path: "$metaltransactions.stockItems",
        //     preserveNullAndEmptyArrays: true
        //   }
        // });
        // pipeline.push({
        //   $unwind: {
        //     path: "$transactionfixings.orders",
        //     preserveNullAndEmptyArrays: true
        //   }
        // });

        // return pipeline


        /* ------------------------------------------
           Step 8: First Group by full reference to take first value per unique voucher
        ------------------------------------------ */
        pipeline.push({
            $group: {
                _id: "$reference",
                totalValue: { $first: { $ifNull: ["$value", 0] } },
                totalGrossWeight: { $sum: { $ifNull: ["$grossWeight", 0] } },
                totalbidvalue: { $first: { $ifNull: ["$goldBidValue", 0] } },
                totalDebit: { $first: { $ifNull: ["$debit", 0] } },
                totalCredit: { $first: { $ifNull: ["$credit", 0] } },
                latestTransactionDate: { $max: "$transactionDate" },
            },
        });

        /* ------------------------------------------
           Step 9: Second Group by prefix to sum across unique vouchers
        ------------------------------------------ */
        const dynamicSwitchBranches = (filters.voucher || []).map(({ prefix }) => ({
            case: {
                $regexMatch: {
                    input: { $ifNull: ["$_id", ""] },
                    regex: new RegExp(`^${prefix}\\d+`, "i"),
                },
            },
            then: prefix,
        }));

        pipeline.push({
            $group: {
                _id: {
                    $let: {
                        vars: {
                            prefix: {
                                $switch: {
                                    branches: dynamicSwitchBranches,
                                    default: "UNKNOWN",
                                },
                            },
                        },
                        in: "$$prefix",
                    },
                },
                totalValue: { $sum: "$totalValue" },
                totalGrossWeight: { $sum: "$totalGrossWeight" },
                totalbidvalue: { $sum: "$totalbidvalue" },
                totalDebit: { $sum: "$totalDebit" },
                totalCredit: { $sum: "$totalCredit" },
                transactionCount: { $sum: 1 },
                latestTransactionDate: { $max: "$latestTransactionDate" },
            },
        });

        /* ------------------------------------------
           Step 10: Project to format the output with average
        ------------------------------------------ */
        const descriptionSwitchBranches = (filters.voucher || []).map(({ prefix, voucherType }) => ({
            case: { $eq: ["$_id", prefix] },
            then: voucherType.replace(/[-_]/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()),
        }));

        pipeline.push({
            $project: {
                _id: 0,
                category: "$_id",
                description: {
                    $switch: {
                        branches: descriptionSwitchBranches,
                        default: "Unknown Category",
                    },
                },
                totalValue: 1,
                netGrossWeight: { $subtract: ["$totalDebit", "$totalCredit"] },
                totalGrossWeight: 1,
                avgGrossWeight: {
                    $cond: {
                        if: { $eq: ["$transactionCount", 0] },
                        then: 0,
                        else: { $divide: ["$totalGrossWeight", "$transactionCount"] },
                    },
                },
                avgBidValue: {
                    $cond: {
                        if: { $eq: ["$transactionCount", 0] },
                        then: 0,
                        else: { $divide: ["$totalbidvalue", "$transactionCount"] },
                    },
                },
                transactionCount: 1,
                latestTransactionDate: 1,
            },
        });

        /* ------------------------------------------
           Step 11: Sort by category
        ------------------------------------------ */
        pipeline.push({
            $sort: { category: 1 },
        });

        return pipeline;
    }

    getReceivablesAndPayables() {
        const pipeline = [
            {
                $facet: {
                    receivables: [
                        {
                            $match: {
                                "balances.goldBalance.totalGrams": { $lt: 0 }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalReceivableGrams: {
                                    $sum: { $abs: "$balances.goldBalance.totalGrams" }
                                },
                                accountCount: { $sum: 1 } // Count number of accounts
                            }
                        }
                    ],
                    payables: [
                        {
                            $match: {
                                "balances.goldBalance.totalGrams": { $gt: 0 }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalPayableGrams: {
                                    $sum: "$balances.goldBalance.totalGrams"
                                },
                                accountCount: { $sum: 1 } // Count number of accounts
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    totalReceivableGrams: {
                        $ifNull: [{ $arrayElemAt: ["$receivables.totalReceivableGrams", 0] }, 0]
                    },
                    totalPayableGrams: {
                        $ifNull: [{ $arrayElemAt: ["$payables.totalPayableGrams", 0] }, 0]
                    },
                    avgReceivableGrams: {
                        $cond: {
                            if: {
                                $eq: [{ $arrayElemAt: ["$receivables.accountCount", 0] }, 0]
                            },
                            then: 0,
                            else: {
                                $divide: [
                                    { $ifNull: [{ $arrayElemAt: ["$receivables.totalReceivableGrams", 0] }, 0] },
                                    { $ifNull: [{ $arrayElemAt: ["$receivables.accountCount", 0] }, 1] }
                                ]
                            }
                        }
                    },
                    avgPayableGrams: {
                        $cond: {
                            if: {
                                $eq: [{ $arrayElemAt: ["$payables.accountCount", 0] }, 0]
                            },
                            then: 0,
                            else: {
                                $divide: [
                                    { $ifNull: [{ $arrayElemAt: ["$payables.totalPayableGrams", 0] }, 0] },
                                    { $ifNull: [{ $arrayElemAt: ["$payables.accountCount", 0] }, 1] }
                                ]
                            }
                        }
                    }
                }
            }
        ];

        return pipeline;
    }
}