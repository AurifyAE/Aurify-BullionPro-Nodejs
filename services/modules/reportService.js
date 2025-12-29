  import mongoose from "mongoose";
import Registry from "../../models/modules/Registry.js";
import MetalTransaction from "../../models/modules/MetalTransaction.js";
import FixingPrice from "../../models/modules/FixingPrice.js";
import TransactionFixing from "../../models/modules/TransactionFixing.js";
import Branch from "../../models/modules/BranchMaster.js";

import moment from "moment";
import { log } from "console";
import util from "util";
import Inventory from "../../models/modules/inventory.js";
import Account from "../../models/modules/AccountType.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import AccountMode from "../../models/modules/AccountMode.js";
import OpeningBalance from "../../models/modules/OpeningBalance.js";
import MetalStock from "../../models/modules/MetalStock.js";
import { uaeDateToUTC, getPreviousDayEndInUTC, utcToUAEDate } from "../../utils/dateUtils.js";
const { ObjectId } = mongoose.Types;
// ReportService class to handle stock ledger and movement reports
export class ReportService {
  async getReportsData(filters) {

    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Construct MongoDB aggregation pipeline for InventoryLog
      const pipeline = this.buildInventoryLogStockLedgerPipeline(validatedFilters);

      // Execute aggregation query on InventoryLog
      const reportData = await InventoryLog.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatInventoryLogReportData(reportData, validatedFilters);

      return {
        success: true,
        data: formattedData.transactions,
        summary: formattedData.summary,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }

  // Shared constants for transaction type classification
  getAccountStatementTransactionTypes() {
    return {
      goldTypes: ["PARTY_GOLD_BALANCE"],
      cashTypes: [
        "PARTY_CASH_BALANCE",
        "PARTY_MAKING_CHARGES",
        "PARTY_PREMIUM",
        "PARTY_DISCOUNT",
        "PARTY_VAT_AMOUNT",
        "OTHER-CHARGE",
      ],
      // Combined types that have both cash and gold in a single entry
      // These transactions use cashDebit/cashCredit and goldDebit/goldCredit fields
      mixedTypes: [
        "PARTY_PURCHASE_FIX",
        "PARTY_SALE_FIX",
        "PARTY_HEDGE_ENTRY",
      ]
    };
  }

  /**
   * Fetch branch master settings
   * Uses branchId from filters or default from environment variable
   * @param {Object} filters - Filter object that may contain branchId
   * @returns {Object} Branch settings with metalDecimal, amountDecimal, goldOzConversion
   */
  async getBranchSettings(filters = {}) {
    try {
      let branchId = filters.branchId;
      
      // If no branchId in filters, use default from environment
      if (!branchId) {
        branchId = process.env.DEFAULT_BRANCH_ID || "690224d4dbda6f93e986e0ca";
      }

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(branchId)) {
        throw new Error(`Invalid branch ID: ${branchId}`);
      }

      const branch = await Branch.findById(branchId).lean();
      
      if (!branch) {
        throw new Error(`Branch not found with ID: ${branchId}`);
      }

      // Return branch settings with defaults if not set
      return {
        metalDecimal: branch.metalDecimal ?? 3,
        amountDecimal: branch.amountDecimal ?? 2,
        goldOzConversion: branch.goldOzConversion ?? 31.1035,
      };
    } catch (error) {
      console.error("Error fetching branch settings:", error);
      // Return default values if branch fetch fails
      return {
        metalDecimal: 3,
        amountDecimal: 2,
        goldOzConversion: 31.1035,
      };
    }
  }

  /**
   * Round metal value based on branch settings
   * @param {Number} value - Metal value to round
   * @param {Number} metalDecimal - Decimal places for metal (from branch settings)
   * @returns {Number} Rounded metal value
   */
  roundMetal(value, metalDecimal) {
    if (value == null || isNaN(value)) return 0;
    return Number(value.toFixed(metalDecimal));
  }

  /**
   * Round amount value based on branch settings
   * @param {Number} value - Amount value to round
   * @param {Number} amountDecimal - Decimal places for amount (from branch settings)
   * @returns {Number} Rounded amount value
   */
  roundAmount(value, amountDecimal) {
    if (value == null || isNaN(value)) return 0;
    return Number(value.toFixed(amountDecimal));
  }

  async getAccountStatementOpeningBalance(toDate, filters = {}) {
    try {
      if (!toDate) return null;

      // Calculate previous day end (end of the day before toDate) in UAE timezone
      // If toDate is Dec 21 (UAE time), calculate opening balance up to Dec 20 23:59:59.999 UAE time
      // toDate is treated as UAE local time, converted to UTC for MongoDB query
      const previousDayEnd = getPreviousDayEndInUTC(toDate);
      
      console.log('toDate (UAE local):', toDate);
      console.log('previousDayEnd (UTC for MongoDB):', previousDayEnd.toISOString());
      
      const pipeline = [
        {
          $match: {
            // Include all opening balances up to and including the end of previous day
            // If toDate is Dec 21, this gets all opening balances <= Dec 20 23:59:59.999
            voucherDate: { $lte: previousDayEnd }
          }
        },
        {
          $lookup: {
            from: "accounts",
            localField: "partyId",
            foreignField: "_id",
            as: "partyDetails"
          }
        },
        {
          $unwind: {
            path: "$partyDetails",
            preserveNullAndEmptyArrays: true
          }
        }
      ];

      // Apply voucher filter if provided
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          voucherCode: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        pipeline.push({ $match: { $or: regexFilters } });
      }

      // Apply account type filter if provided
      if (filters.accountType?.length > 0) {
        pipeline.push({
          $match: {
            "partyId": { $in: filters.accountType.map(id => new ObjectId(id)) },
          },
        });
      }

      pipeline.push({
        $addFields: {
          partyId: "$partyId",
          partyName: "$partyDetails.customerName"
        }
      });
      
      // Filter by assetCode based on baseCurrency and foreignCurrency settings
      // When baseCurrency is false and foreignCurrency is true, exclude AED transactions
      if (filters.baseCurrency === false && filters.foreignCurrency === true && filters.foreignCurrencySelected) {
        // Exclude AED assetCode transactions - only show foreign currency transactions
        // GOLD transactions (assetType="GOLD") should always be included
        pipeline.push({
          $match: {
            $or: [
              { assetType: "GOLD" }, // Always include gold transactions
              {
                $and: [
                  { assetType: "CASH" },
                  { assetCode: filters.foreignCurrencySelected }
                ]
              }
            ]
          }
        });
      }

      pipeline.push({
        $group: {
          _id: {
            partyId: "$partyId",
            partyName: "$partyName"
          },
          cashDebit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$assetType", "CASH"] },
                    { $eq: ["$transactionType", "debit"] }
                  ]
                },
                { $ifNull: ["$value", 0] },
                0
              ]
            }
          },
          cashCredit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$assetType", "CASH"] },
                    { $eq: ["$transactionType", "credit"] }
                  ]
                },
                { $ifNull: ["$value", 0] },
                0
              ]
            }
          },
          goldDebit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$assetType", "GOLD"] },
                    { $eq: ["$transactionType", "debit"] }
                  ]
                },
                { $ifNull: ["$value", 0] },
                0
              ]
            }
          },
          goldCredit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$assetType", "GOLD"] },
                    { $eq: ["$transactionType", "credit"] }
                  ]
                },
                { $ifNull: ["$value", 0] },
                0
              ]
            }
          }
        }
      });

      pipeline.push({
        $project: {
          _id: 0,
          partyId: "$_id.partyId",
          partyName: "$_id.partyName",
          cashBalance: { $subtract: ["$cashCredit", "$cashDebit"] },
          goldBalance: { $subtract: ["$goldCredit", "$goldDebit"] }
        }
      });

      const openingBalances = await OpeningBalance.aggregate(pipeline);
      
      // Format opening balances
      return openingBalances.map(party => ({
        partyId: party.partyId,
        partyName: party.partyName,
        cashBalance: party.cashBalance || 0,
        goldBalance: party.goldBalance || 0,
        cashBalanceType: (party.cashBalance || 0) >= 0 ? "CR" : "DR",
        goldBalanceType: (party.goldBalance || 0) >= 0 ? "CR" : "DR"
      }));
    } catch (error) {
      console.error("Error calculating opening balance:", error);
      return null;
    }
  }
  buildAccountStatementPipeline(filters) {
    // Use shared transaction type definitions to ensure consistency
    const { goldTypes, cashTypes, mixedTypes } = this.getAccountStatementTransactionTypes();
    const pipeline = [];

    // --- Step 1: Initial Filtering ---
    // IMPORTANT: Always include mixedTypes in the match conditions
    // Mixed types (PARTY_PURCHASE_FIX, PARTY_SALE_FIX, PARTY_HEDGE_ENTRY) must be included
    // as they contain both cash and gold components in a single transaction
    const matchConditions = {
      isActive: true,
      $or: [
        { type: { $in: goldTypes } },
        { type: { $in: cashTypes } },
        { type: { $in: mixedTypes } } // Always include mixed types
      ]
    };

    // Date filter - filters.startDate and filters.endDate are already in UTC (from validateFilters)
    // They were converted from UAE local time to UTC in validateFilters
    if (filters.startDate || filters.endDate) {
      matchConditions.transactionDate = {};
      if (filters.startDate) {
        matchConditions.transactionDate.$gte = filters.startDate;
      }
      if (filters.endDate) {
        matchConditions.transactionDate.$lte = filters.endDate;
      }
    }

    // Lookup to get party names from accounts collection
    pipeline.push({
      $lookup: {
        from: "accounts",
        localField: "party",
        foreignField: "_id",
        as: "partyDetails"
      }
    });

    // Unwind the partyDetails array to de-normalize
    pipeline.push({
      $unwind: {
        path: "$partyDetails",
        preserveNullAndEmptyArrays: true
      }
    });
    // Voucher prefix filter
    // Voucher prefix filter
    if (filters.voucher?.length > 0) {
      const regexFilters = filters.voucher.map((v) => ({
        reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
      }));
      pipeline.push({ $match: { $or: regexFilters } });
    }


    if (filters.accountType?.length > 0) {
      pipeline.push({
        $match: {
          "party": { $in: filters.accountType },
        },
      });
    }
    // Add party name and ID to the document
    pipeline.push({
      $addFields: {
        partyName: "$partyDetails.customerName",
        partyId: "$party",
        docDate: { $dateToString: { format: "%d/%m/%Y", date: "$transactionDate" } },
        docRef: "$reference",
        branch: "HO"
      }
    });

    // Party-wise filter (optional)
    if (filters.party) {
      matchConditions.party = filters.party;
    }

    // Always include mixed types in the match conditions
    // Mixed types contain both cash and gold components and must be included
    pipeline.push({ $match: matchConditions });
    
    // Filter by assetType based on baseCurrency and foreignCurrency settings
    // When baseCurrency is false and foreignCurrency is true, exclude AED assetType transactions
    // Frontend will show AED columns with foreign currency converted to AED
    if (filters.baseCurrency === false && filters.foreignCurrency === true && filters.foreignCurrencySelected) {
      // Exclude AED assetType transactions - only show foreign currency transactions
      // Mixed types are always included (they may have foreign currency in cashDebit/cashCredit)
      pipeline.push({
        $match: {
          $or: [
            // Include transactions with matching foreign currency assetType
            { assetType: filters.foreignCurrencySelected },
            // Always include mixed types (PARTY_PURCHASE_FIX, PARTY_SALE_FIX, PARTY_HEDGE_ENTRY)
            // They may have foreign currency in their cashDebit/cashCredit fields
            { type: { $in: mixedTypes } }
          ],
          // Exclude AED assetType (unless it's a mixed type)
          $and: [
            {
              $or: [
                { assetType: { $ne: "AED" } }, // Non-AED assetType
                { type: { $in: mixedTypes } } // Or mixed type (which we always include)
              ]
            }
          ]
        }
      });
    }

    // Sort by transactionDate (includes time) and reference (voucher) before grouping to ensure proper order
    // Sort by date/time first (ascending - oldest first), then by voucher reference
    // This ensures "first in first show" based on actual transaction time
    pipeline.push({
      $sort: { 
        transactionDate: 1, // 1 = ascending (oldest first) - includes time component
        reference: 1 // Then sort by voucher reference (ascending)
      }
    });

    // Group by party to list transactions
    pipeline.push({
      $group: {
        _id: {
          partyId: "$partyId",
          partyName: "$partyName"
        },
        transactions: {
          $push: {
            transactionDate: "$transactionDate", // Keep original date for sorting (includes time)
            docDate: "$docDate",
            docRef: "$docRef",
            branch: "$branch",
            particulars: "$description",
            transactionType: "$type", // Include transaction type to distinguish between transactions with same reference
            metalTransactionId: "$metalTransactionId", // For grouping PUM and HPM together
            transactionId: "$transactionId", // Alternative grouping key
            assetType: { $ifNull: ["$assetType", "AED"] },
            currencyRate: { $ifNull: ["$currencyRate", 1] },
            cash: {
              // For mixed types (PARTY_PURCHASE_FIX, PARTY_HEDGE_ENTRY), use cashDebit/cashCredit fields
              // For cash-only types, use debit/credit fields
              debit: {
                $cond: [
                  { $in: ["$type", mixedTypes] },
                  { $ifNull: ["$cashDebit", 0] }, // Mixed types: use cashDebit
                  {
                    $cond: [
                      { $in: ["$type", cashTypes] },
                      { $ifNull: ["$debit", 0] }, // Cash types: use debit
                      0
                    ]
                  }
                ]
              },
              credit: {
                $cond: [
                  { $in: ["$type", mixedTypes] },
                  { $ifNull: ["$cashCredit", 0] }, // Mixed types: use cashCredit
                  {
                    $cond: [
                      { $in: ["$type", cashTypes] },
                      { $ifNull: ["$credit", 0] }, // Cash types: use credit
                      0
                    ]
                  }
                ]
              },
              balance: "$runningBalance"
            },
            goldInGMS: {
              // For mixed types (PARTY_PURCHASE_FIX, PARTY_HEDGE_ENTRY), use goldDebit/goldCredit fields
              // For gold-only types, use debit/credit fields
              debit: {
                $cond: [
                  { $in: ["$type", mixedTypes] },
                  { $ifNull: ["$goldDebit", 0] }, // Mixed types: use goldDebit
                  {
                    $cond: [
                      { $in: ["$type", goldTypes] },
                      { $ifNull: ["$debit", 0] }, // Gold types: use debit
                      0
                    ]
                  }
                ]
              },
              credit: {
                $cond: [
                  { $in: ["$type", mixedTypes] },
                  { $ifNull: ["$goldCredit", 0] }, // Mixed types: use goldCredit
                  {
                    $cond: [
                      { $in: ["$type", goldTypes] },
                      { $ifNull: ["$credit", 0] }, // Gold types: use credit
                      0
                    ]
                  }
                ]
              },
              balance: "$runningBalance"
            }
          }
        }
      }
    });

    // Project to format the output and add balance type
    pipeline.push({
      $project: {
        _id: 0,
        partyId: "$_id.partyId",
        partyName: "$_id.partyName",
        transactions: {
          $map: {
            input: "$transactions",
            as: "trans",
            in: {
              transactionDate: "$$trans.transactionDate", // UTC date for sorting (includes time)
              docDate: "$$trans.docDate",
              docRef: "$$trans.docRef",
              branch: "$$trans.branch",
              particulars: "$$trans.particulars",
              transactionType: "$$trans.transactionType", // Include transaction type
              metalTransactionId: "$$trans.metalTransactionId", // For grouping PUM and HPM
              transactionId: "$$trans.transactionId", // Alternative grouping key
              assetType: "$$trans.assetType",
              currencyRate: "$$trans.currencyRate",
              cash: {
                debit: "$$trans.cash.debit",
                credit: "$$trans.cash.credit",
                balance: {
                  $concat: [
                    { $toString: { $ifNull: ["$$trans.cash.balance", 0] } },
                    { $cond: [{ $gt: ["$$trans.cash.balance", 0] }, " CR", " DR"] }
                  ]
                }
              },
              goldInGMS: {
                debit: "$$trans.goldInGMS.debit",
                credit: "$$trans.goldInGMS.credit",
                balance: {
                  $concat: [
                    { $toString: { $ifNull: ["$$trans.goldInGMS.balance", 0] } },
                    { $cond: [{ $gt: ["$$trans.goldInGMS.balance", 0] }, " CR", " DR"] }
                  ]
                }
              }
            }
          }
        }
      }
    });

    return pipeline;
  }
  async getAccountStatementReports(filters) {
    try {
      // IMPORTANT: This function always treats mixed transaction types correctly
      // Mixed types (PARTY_PURCHASE_FIX, PARTY_SALE_FIX, PARTY_HEDGE_ENTRY) contain
      // both cash and gold components in a single transaction and use:
      // - cashDebit/cashCredit fields for cash amounts
      // - goldDebit/goldCredit fields for gold amounts
      // These are handled automatically in buildAccountStatementPipeline()

      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Pass baseCurrency, foreignCurrency, and foreignCurrencySelected to validatedFilters
      // These are needed for assetType filtering
      validatedFilters.baseCurrency = filters.baseCurrency;
      validatedFilters.foreignCurrency = filters.foreignCurrency;
      validatedFilters.foreignCurrencySelected = filters.foreignCurrencySelected;
      
      console.log('Validated Filters====================================');
      console.log(util.inspect(validatedFilters, { depth: null, colors: true, compact: false }));
      console.log('====================================');
      // Construct MongoDB aggregation pipeline
      // This pipeline automatically handles mixed types using shared transaction type definitions
      const pipeline = this.buildAccountStatementPipeline(validatedFilters);
      console.log('Pipeline====================================');
      console.log(util.inspect(pipeline, { depth: null, colors: true, compact: false }));
      console.log('====================================');
      // Execute aggregation query
      const reportData = await Registry.aggregate(pipeline);
      console.log('Report Data====================================');
      console.log(util.inspect(reportData, { depth: null, colors: true, compact: false }));
      console.log('====================================');

      // Calculate opening balance if excludeOpen is false
      // excludeOpen is not validated in validateFilters, so use it directly from filters
      let openingBalance = null;
      if (filters.excludeOpen !== true && (validatedFilters.endDate || filters.toDate)) {
        // Use the original toDate string (YYYY-MM-DD) from filters if available
        // Otherwise, convert the UTC Date back to UAE date string
        let toDateString = filters.toDate;
        if (!toDateString && validatedFilters.endDate) {
          // Convert UTC Date back to UAE local date string
          toDateString = utcToUAEDate(validatedFilters.endDate);
        }
        if (toDateString) {
          // Pass filters to apply voucher, accountType, and currency filters to opening balance
          // Include baseCurrency and foreignCurrency settings for assetType filtering
          const openingBalanceFilters = {
            ...validatedFilters,
            baseCurrency: filters.baseCurrency,
            foreignCurrency: filters.foreignCurrency,
            foreignCurrencySelected: filters.foreignCurrencySelected
          };
          openingBalance = await this.getAccountStatementOpeningBalance(toDateString, openingBalanceFilters);
        }
      }

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);
      console.log(openingBalance,'openingBalance');
      return {
        success: true,
        data: reportData,
        openingBalance: openingBalance,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }


  async getStockAnalysis(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Construct MongoDB aggregation pipeline
      const pipeline = this.buildStockAnalysis(validatedFilters);

      // Execute aggregation query
      const reportData = await Registry.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);

      return {
        success: false,
        data: reportData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }

  async getSalesAnalysis(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.saleValidateFilters(filters);

      // Execute aggregation query for taking sales and purchase
      const salesPipeline = this.buildSalesAnalysis(validatedFilters);
      const purchasePipeline = this.buildSalesAnalysisPurchase();

      // Execute aggregation query
      const salesReport = await Registry.aggregate(salesPipeline).exec();
      const purchaseReport = await Registry.aggregate(purchasePipeline).exec();


      // Calculate sales analysis
      const reportData = this.calculateSalesAnalysis(salesReport, purchaseReport);

      return {
        success: true,
        message: "Sales analysis report generated successfully",
        data: reportData,
        totalRecords: reportData.transactions ? reportData.transactions.length : 0,
      };
    } catch (error) {
      throw new Error(`Failed to generate sales analysis report: ${error.message}`);
    }
  }
  async getPurchaseMetalReport(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Construct MongoDB aggregation pipeline
      const pipeline = this.buildStockLedgerPipeline(validatedFilters);

      // Execute aggregation query
      const reportData = await Registry.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);

      return {
        success: true,
        data: formattedData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }

  async getMetalStockLedgerReport(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Construct MongoDB aggregation pipeline
      const pipeline = this.buildStockLedgerPipeline(validatedFilters);

      // Execute aggregation query
      const reportData = await Registry.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);

      return {
        success: true,
        data: formattedData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }

  async getStockMovementReport(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Construct MongoDB aggregation pipeline
      const pipeline = this.buildStockMovementPipeline(validatedFilters);

      // Execute aggregation query
      const reportData = await InventoryLog.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);

      return {
        success: true,
        data: reportData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate stock movement report: ${error.message}`
      );
    }
  }

  async getStockBalanceReport(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters, true);

      // Construct MongoDB aggregation pipeline
      const pipeline = this.buildStockPipeline(validatedFilters);

      // Execute aggregation query
      const reportData = await InventoryLog.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);

      return {
        success: true,
        data: reportData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }

  async getTransactionSummary(filters) {
    try {
      // Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // Construct MongoDB aggregation pipeline
      const pipeline = this.buildTransactionSummaryPipeline(validatedFilters);


      // Execute aggregation query
      const reportData = await Registry.aggregate(pipeline);

      // Format the retrieved data for response
      const formattedData = this.formatReportData(reportData, validatedFilters);

      return {
        success: true,
        data: reportData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate metal stock ledger report: ${error.message}`
      );
    }
  }

  async getOwnStockReport(filters) {
    try {
      // 1. Validate and normalize filters
      const validatedFilters = this.validateFilters(filters);

      // 2. Get opening balance (only OFP type)
      // excludeOpening: true → don't show opening, excludeOpening: false → show opening
      let openingBalance = { opening: 0, openingValue: 0 };
      const excludeOpening = filters.excludeOpening === true || filters.excludeOpening === "true";
      if (!excludeOpening && filters.fromDate) {
        openingBalance = await this.getOwnStockOpeningBalance(filters.fromDate, validatedFilters);
      }

      // 3. Get MetalTransaction data (respects excludeHedging filter)
      // Pass excludeHedging from original filters since it's not in validatedFilters
      const metalTransactionData = await this.getOwnStockMetalTransactions({
        ...validatedFilters,
        excludeHedging: filters.excludeHedging,
      });

      // 4. Get Purchase Fix / Sale Fix from TransactionFixing
      const fixingData = await this.getOwnStockFixingTransactions(validatedFilters);

      // 4a. Get Hedge Entries as Fixing Transactions (only when excludeHedging === false)
      const hedgeFixingData = await this.getOwnStockHedgeFixingTransactions({
        ...validatedFilters,
        excludeHedging: filters.excludeHedging,
      });

      // Merge hedge fixing data into fixing data by category
      const mergedFixingData = [...fixingData];
      hedgeFixingData.forEach((hedgeFix) => {
        const existingIndex = mergedFixingData.findIndex(
          (fix) => fix.category === hedgeFix.category
        );
        if (existingIndex >= 0) {
          // Merge into existing category
          mergedFixingData[existingIndex].totalGold += hedgeFix.totalGold || 0;
          mergedFixingData[existingIndex].totalValue += hedgeFix.totalValue || 0;
        } else {
          // Add as new category
          mergedFixingData.push(hedgeFix);
        }
      });

      // 4b. Get Open Account Fixing Transactions
      const openAccountFixingData = await this.getOwnStockOpenAccountFixingTransactions(validatedFilters);

      // Merge open account fixing data into fixing data by category
      openAccountFixingData.forEach((openAccountFix) => {
        const existingIndex = mergedFixingData.findIndex(
          (fix) => fix.category === openAccountFix.category
        );
        if (existingIndex >= 0) {
          // Merge into existing category
          mergedFixingData[existingIndex].totalGold += openAccountFix.totalGold || 0;
          mergedFixingData[existingIndex].totalValue += openAccountFix.totalValue || 0;
        } else {
          // Add as new category
          mergedFixingData.push(openAccountFix);
        }
      });

      // 5. Get Adjustments (MSA)
      const adjustmentData = await this.getOwnStockAdjustments(validatedFilters);

      // 6. Get Purity Gain/Loss (respects excludeHedging filter)
      // Pass excludeHedging from original filters since it's not in validatedFilters
      const purityData = await this.getOwnStockPurityDifference({
        ...validatedFilters,
        excludeHedging: filters.excludeHedging,
      });

      // 7. Get Receivables and Payables
      const receivablesPayables = await this.getOwnStockReceivablesPayables();

      // 8. Get Inventory Logs summary
      const inventoryData = await this.getOwnStockInventoryLogs(validatedFilters);

      // 9. Get Pure Weight Gold Jewelry from InventoryLog
      const pureWtGoldJew = await this.getOwnStockPureWtGoldJew(validatedFilters);

      // 9.5. Fetch branch settings for decimal rounding
      const branchSettings = await this.getBranchSettings(validatedFilters);

      // 10. Format the output
      const formatted = this.formatOwnStockData({
        openingBalance,
        metalTransactionData,
        fixingData: mergedFixingData, // Use merged fixing data (includes hedge entries)
        adjustmentData,
        purityData,
        receivablesPayables,
        inventoryData,
        pureWtGoldJew,
        filters: {
          ...validatedFilters,
          excludeOpening: filters.excludeOpening, // Pass excludeOpening from original filters
        },
        branchSettings
      });

      // 10. Return structured response
      return {
        success: true,
        data: formatted,
        totalRecords: 1,
        filters: validatedFilters,
      };
    } catch (error) {
      console.error("Error generating own stock report:", error);
      throw new Error(`Failed to generate own stock report: ${error.message}`);
    }
  }



  async getMetalFixingReports(filters) {
    try {
      // 1. Validate and format input filters
      const validatedFilters = this.validateFilters(filters);

      // 2. Handle excludeOpening - get opening balance if needed
      // excludeOpening: false → show opening balance, excludeOpening: true → don't show opening
      let openingBalance = { opening: 0, openingValue: 0 };
      const excludeOpening = filters.excludeOpening === true || filters.excludeOpening === "true";
      if (!excludeOpening && filters.fromDate) {
        openingBalance = await this.getOwnStockOpeningBalance(filters.fromDate, validatedFilters);
      }

      // 3. Construct MongoDB aggregation pipeline for fixing reports
      // Pass excludeHedging from original filters since it's not in validatedFilters
      const pipeline = this.metalFxingPipeLine({
        ...validatedFilters,
        excludeHedging: filters.excludeHedging,
        excludeOpening: filters.excludeOpening,
      });

      // 4. Execute aggregation query with debugging
      console.log("=== METAL FIXING REPORT DEBUG ===");
      console.log("Filters:", JSON.stringify(validatedFilters, null, 2));
      console.log("excludeOpening:", filters.excludeOpening);
      console.log("excludeHedging:", filters.excludeHedging);
      console.log("Opening Balance:", openingBalance);
      console.log("Pipeline stages:", pipeline.length);
      
      // Debug: Check initial match count on Registry
      const initialMatch = {
        isActive: true,
        type: { $in: ["purchase-fixing", "sales-fixing", "OPEN-ACCOUNT-FIXING"] },
        $or: [
          { metalTransactionId: { $exists: true, $ne: null } },
          { fixingTransactionId: { $exists: true, $ne: null } },
          { type: "OPEN-ACCOUNT-FIXING" } // OPEN-ACCOUNT-FIXING may not have metalTransactionId or fixingTransactionId
        ],
      };
      if (validatedFilters.startDate || validatedFilters.endDate) {
        initialMatch.transactionDate = {};
        if (validatedFilters.startDate) {
          initialMatch.transactionDate.$gte = new Date(validatedFilters.startDate);
        }
        if (validatedFilters.endDate) {
          initialMatch.transactionDate.$lte = new Date(validatedFilters.endDate);
        }
      }
      
      const initialMatchCount = await Registry.countDocuments(initialMatch);
      console.log("✅ Initial Match Count (Registry with purchase-fixing or sales-fixing):", initialMatchCount);
      console.log("📅 Date Range:", {
        startDate: validatedFilters.startDate,
        endDate: validatedFilters.endDate
      });
      
      // Debug: Check if any Registry entries exist
      if (initialMatchCount > 0) {
        const sampleRegistry = await Registry.find(initialMatch).limit(5).lean();
        console.log("📋 Sample Registry entries (first 5):", JSON.stringify(sampleRegistry.map(r => ({
          _id: r._id,
          reference: r.reference,
          type: r.type,
          transactionDate: r.transactionDate,
          metalTransactionId: r.metalTransactionId,
          fixingTransactionId: r.fixingTransactionId
        })), null, 2));
      } else {
        console.log("❌ No Registry entries found matching initial criteria!");
      }
      
      console.log("🔄 Executing aggregation pipeline on Registry...");
      const reportData = await Registry.aggregate(pipeline);
      console.log("📊 Final Report Data Length:", reportData.length);
      if (reportData.length > 0) {
        console.log("✅ First record sample:", JSON.stringify(reportData[0], null, 2));
      } else {
        console.log("❌ No records returned from pipeline!");
      }

      // 5. Calculate netPurchase and netSales from fixing transactions
      // Group by underlying MetalTransaction.transactionType to calculate properly
      console.log("=== NET PURCHASE/SALES CALCULATION DEBUG ===");
      console.log("Total fixing entries:", reportData.length);
      
      // Debug: Log balance in/out for each entry
      console.log("\n📊 Balance In/Out Details:");
      reportData.forEach((item, index) => {
        console.log(`Entry ${index + 1}:`, {
          voucher: item.voucher,
          type: item.type,
          transactionType: item.metalTransactionType,
          pureWeightIn: item.pureWeightIn,
          pureWeightOut: item.pureWeightOut,
          netWeight: (item.pureWeightIn || 0) - (item.pureWeightOut || 0),
          value: item.value
        });
      });

      // Group by transactionType from MetalTransaction
      // Net Purchase = (purchase + importPurchase) + (purchaseReturn + importPurchaseReturn)
      // Net Sales = (sale + exportSale) + (saleReturn + exportSaleReturn)
      // For hedge entries: same logic based on transactionType
      
      const purchaseTypes = ["purchase", "importPurchase"];
      const purchaseReturnTypes = ["purchaseReturn", "importPurchaseReturn"];
      const saleTypes = ["sale", "exportSale"];
      const saleReturnTypes = ["saleReturn", "exportSaleReturn"];
      
      // For hedge entries, the logic is reversed:
      // Net Purchase from hedge = (sale + exportSale + hedgeMetalPayment) - (purchaseReturn + importPurchaseReturn)
      // Net Sales from hedge = (purchase + importPurchase + hedgeMetalReceipt + hedgeMetalReciept) - (saleReturn + exportSaleReturn)
      const hedgePurchaseTypes = ["sale", "exportSale", "hedgeMetalPayment"];
      const hedgePurchaseReturnTypes = ["purchaseReturn", "importPurchaseReturn"];
      const hedgeSaleTypes = ["purchase", "importPurchase", "hedgeMetalReceipt", "hedgeMetalReciept"];
      const hedgeSaleReturnTypes = ["saleReturn", "exportSaleReturn"];

      // Calculate purchase totals
      let purchaseGold = 0;
      let purchaseValue = 0;
      let purchaseReturnGold = 0;
      let purchaseReturnValue = 0;
      
      // Calculate sale totals
      let saleGold = 0;
      let saleValue = 0;
      let saleReturnGold = 0;
      let saleReturnValue = 0;

      // Process each fixing entry based on its underlying MetalTransaction.transactionType
      // If transactionType is not available, use the fixing type (purchase-fixing or sales-fixing) as fallback
      reportData.forEach((item) => {
        const transactionType = item.metalTransactionType;
        const fixingType = item.type; // purchase-fixing or sales-fixing
        const pureWeightIn = Number(item.pureWeightIn || 0);
        const pureWeightOut = Number(item.pureWeightOut || 0);
        const netWeight = pureWeightIn - pureWeightOut;
        const value = Number(item.value || 0);

        // Check if this is a hedge entry (based on transactionType)
        const isHedgeType = transactionType && (
          transactionType === "hedgeMetalPayment" || 
          transactionType === "hedgeMetalReceipt" || 
          transactionType === "hedgeMetalReciept"
        );

        if (transactionType) {
          // We have transactionType, use it for calculation
          if (isHedgeType) {
            // Hedge logic
            if (hedgePurchaseTypes.includes(transactionType)) {
              purchaseGold += netWeight;
              purchaseValue += value;
            } else if (hedgePurchaseReturnTypes.includes(transactionType)) {
              purchaseReturnGold += netWeight;
              purchaseReturnValue += value;
            } else if (hedgeSaleTypes.includes(transactionType)) {
              saleGold += Math.abs(netWeight); // Sales are typically negative, take abs
              saleValue += Math.abs(value);
            } else if (hedgeSaleReturnTypes.includes(transactionType)) {
              saleReturnGold += Math.abs(netWeight);
              saleReturnValue += Math.abs(value);
            }
          } else {
            // Regular logic
            if (purchaseTypes.includes(transactionType)) {
              purchaseGold += netWeight;
              purchaseValue += value;
            } else if (purchaseReturnTypes.includes(transactionType)) {
              purchaseReturnGold += netWeight;
              purchaseReturnValue += value;
            } else if (saleTypes.includes(transactionType)) {
              saleGold += Math.abs(netWeight); // Sales are typically negative, take abs
              saleValue += Math.abs(value);
            } else if (saleReturnTypes.includes(transactionType)) {
              saleReturnGold += Math.abs(netWeight);
              saleReturnValue += Math.abs(value);
            }
          }
        } else {
          // No transactionType available, use fixing type as fallback
          // purchase-fixing → goes to purchase
          // sales-fixing → goes to sale
          if (fixingType === "purchase-fixing") {
            purchaseGold += netWeight;
            purchaseValue += value;
          } else if (fixingType === "sales-fixing") {
            saleGold += Math.abs(netWeight);
            saleValue += Math.abs(value);
          }
        }
      });

      // Net Purchase = purchase + purchaseReturn (sum, not subtract)
      const netPurchaseGold = purchaseGold + purchaseReturnGold;
      const netPurchaseValue = purchaseValue + purchaseReturnValue;

      // Net Sales = sale + saleReturn (sum, not subtract)
      const netSalesGold = saleGold + saleReturnGold;
      const netSalesValue = saleValue + saleReturnValue;

      // Debug: Log calculation breakdown
      console.log("\n💰 Calculation Breakdown:");
      console.log("Purchase Types:", {
        purchaseGold,
        purchaseValue,
        purchaseReturnGold,
        purchaseReturnValue,
        netPurchaseGold,
        netPurchaseValue
      });
      console.log("Sale Types:", {
        saleGold,
        saleValue,
        saleReturnGold,
        saleReturnValue,
        netSalesGold,
        netSalesValue
      });
      console.log("Final Net Purchase:", { gold: netPurchaseGold, value: netPurchaseValue });
      console.log("Final Net Sales:", { gold: netSalesGold, value: netSalesValue });

      // 6. Get adjustment data
      const adjustmentData = await this.getOwnStockAdjustments(validatedFilters);
      const adjustment = adjustmentData[0] || { totalGold: 0, totalValue: 0 };

      // 7. Get purity gain/loss data
      const purityData = await this.getOwnStockPurityDifference({
        ...validatedFilters,
        excludeHedging: filters.excludeHedging,
      });
      const purityDiff = purityData[0] || { totalGold: 0, totalValue: 0 };

      // Separate purity gain and loss
      const purityGain = purityDiff.totalGold > 0 ? { gold: purityDiff.totalGold, value: purityDiff.totalValue } : { gold: 0, value: 0 };
      const purityLoss = purityDiff.totalGold < 0 ? { gold: Math.abs(purityDiff.totalGold), value: Math.abs(purityDiff.totalValue) } : { gold: 0, value: 0 };

      // 7.5. Fetch branch settings for decimal rounding
      const branchSettings = await this.getBranchSettings(validatedFilters);

      // 8. Format the retrieved data for response
      const formattedData = this.formatFixingReportData(
        reportData, 
        openingBalance, 
        validatedFilters,
        {
          netPurchase: { gold: netPurchaseGold, value: netPurchaseValue },
          netSales: { gold: netSalesGold, value: netSalesValue },
          adjustmentData: { gold: adjustment.totalGold, value: adjustment.totalValue },
          purityGain,
          purityLoss,
        },
        branchSettings
      );
      console.log("Formatted Data:", JSON.stringify(formattedData, null, 2));

      return {
        success: true,
        data: formattedData,
        filters: validatedFilters,
        totalRecords: reportData.length,
      };
    } catch (error) {
      console.error("Error in getMetalFixingReports:", error);
      console.error("Error stack:", error.stack);
      throw new Error(
        `Failed to generate metal fixing report: ${error.message}`
      );
    }
  }


  validateFilters(filters = {}, isStock = false) {
    // Provide default empty object if filters is undefined or null
    const {
      type,
      fromDate,
      discount,
      toDate,
      asOnDate,
      transactionType,
      division = [],
      voucher = [],
      stock = [],
      karat = [],
      accountType = [],
      grossWeight = false,
      pureWeight = false,
      showPcs = false,
      showMoved = false,
      showNetMovement = false,
      showMetalValue = false,
      showPurchaseSales = false,
      showPicture = false,
      showVatReports = false,
      showSummaryOnly = false,
      showWastage = false,
      withoutSap = false,
      showRfnDetails = false,
      showRetails = false,
      showCostIn = false,
      groupBy = [],
      costFilter,
      groupByRange = {
        stockCode: [],
        categoryCode: [],
        karat: [],
        type: [],
        supplier: [],
        purchaseRef: [],
      },
      costCenter,
    } = filters;

    // Initialize dates - treat input dates as UAE local time, convert to UTC for MongoDB
    let startDate = null;
    let endDate = null;
    let asOnDateParsed = null;

    // Treat fromDate/toDate as UAE local time strings (YYYY-MM-DD)
    // Convert to UTC Date objects for MongoDB queries
    if (fromDate) {
      // If it's already a Date object, convert to string first, then to UAE->UTC
      const dateStr = fromDate instanceof Date ? moment(fromDate).format('YYYY-MM-DD') : fromDate;
      startDate = uaeDateToUTC(dateStr, 'start');
    }
    if (toDate) {
      // If it's already a Date object, convert to string first, then to UAE->UTC
      const dateStr = toDate instanceof Date ? moment(toDate).format('YYYY-MM-DD') : toDate;
      endDate = uaeDateToUTC(dateStr, 'end');
    }
    if (asOnDate) {
      const dateStr = asOnDate instanceof Date ? moment(asOnDate).format('YYYY-MM-DD') : asOnDate;
      asOnDateParsed = uaeDateToUTC(dateStr, 'end');
    }
    
    if (startDate && endDate && startDate > endDate) {
      throw new Error("From date cannot be greater than to date");
    }

    const formatObjectIds = (arr) =>
      arr
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    const result = {
      division: formatObjectIds(division),
      voucher,
      stock: formatObjectIds(stock),
      karat: formatObjectIds(karat),
      accountType: formatObjectIds(accountType),
      groupBy,
      type,
      grossWeight,
      pureWeight,
      showPcs,
      showMoved,
      showNetMovement,
      showMetalValue,
      showPurchaseSales,
      showPicture,
      showVatReports,
      showSummaryOnly,
      showWastage,
      withoutSap,
      showRfnDetails,
      showRetails,
      showCostIn,
      costCenter,
      discount,
      costFilter,
    };

    if (startDate) result.startDate = startDate;
    if (endDate) result.endDate = endDate;
    if (asOnDateParsed) result.asOnDate = asOnDateParsed;
    if (transactionType) result.transactionType = transactionType;

    // Conditionally add groupByRange if it has any non-empty array
    const hasGroupByRangeValues = Object.values(groupByRange).some(
      (arr) => Array.isArray(arr) && arr.length > 0
    );

    if (isStock) {
      if (hasGroupByRangeValues) {
        const formattedGroupByRange = {};
        for (const [key, value] of Object.entries(groupByRange)) {
          if (["karat", "categoryCode", "supplier", "type", "brand", "size", "color"].includes(key)) {
            formattedGroupByRange[key] = formatObjectIds(value);
          } else {
            formattedGroupByRange[key] = value;
          }
        }
        result.groupByRange = formattedGroupByRange;
      }
    } else {
      if (hasGroupByRangeValues) {
        const formattedGroupByRange = {};
        for (const [key, value] of Object.entries(groupByRange)) {
          formattedGroupByRange[key] = formatObjectIds(value);
        }
        result.groupByRange = formattedGroupByRange;
      }
    }

    return result;
  }

  saleValidateFilters(filters) {

    if (!filters.fromDate || !filters.toDate) {
      throw new Error("From date and to date are required");
    }

    // Convert and normalize using moment
    const startDate = moment(filters.fromDate).startOf("day").toDate(); // 00:00:00
    const endDate = moment(filters.toDate).endOf("day").toDate();       // 23:59:59.999

    // Validate range
    if (startDate > endDate) {
      throw new Error("From date cannot be greater than to date");
    }

    return {
      ...filters,
      fromDate: startDate.toISOString(),
      toDate: endDate.toISOString(),
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

  buildStockLedgerPipeline(filters) {
    const pipeline = [];

    // Step 1: Match base records
    const matchConditions = {
      isActive: true,
      $or: [
        { metalTransactionId: { $exists: true, $ne: null } },
        { EntryTransactionId: { $exists: true, $ne: null } },
        { InventoryLogID: { $exists: true, $ne: null } },
      ],
    };

    // Type filter
    if (filters.type) {
      matchConditions.type = filters.type;
    }

    // Date filter
    if (filters.startDate || filters.endDate) {
      matchConditions.transactionDate = {};
      if (filters.startDate) {
        matchConditions.transactionDate.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        matchConditions.transactionDate.$lte = new Date(filters.endDate);
      }
    }

    pipeline.push({ $match: matchConditions });

    // Voucher prefix filter
    if (filters.voucher?.length > 0) {
      const regexFilters = filters.voucher.map((prefix) => ({
        reference: { $regex: `^${prefix}\\d+$`, $options: "i" },
      }));
      pipeline.push({ $match: { $or: regexFilters } });
    }

    // Step 2: Lookup related documents
    pipeline.push(
      {
        $lookup: {
          from: "metaltransactions",
          localField: "metalTransactionId",
          foreignField: "_id",
          as: "metalTransaction",
        },
      },
      {
        $lookup: {
          from: "entries",
          localField: "EntryTransactionId",
          foreignField: "_id",
          as: "entryInfo",
        },
      },
      {
        $lookup: {
          from: "inventorylogs",
          localField: "InventoryLogID",
          foreignField: "_id",
          as: "inventory",
        },
      }
    );

    // Step 3: Unwind (preserveNull for optional lookups)
    pipeline.push(
      { $unwind: { path: "$metalTransaction", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$entryInfo", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } }
    );

    // Step 4: Normalize transactionData, partyCode, and voucher
    pipeline.push({
      $addFields: {
        transactionData: {
          $cond: [
            { $ifNull: ["$metalTransaction", false] },
            "$metalTransaction",
            {
              $cond: [
                { $ifNull: ["$entryInfo", false] },
                "$entryInfo",
                "$inventory",
              ],
            },
          ],
        },
        partyCode: {
          $ifNull: ["$metalTransaction.partyCode", "$entryInfo.party"],
        },
        voucher: {
          $ifNull: [
            "$metalTransaction.voucherNumber",
            { $ifNull: ["$entryInfo.voucherCode", "$inventory.voucherCode"] },
          ],
        },
      },
    });

    // Step 5: Normalize stockItems for all sources
    pipeline.push({
      $addFields: {
        "transactionData.stockItems": {
          $cond: [
            {
              $gt: [
                { $size: { $ifNull: ["$transactionData.stockItems", []] } },
                0,
              ],
            },
            "$transactionData.stockItems",
            {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$transactionData.stocks", []] } }, 0] },
                "$transactionData.stocks",
                [
                  {
                    stockCode: "$inventory.stockCode",
                    grossWeight: "$inventory.grossWeight",
                    alternateAmount: 0,
                  },
                ],
              ],
            },
          ],
        },
      },
    });

    // Step 6: Lookup party account
    pipeline.push({
      $lookup: {
        from: "accounts",
        localField: "partyCode",
        foreignField: "_id",
        as: "partyAccount",
      },
    });

    // Step 7: Add partyName
    pipeline.push({
      $addFields: {
        partyName: {
          $ifNull: [{ $arrayElemAt: ["$partyAccount.customerName", 0] }, "N/A"],
        },
      },
    });

    // Step 8: Unwind stockItems
    pipeline.push({
      $unwind: {
        path: "$transactionData.stockItems",
        preserveNullAndEmptyArrays: false,
      },
    });

    // Step 9: Normalize stockCode for lookup
    pipeline.push({
      $addFields: {
        stockCodeToLookup: {
          $ifNull: [
            "$transactionData.stockItems.stockCode",
            {
              $ifNull: [
                "$transactionData.stockItems.stock",
                "$inventory.stockCode",
              ],
            },
          ],
        },
      },
    });

    // Step 10: Lookup stock details
    pipeline.push(
      {
        $lookup: {
          from: "metalstocks",
          localField: "stockCodeToLookup",
          foreignField: "_id",
          as: "stockDetails",
        },
      },
      {
        $unwind: {
          path: "$stockDetails",
          preserveNullAndEmptyArrays: false,
        },
      }
    );

    // Step 11: Filters
    if (filters.accountType?.length > 0) {
      pipeline.push({
        $match: {
          "metalTransaction.partyCode": { $in: filters.accountType },
        },
      });
    }

    if (filters.stock?.length > 0) {
      pipeline.push({
        $match: {
          "stockDetails._id": { $in: filters.stock },
        },
      });
    }

    if (filters.karat?.length > 0) {
      pipeline.push({
        $match: {
          "stockDetails.karat": { $in: filters.karat },
        },
      });
    }

    if (filters.division?.length > 0) {
      pipeline.push({
        $match: {
          "stockDetails.metalType": { $in: filters.division },
        },
      });
    }

    // Step 12: Final projection
    pipeline.push({
      $project: {
        _id: 0,
        voucher: 1,
        transactionDate: 1,
        partyName: 1,
        stockCode: {
          $ifNull: ["$stockDetails.code", "$stockDetails.altCode"],
        },
        stockIn: "$debit",
        stockOut: "$credit",
        grossWeight: "$grossWeight",
        purity: "$purity",
        pureWeight: "$pureWeight",
        value: {
          $ifNull: [
            "$stockDetails.stockItems.itemTotal.baseAmount",
            {
              $ifNull: [
                "$transactionData.stockItems.alternateAmount",
                0,
              ],
            },
          ],
        },
        pcs: {
          $cond: {
            if: {
              $gt: [
                {
                  $ifNull: [
                    "$stockDetails.totalValue",
                    {
                      $ifNull: [
                        "$transactionData.stockItems.alternateAmount",
                        0,
                      ],
                    },
                  ],
                },
                0,
              ],
            },
            then: {
              $divide: [
                "$grossWeight",
                {
                  $ifNull: [
                    "$stockDetails.totalValue",
                    {
                      $ifNull: [
                        "$transactionData.stockItems.alternateAmount",
                        1,
                      ],
                    },
                  ],
                },
              ],
            },
            else: 0,
          },
        },
      },
    });

    // Step 13: Final sort
    pipeline.push({
      $sort: { transactionDate: -1 }
    });


    return pipeline;

  }

  /**
   * Build aggregation pipeline for InventoryLog-based stock ledger report
   * Shows FIFO (First In First Out) ordering by date
   * Includes pureWt in/out and making amount in/out
   */
  buildInventoryLogStockLedgerPipeline(filters) {
    const pipeline = [];

    // Step 1: Base match conditions
    const matchConditions = {
      isDraft: false, // Exclude draft entries
      transactionType: { $ne: "initial" }, // Exclude INITIAL transaction type
    };

    // Date filter - use voucherDate from InventoryLog
    // Dates are already converted to UTC Date objects by validateFilters
    if (filters.startDate || filters.endDate) {
      matchConditions.voucherDate = {};
      if (filters.startDate) {
        matchConditions.voucherDate.$gte = filters.startDate instanceof Date 
          ? filters.startDate 
          : new Date(filters.startDate);
      }
      if (filters.endDate) {
        matchConditions.voucherDate.$lte = filters.endDate instanceof Date 
          ? filters.endDate 
          : new Date(filters.endDate);
      }
    }

    // Stock filter - filter by stockCode
    if (filters.stock?.length > 0) {
      matchConditions.stockCode = { $in: filters.stock.map(id => new ObjectId(id)) };
    }

    // Voucher filter
    if (filters.voucher?.length > 0) {
      const voucherTypes = filters.voucher.map(v => v.type);
      const voucherPrefixes = filters.voucher.map(v => v.prefix);
      
      const voucherMatch = [];
      if (voucherTypes.length > 0) {
        voucherMatch.push({ voucherType: { $in: voucherTypes } });
      }
      if (voucherPrefixes.length > 0) {
        const regexFilters = voucherPrefixes.map(prefix => ({
          voucherCode: { $regex: `^${prefix}\\d+$`, $options: "i" }
        }));
        voucherMatch.push({ $or: regexFilters });
      }
      
      if (voucherMatch.length > 0) {
        matchConditions.$or = voucherMatch;
      }
    }

    pipeline.push({ $match: matchConditions });

    // Step 2: Lookup MetalStock to get stock details and karat
    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "stockCode",
        foreignField: "_id",
        as: "stockDetails",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$stockDetails",
        preserveNullAndEmptyArrays: false, // Only include logs with valid stock
      },
    });

    // Step 3: Filter by karat (after stock lookup)
    if (filters.karat?.length > 0) {
      pipeline.push({
        $match: {
          "stockDetails.karat": { $in: filters.karat.map(id => new ObjectId(id)) },
        },
      });
    }

    // Step 4: Filter by division (metalType)
    if (filters.division?.length > 0) {
      pipeline.push({
        $match: {
          "stockDetails.metalType": { $in: filters.division.map(id => new ObjectId(id)) },
        },
      });
    }

    // Step 5: Filter by party (account)
    if (filters.accountType?.length > 0) {
      pipeline.push({
        $match: {
          party: { $in: filters.accountType.map(id => new ObjectId(id)) },
        },
      });
    }

    // Step 6: Lookup KaratMaster for karat details
    pipeline.push({
      $lookup: {
        from: "karatmasters",
        localField: "stockDetails.karat",
        foreignField: "_id",
        as: "karatDetails",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$karatDetails",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 7: Lookup Party (Account) details
    pipeline.push({
      $lookup: {
        from: "accounts",
        localField: "party",
        foreignField: "_id",
        as: "partyDetails",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$partyDetails",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 8: Calculate pure weight and determine in/out based on action
    pipeline.push({
      $addFields: {
        // Calculate effective purity (prefer log purity, then stock standardPurity, then karat standardPurity)
        effectivePurity: {
          $cond: [
            { $gt: [{ $ifNull: ["$purity", 0] }, 0] },
            { $divide: [{ $toDouble: { $ifNull: ["$purity", 0] } }, 100] }, // Log purity is in percentage, convert to decimal
            {
              $cond: [
                { $gt: [{ $ifNull: ["$stockDetails.standardPurity", 0] }, 0] },
                { $toDouble: { $ifNull: ["$stockDetails.standardPurity", 0] } }, // Stock standardPurity is already in decimal (0-1)
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$karatDetails.standardPurity", 0] }, 0] },
                    { $divide: [{ $toDouble: { $ifNull: ["$karatDetails.standardPurity", 0] } }, 100] }, // Karat purity is in percentage, convert to decimal
                    0
                  ]
                }
              ]
            }
          ]
        },
      },
    });

    // Step 9: Calculate pure weight and separate in/out
    pipeline.push({
      $addFields: {
        pureWeight: {
          $multiply: [
            { $toDouble: { $ifNull: ["$grossWeight", 0] } },
            { $ifNull: ["$effectivePurity", 0] }
          ]
        },
        // Pure weight in (when action is "add")
        pureWtIn: {
          $cond: [
            { $eq: ["$action", "add"] },
            {
              $multiply: [
                { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                { $ifNull: ["$effectivePurity", 0] }
              ]
            },
            0
          ]
        },
        // Pure weight out (when action is "remove")
        pureWtOut: {
          $cond: [
            { $eq: ["$action", "remove"] },
            {
              $multiply: [
                { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                { $ifNull: ["$effectivePurity", 0] }
              ]
            },
            0
          ]
        },
        // Making amount in (when action is "add")
        // Use avgMakingAmount if available, otherwise calculate from grossWeight * avgMakingRate
        makingAmountIn: {
          $cond: [
            { $eq: ["$action", "add"] },
            {
              $ifNull: [
                { $toDouble: "$avgMakingAmount" },
                {
                  $multiply: [
                    { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                    { $toDouble: { $ifNull: ["$avgMakingRate", 0] } }
                  ]
                }
              ]
            },
            0
          ]
        },
        // Making amount out (when action is "remove")
        // Use avgMakingAmount if available, otherwise calculate from grossWeight * avgMakingRate
        makingAmountOut: {
          $cond: [
            { $eq: ["$action", "remove"] },
            {
              $ifNull: [
                { $toDouble: "$avgMakingAmount" },
                {
                  $multiply: [
                    { $toDouble: { $ifNull: ["$grossWeight", 0] } },
                    { $toDouble: { $ifNull: ["$avgMakingRate", 0] } }
                  ]
                }
              ]
            },
            0
          ]
        },
        // Gross weight in/out
        grossWeightIn: {
          $cond: [
            { $eq: ["$action", "add"] },
            { $toDouble: { $ifNull: ["$grossWeight", 0] } },
            0
          ]
        },
        grossWeightOut: {
          $cond: [
            { $eq: ["$action", "remove"] },
            { $toDouble: { $ifNull: ["$grossWeight", 0] } },
            0
          ]
        },
      },
    });

    // Step 10: Project final fields
    pipeline.push({
      $project: {
        _id: 1,
        code: 1,
        voucherCode: 1,
        voucherType: 1,
        voucherDate: 1,
        transactionType: 1,
        action: 1,
        partyId: "$party",
        partyName: { 
          $ifNull: [
            "$partyDetails.customerName", 
            "N/A"
          ] 
        },
        stockCode: { $ifNull: ["$stockDetails.code", "N/A"] },
        stockId: "$stockCode",
        karatId: "$stockDetails.karat",
        karatCode: { $ifNull: ["$karatDetails.karatCode", "N/A"] },
        karatDescription: { $ifNull: ["$karatDetails.description", "N/A"] },
        grossWeight: { $toDouble: { $ifNull: ["$grossWeight", 0] } },
        grossWeightIn: 1,
        grossWeightOut: 1,
        purity: { $toDouble: { $ifNull: ["$purity", 0] } },
        effectivePurity: 1,
        pureWeight: 1,
        pureWtIn: 1,
        pureWtOut: 1,
        avgMakingRate: { $toDouble: { $ifNull: ["$avgMakingRate", 0] } },
        avgMakingAmount: { $toDouble: { $ifNull: ["$avgMakingAmount", 0] } },
        makingAmountIn: 1,
        makingAmountOut: 1,
        pcs: { $ifNull: ["$pcs", 0] },
        note: 1,
        timestamp: 1,
      },
    });

    // Step 11: Sort by date (FIFO - First In First Out) - ascending order
    pipeline.push({
      $sort: { 
        voucherDate: 1,  // Ascending for FIFO
        timestamp: 1      // Secondary sort by timestamp for same date
      }
    });

    return pipeline;
  }

  /**
   * Format InventoryLog report data with summary
   */
  formatInventoryLogReportData(reportData, filters) {
    if (!reportData || reportData.length === 0) {
      return {
        transactions: [],
        summary: {
          totalTransactions: 0,
          totalGrossWeightIn: 0,
          totalGrossWeightOut: 0,
          totalPureWtIn: 0,
          totalPureWtOut: 0,
          totalMakingAmountIn: 0,
          totalMakingAmountOut: 0,
          netGrossWeight: 0,
          netPureWeight: 0,
          netMakingAmount: 0,
        },
        appliedFilters: this.getAppliedFiltersInfo(filters),
      };
    }

    // Calculate summary statistics
    const summary = reportData.reduce(
      (acc, item) => {
        acc.totalTransactions += 1;
        acc.totalGrossWeightIn += item.grossWeightIn || 0;
        acc.totalGrossWeightOut += item.grossWeightOut || 0;
        acc.totalPureWtIn += item.pureWtIn || 0;
        acc.totalPureWtOut += item.pureWtOut || 0;
        acc.totalMakingAmountIn += item.makingAmountIn || 0;
        acc.totalMakingAmountOut += item.makingAmountOut || 0;
        return acc;
      },
      {
        totalTransactions: 0,
        totalGrossWeightIn: 0,
        totalGrossWeightOut: 0,
        totalPureWtIn: 0,
        totalPureWtOut: 0,
        totalMakingAmountIn: 0,
        totalMakingAmountOut: 0,
      }
    );

    // Calculate net values
    summary.netGrossWeight = summary.totalGrossWeightIn - summary.totalGrossWeightOut;
    summary.netPureWeight = summary.totalPureWtIn - summary.totalPureWtOut;
    summary.netMakingAmount = summary.totalMakingAmountIn - summary.totalMakingAmountOut;

    // Format individual transactions
    const transactions = reportData.map((item) => {
      return {
        id: item._id,
        code: item.code,
        voucherCode: item.voucherCode || "N/A",
        voucherType: item.voucherType || "N/A",
        voucherDate: item.voucherDate ? moment(item.voucherDate).format("DD/MM/YYYY") : "N/A",
        transactionType: item.transactionType,
        action: item.action,
        partyId: item.partyId,
        partyName: item.partyName,
        stockCode: item.stockCode,
        stockId: item.stockId,
        karatId: item.karatId,
        karatCode: item.karatCode,
        karatDescription: item.karatDescription,
        grossWeight: item.grossWeight,
        grossWeightIn: item.grossWeightIn,
        grossWeightOut: item.grossWeightOut,
        purity: item.purity,
        effectivePurity: item.effectivePurity,
        pureWeight: item.pureWeight,
        pureWtIn: item.pureWtIn,
        pureWtOut: item.pureWtOut,
        avgMakingRate: item.avgMakingRate,
        avgMakingAmount: item.avgMakingAmount,
        makingAmountIn: item.makingAmountIn,
        makingAmountOut: item.makingAmountOut,
        pcs: item.pcs,
        note: item.note || "",
        timestamp: item.timestamp ? moment(item.timestamp).format("DD/MM/YYYY HH:mm:ss") : "N/A",
      };
    });

    return {
      transactions,
      summary,
      appliedFilters: this.getAppliedFiltersInfo(filters),
    };
  }



//=================Build Sales Analysis=================
  buildSalesAnalysis(filters) {

    const pipeline = [];
    const referenceRegex = [];

    // Step 1: Base match condition
    // const matchConditions = {
    //   isActive: true,
    // };

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
    if (filters.fromDate || filters.toDate) {
      matchConditions.transactionDate = {};
      if (filters.fromDate) {
        matchConditions.transactionDate.$gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        matchConditions.transactionDate.$lte = new Date(filters.toDate);
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
        "metaltransactions.transactionType": "sale",
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
 //=================Calculate Sales Analysis=================
  calculateSalesAnalysis(salesReport, purchaseReport) {
    const salesTransactions = salesReport[0]?.transactions || [];
    const purchaseTransactions = purchaseReport[0]?.transactions || [];

    // Create purchase map by stockCode
    const purchaseMap = new Map();
    purchaseTransactions.forEach(p => {
      purchaseMap.set(p.stockCode.toString(), {
        makingCharge: p.makingCharge || 0,
        grossWeight: p.grossWeight || 0,
        total: p.total || 0,
      });
    });

    // Calculate and combine
    const combinedTransactions = salesTransactions.map(sale => {
      const stockCode = sale.stockCode.toString();
      const purchase = purchaseMap.get(stockCode) || {
        makingCharge: 0,
        grossWeight: 0,
        total: 0,
      };

      const saleGrossWeight = sale.grossWeight || 0;
      const saleMakingCharge = sale.makingCharge || 0;

      const purchaseGrossWeight = purchase.grossWeight || 0;
      const purchaseMakingCharge = purchase.makingCharge || 0;

      // Avg making charges
      const avgPurchaseMakingCharge = purchaseGrossWeight > 0
        ? purchaseMakingCharge / purchaseGrossWeight
        : 0;

      const avgSaleMakingCharge = saleGrossWeight > 0
        ? saleMakingCharge / saleGrossWeight
        : 0;

      // Cost of sale
      const cost = avgPurchaseMakingCharge * saleGrossWeight;

      // Profit metrics
      const profitMakingRate = avgSaleMakingCharge - avgPurchaseMakingCharge;
      const profitMakingAmount = saleMakingCharge - purchaseMakingCharge;

      return {
        id: sale.stockCode,
        stockCode: sale.code,
        description: sale.description,
        pcs: sale.pcs,
        grossWeight: saleGrossWeight,
        saleMakingCharge: saleMakingCharge,
        purchaseMakingCharge: purchaseMakingCharge,
        avgPurchaseMakingCharge: avgPurchaseMakingCharge,
        avgSaleMakingCharge: avgSaleMakingCharge,
        cost: cost,
        profitMakingRate: profitMakingRate,
        profitMakingAmount: profitMakingAmount,
        totalSale: sale.total,
        totalPurchase: purchase.total,
        profit: sale.total - purchase.total,
      };
    });

    // Totals (if needed)
    const totals = {
      totalPcs: combinedTransactions.reduce((sum, t) => sum + (t.pcs || 0), 0),
      totalGrossWeight: combinedTransactions.reduce((sum, t) => sum + (t.grossWeight || 0), 0),
      totalMakingCharge: combinedTransactions.reduce((sum, t) => sum + (t.saleMakingCharge || 0), 0),
      totalCost: combinedTransactions.reduce((sum, t) => sum + (t.cost || 0), 0),
      totalProfitMakingAmount: combinedTransactions.reduce((sum, t) => sum + (t.profitMakingAmount || 0), 0),
      totalProfit: combinedTransactions.reduce((sum, t) => sum + (t.profit || 0), 0),
    };

    return {
      transactions: combinedTransactions,
      totals,
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
        "metaltransactions.transactionType": "purchase",
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

  buildStockAnalysis(filters) {
    const pipeline = [];

    // Base match conditions for Registry
    const matchConditions = {
      type: "GOLD_STOCK",
      isActive: true,
    };

    // Add date range filter
    if (filters.startDate && filters.endDate) {
      matchConditions.transactionDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    } else if (filters.startDate) {
      matchConditions.transactionDate = {
        $gte: new Date(filters.startDate),
      };
    } else if (filters.endDate) {
      matchConditions.transactionDate = {
        $lte: new Date(filters.endDate),
      };
    }

    // Apply voucher prefix filtering
    if (filters.voucher && filters.voucher.length > 0) {
      const regexFilters = filters.voucher.map((prefix) => ({
        reference: { $regex: `^${prefix}\\d+`, $options: "i" }
      }));
      matchConditions.$or = regexFilters;
    }

    // Initial filtering from Registry
    pipeline.push({ $match: matchConditions });

    // Join with metaltransactions collection
    pipeline.push({
      $lookup: {
        from: "metaltransactions",
        localField: "metalTransactionId",
        foreignField: "_id",
        as: "metalTxnInfo",
      },
    });

    // Join with entries collection
    pipeline.push({
      $lookup: {
        from: "entries",
        localField: "EntryTransactionId",
        foreignField: "_id",
        as: "entryInfo",
      },
    });

    // Join with fundtransfers collection
    pipeline.push({
      $lookup: {
        from: "fundtransfers",
        localField: "TransferTransactionId",
        foreignField: "_id",
        as: "transferInfo",
      },
    });

    // Join with inventorylogs collection
    pipeline.push({
      $lookup: {
        from: "inventorylogs",
        localField: "InventoryLogID",
        foreignField: "_id",
        as: "inventoryLog",
      },
    });

    // Unwind arrays
    pipeline.push({
      $unwind: { path: "$metalTxnInfo", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$entryInfo", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$transferInfo", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$inventoryLog", preserveNullAndEmptyArrays: true },
    });

    // Join with accounts for metal transactions
    pipeline.push({
      $lookup: {
        from: "accounts",
        localField: "metalTxnInfo.partyCode",
        foreignField: "_id",
        as: "metalPartyDetails",
      },
    });
    pipeline.push({
      $unwind: { path: "$metalPartyDetails", preserveNullAndEmptyArrays: true },
    });

    // Join with accounts for entries
    pipeline.push({
      $lookup: {
        from: "accounts",
        localField: "entryInfo.party",
        foreignField: "_id",
        as: "entryPartyDetails",
      },
    });
    pipeline.push({
      $unwind: { path: "$entryPartyDetails", preserveNullAndEmptyArrays: true },
    });

    // Apply transaction type filtering
    if (filters.transactionType && filters.transactionType !== "all") {
      const transactionTypeMatch = {};
      switch (filters.transactionType.toLowerCase()) {
        case "sales":
        case "sale":
          transactionTypeMatch["metalTxnInfo.transactionType"] = "sale";
          break;
        case "sales return":
        case "sale return":
        case "salereturn":
          transactionTypeMatch["metalTxnInfo.transactionType"] = "saleReturn";
          break;
        case "net sales":
          transactionTypeMatch["metalTxnInfo.transactionType"] = {
            $in: ["sale", "saleReturn"],
          };
          break;
        case "purchase":
          transactionTypeMatch["metalTxnInfo.transactionType"] = "purchase";
          break;
        case "purchase return":
        case "purchasereturn":
          transactionTypeMatch["metalTxnInfo.transactionType"] = "purchaseReturn";
          break;
        case "net purchases":
          transactionTypeMatch["metalTxnInfo.transactionType"] = {
            $in: ["purchase", "purchaseReturn"],
          };
          break;
        case "receipts":
        case "metal-receipt":
          transactionTypeMatch["entryInfo.type"] = "metal-receipt";
          break;
        case "payment":
        case "payments":
        case "metal-payment":
          transactionTypeMatch["entryInfo.type"] = "metal-payment";
          break;
      }
      if (Object.keys(transactionTypeMatch).length > 0) {
        pipeline.push({ $match: transactionTypeMatch });
      }
    }

    // Add account type (party) filter
    if (filters.accountType && filters.accountType.length > 0) {
      const partyIds = filters.accountType.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      pipeline.push({
        $match: {
          $or: [
            { "metalTxnInfo.partyCode": { $in: partyIds } },
            { "entryInfo.party": { $in: partyIds } },
          ],
        },
      });
    }

    // Unwind stockItems from metal transactions
    pipeline.push({
      $unwind: {
        path: "$metalTxnInfo.stockItems",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Unwind stocks from entries
    pipeline.push({
      $unwind: {
        path: "$entryInfo.stocks",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Join with metalstocks collection
    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "metalTxnInfo.stockItems.stockCode",
        foreignField: "_id",
        as: "stockDetails",
      },
    });

    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "inventoryLog.stockCode",
        foreignField: "_id",
        as: "inventoryStock",
      },
    });

    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "entryInfo.stockItems.stock",
        foreignField: "_id",
        as: "entryStockDetails",
      },
    });

    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "metalId",
        foreignField: "_id",
        as: "directStockDetails",
      },
    });

    // Unwind stockDetails arrays
    pipeline.push({
      $unwind: { path: "$stockDetails", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$entryStockDetails", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$inventoryStock", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: {
        path: "$directStockDetails",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Filter by stock if provided
    if (filters.stock && filters.stock.length > 0) {
      const stockIds = filters.stock.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      pipeline.push({
        $match: {
          $or: [
            { "stockDetails._id": { $in: stockIds } },
            { "inventoryStock._id": { $in: stockIds } },
            { "entryStockDetails._id": { $in: stockIds } },
            { "directStockDetails._id": { $in: stockIds } },
            { metalId: { $in: stockIds } },
          ],
        },
      });
    }

    // Filter by karat if provided
    if (filters.karat && filters.karat.length > 0) {
      const karatIds = filters.karat.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      pipeline.push({
        $lookup: {
          from: "karatmasters",
          localField: "stockDetails.karat",
          foreignField: "_id",
          as: "karatDetails",
        },
      });
      pipeline.push({
        $match: {
          $or: [
            { "karatDetails._id": { $in: karatIds } },
            { "entryStockDetails.karat": { $in: karatIds } },
            { "directStockDetails.karat": { $in: karatIds } },
          ],
        },
      });
      pipeline.push({
        $unwind: { path: "$karatDetails", preserveNullAndEmptyArrays: true },
      });
    }

    // Filter by division if provided
    if (filters.division && filters.division.length > 0) {
      const divisionIds = filters.division.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      pipeline.push({
        $lookup: {
          from: "divisionmasters",
          localField: "stockDetails.metalType",
          foreignField: "_id",
          as: "divisionDetails",
        },
      });
      pipeline.push({
        $match: {
          $or: [
            { "divisionDetails._id": { $in: divisionIds } },
            { "entryStockDetails.metalType": { $in: divisionIds } },
            { "directStockDetails.metalType": { $in: divisionIds } },
          ],
        },
      });
      pipeline.push({
        $unwind: { path: "$divisionDetails", preserveNullAndEmptyArrays: true },
      });
    }

    // Join with admins for salesman details
    pipeline.push({
      $lookup: {
        from: "admins",
        localField: "createdBy",
        foreignField: "_id",
        as: "salesmanDetails",
      },
    });

    // Unwind salesmanDetails
    pipeline.push({
      $unwind: { path: "$salesmanDetails", preserveNullAndEmptyArrays: true },
    });

    // Project required fields
    pipeline.push({
      $project: {
        VocDate: "$transactionDate",
        VocType: {
          $ifNull: [
            "$metalTxnInfo.voucherType",
            "$entryInfo.type",
            "$entryInfo.voucherCode",
            "$inventoryLog.voucherType",
            "$voucherType",
            "N/A",
          ],
        },
        VocNo: {
          $ifNull: ["$metalTxnInfo.voucherNumber", "$reference", "N/A"],
        },
        StockCode: {
          $ifNull: [
            "$stockDetails.code",
            "$entryStockDetails.code",
            "$inventoryStock.code",
            "$directStockDetails.code",
            "N/A",
          ],
        },
        Users: { $ifNull: ["$salesmanDetails.name", "N/A"] },
        Account: {
          $ifNull: [
            "$metalPartyDetails.customerName",
            "$entryPartyDetails.customerName",
            "N/A",
          ],
        },
        Pcs: {
          $ifNull: [
            "$metalTxnInfo.stockItems.pieces",
            "$entryInfo.stocks.pieces",
            0,
          ],
        },
        Weight: {
          $ifNull: [
            "$grossWeight",
            "$metalTxnInfo.stockItems.grossWeight",
            "$entryInfo.totalAmount",
            0,
          ],
        },
        Rate: {
          $ifNull: ["$metalTxnInfo.stockItems.metalRateRequirements.rate", 0],
        },
        "Premium/Discount": {
          $ifNull: ["$metalTxnInfo.stockItems.premium.amount", 0],
        },
        NetAmount: {
          $ifNull: [
            "$metalTxnInfo.stockItems.itemTotal.itemTotalAmount",
            "$value",
            0,
          ],
        },
      },
    });

    // Group by StockCode to structure the output
    pipeline.push({
      $group: {
        _id: "$StockCode",
        transactions: {
          $push: {
            VocDate: "$VocDate",
            VocType: "$VocType",
            VocNo: "$VocNo",
            Users: "$Users",
            Account: "$Account",
            Pcs: "$Pcs",
            Weight: "$Weight",
            Rate: "$Rate",
            "Premium/Discount": "$Premium/Discount",
            NetAmount: "$NetAmount",
          },
        },
      },
    });

    // Project to reshape the output
    pipeline.push({
      $project: {
        _id: 0,
        StockCode: "$_id",
        Transactions: "$transactions",
      },
    });

    // Sort by StockCode
    pipeline.push({
      $sort: {
        StockCode: 1,
      },
    });

    return pipeline;
  }

  buildStockMovementPipeline(filters) {

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
      const regexFilters = filters.voucher.map(v => new RegExp(`^${v.prefix}`, "i"));
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
        as: "karatDetails"
      }
    });

    // Unwind the karatDetails array
    pipeline.push({
      $unwind: {
        path: "$karatDetails",
        preserveNullAndEmptyArrays: true
      }
    });

    if (filters.groupByRange?.karat?.length) {
      pipeline.push({
        $match: {
          "stockDetails.karat": { $in: filters.groupByRange.karat }
        }
      });
    }

    if (filters.division?.length) {
      pipeline.push({
        $match: {
          "karatDetails.division": { $in: filters.division }
        }
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
                  { case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" }
                ],
                default: 0
              }
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
                      { case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" }
                    ],
                    default: 0
                  }
                },
                "$karatDetails.standardPurity"
              ]
            }
          }
        },
        metalReceipt: {
          $push: {
            pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
            grossWeight: {
              $switch: {
                branches: [
                  { case: { $eq: ["$transactionType", "metalReceipt"] }, then: "$grossWeight" },
                ],
                default: 0
              }
            },
          }
        },
        openingBalance: {
          $push: {
            pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
            grossWeight: {
              $switch: {
                branches: [
                  { case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" },
                ],
                default: 0
              }
            },
          }
        },
        metalPayment: {
          $push: {
            pcs: { $cond: [{ $eq: ["$pcs", true] }, 1, 0] },
            grossWeight: {
              $switch: {
                branches: [
                  { case: { $eq: ["$transactionType", "metalPayment"] }, then: "$grossWeight" },
                ],
                default: 0
              }
            },
          }
        }
      },
    });

    // Project to reshape the result
    pipeline.push({
      $project: {
        stockId: 1,
        code: 1,
        purity: 1,
        description: 1,
        totalValue: 1,
        pcs: 1,
        opening: {
          grossWeight: { $sum: "$openingBalance.grossWeight" },
          pcs: { $sum: "$weightData.pcs" },
        },
        Weight: {
          pcs: { $sum: "$weightData.pcs" },
          grossWeight: { $sum: "$weightData.grossWeight" },
          pureWeight: { $sum: "$weightData.pureWeight" },
          net: { $sum: "$weightData.pureWeight" },
        },
        netPurchase: {
          pcs: null,
          grossWeight: { $sum: "$weightData.grossWeight" }
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

    // Optional: remove entries with all zero values
    pipeline.push({
      $match: {
        $or: [
          { "opening.grossWeight": { $ne: 0 } },
          { "Weight.grossWeight": { $ne: 0 } },
          { "payment.grossWeight": { $ne: 0 } },
          { "receipt.grossWeight": { $ne: 0 } },
          { "closing.grossWeight": { $ne: 0 } },
        ],
      },
    });

    return pipeline;
  }

  buildStockPipeline(filters) {
    const pipeline = [];
    const matchConditions = {};

    // Date filter - support asOnDate for stock balance as of a specific date
    if (filters.asOnDate) {
      // If asOnDate is provided, fetch all records up to and including that date
      matchConditions.voucherDate = {
        $lte: new Date(filters.asOnDate)
      };
    } else if (filters.startDate || filters.endDate) {
      // Otherwise use date range if provided
      matchConditions.voucherDate = {};
      if (filters.startDate) {
        matchConditions.voucherDate.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        matchConditions.voucherDate.$lte = new Date(filters.endDate);
      }
    }

    // Transaction type filter
    if (filters.transactionType && filters.transactionType !== 'All') {
      matchConditions.transactionType = filters.transactionType;
    }

    // Stock code filter from groupByRange
    if (filters.groupByRange?.stockCode?.length) {
      matchConditions.stockCode = {
        $in: filters.groupByRange.stockCode.map(id => new ObjectId(id))
      };
    }

    // Voucher filter
    if (filters.voucher?.length) {
      const regexFilters = filters.voucher.map(v => new RegExp(`^${v.prefix}`, "i"));
      matchConditions.voucherCode = { $in: regexFilters };
    }

    pipeline.push({ $match: matchConditions });

    // Lookup stock details from metalstocks collection
    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "stockCode",
        foreignField: "_id",
        as: "stock",
      },
    });

    // Unwind the stock array
    pipeline.push({
      $unwind: {
        path: "$stock",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Apply MetalStock filters from groupByRange
    const stockMatchConditions = {};
    
    if (filters.groupByRange?.categoryCode?.length) {
      stockMatchConditions["stock.category"] = { $in: filters.groupByRange.categoryCode };
    }
    
    if (filters.groupByRange?.karat?.length) {
      stockMatchConditions["stock.karat"] = { $in: filters.groupByRange.karat };
    }
    
    if (filters.groupByRange?.type?.length) {
      stockMatchConditions["stock.type"] = { $in: filters.groupByRange.type };
    }
    
    if (filters.groupByRange?.size?.length) {
      stockMatchConditions["stock.size"] = { $in: filters.groupByRange.size };
    }
    
    if (filters.groupByRange?.color?.length) {
      stockMatchConditions["stock.color"] = { $in: filters.groupByRange.color };
    }
    
    if (filters.groupByRange?.brand?.length) {
      stockMatchConditions["stock.brand"] = { $in: filters.groupByRange.brand };
    }

    if (Object.keys(stockMatchConditions).length > 0) {
      pipeline.push({ $match: stockMatchConditions });
    }

    // Lookup karat details for purity
    pipeline.push({
      $lookup: {
        from: "karatmasters",
        localField: "stock.karat",
        foreignField: "_id",
        as: "karatDetails",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$karatDetails",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Division filter (use MetalStock.metalType)
    if (filters.division?.length) {
      pipeline.push({
        $match: {
          "stock.metalType": { $in: filters.division },
        },
      });
    }

    const normalizeGroupByKey = (key) => {
      if (key === "category") return "categoryCode";
      return key;
    };

    const groupBy = Array.isArray(filters.groupBy) && filters.groupBy.length
      ? filters.groupBy.map(normalizeGroupByKey)
      : ["stockCode"];

    const signedGrossWeightExpr = {
      $switch: {
        branches: [
          { case: { $eq: ["$transactionType", "sale"] }, then: { $multiply: ["$grossWeight", -1] } },
          { case: { $eq: ["$transactionType", "exportSale"] }, then: { $multiply: ["$grossWeight", -1] } },
          { case: { $eq: ["$transactionType", "metalPayment"] }, then: { $multiply: ["$grossWeight", -1] } },
          { case: { $eq: ["$transactionType", "purchaseReturn"] }, then: { $multiply: ["$grossWeight", -1] } },
          { case: { $eq: ["$transactionType", "importPurchaseReturn"] }, then: { $multiply: ["$grossWeight", -1] } },
          { case: { $eq: ["$transactionType", "saleReturn"] }, then: "$grossWeight" },
          { case: { $eq: ["$transactionType", "exportSaleReturn"] }, then: "$grossWeight" },
          { case: { $eq: ["$transactionType", "purchase"] }, then: "$grossWeight" },
          { case: { $eq: ["$transactionType", "importPurchase"] }, then: "$grossWeight" },
          { case: { $eq: ["$transactionType", "metalReceipt"] }, then: "$grossWeight" },
          { case: { $eq: ["$transactionType", "opening"] }, then: "$grossWeight" },
          { case: { $eq: ["$transactionType", "initial"] }, then: "$grossWeight" },
        ],
        default: 0,
      },
    };

    const signedPcsExpr = {
      $switch: {
        branches: [
          { case: { $eq: ["$transactionType", "sale"] }, then: { $multiply: ["$pcs", -1] } },
          { case: { $eq: ["$transactionType", "exportSale"] }, then: { $multiply: ["$pcs", -1] } },
          { case: { $eq: ["$transactionType", "metalPayment"] }, then: { $multiply: ["$pcs", -1] } },
          { case: { $eq: ["$transactionType", "purchaseReturn"] }, then: { $multiply: ["$pcs", -1] } },
          { case: { $eq: ["$transactionType", "importPurchaseReturn"] }, then: { $multiply: ["$pcs", -1] } },
          { case: { $eq: ["$transactionType", "saleReturn"] }, then: "$pcs" },
          { case: { $eq: ["$transactionType", "exportSaleReturn"] }, then: "$pcs" },
          { case: { $eq: ["$transactionType", "purchase"] }, then: "$pcs" },
          { case: { $eq: ["$transactionType", "importPurchase"] }, then: "$pcs" },
          { case: { $eq: ["$transactionType", "metalReceipt"] }, then: "$pcs" },
          { case: { $eq: ["$transactionType", "opening"] }, then: "$pcs" },
        ],
        default: 0,
      },
    };

    const dimensionsNeedingLookup = new Set(groupBy);
    if (filters.groupByRange?.karat?.length === 1) dimensionsNeedingLookup.add("karat");
    if (filters.groupByRange?.categoryCode?.length === 1) dimensionsNeedingLookup.add("categoryCode");
    if (filters.groupByRange?.type?.length === 1) dimensionsNeedingLookup.add("type");
    if (filters.groupByRange?.size?.length === 1) dimensionsNeedingLookup.add("size");
    if (filters.groupByRange?.color?.length === 1) dimensionsNeedingLookup.add("color");
    if (filters.groupByRange?.brand?.length === 1) dimensionsNeedingLookup.add("brand");

    if (dimensionsNeedingLookup.has("categoryCode")) {
      pipeline.push({
        $lookup: {
          from: "maincategories",
          localField: "stock.category",
          foreignField: "_id",
          as: "categoryDetails",
        },
      });
      pipeline.push({
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    if (dimensionsNeedingLookup.has("type")) {
      pipeline.push({
        $lookup: {
          from: "types",
          localField: "stock.type",
          foreignField: "_id",
          as: "typeDetails",
        },
      });
      pipeline.push({
        $unwind: {
          path: "$typeDetails",
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    if (dimensionsNeedingLookup.has("size")) {
      pipeline.push({
        $lookup: {
          from: "sizes",
          localField: "stock.size",
          foreignField: "_id",
          as: "sizeDetails",
        },
      });
      pipeline.push({
        $unwind: {
          path: "$sizeDetails",
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    if (dimensionsNeedingLookup.has("color")) {
      pipeline.push({
        $lookup: {
          from: "colors",
          localField: "stock.color",
          foreignField: "_id",
          as: "colorDetails",
        },
      });
      pipeline.push({
        $unwind: {
          path: "$colorDetails",
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    if (dimensionsNeedingLookup.has("brand")) {
      pipeline.push({
        $lookup: {
          from: "brands",
          localField: "stock.brand",
          foreignField: "_id",
          as: "brandDetails",
        },
      });
      pipeline.push({
        $unwind: {
          path: "$brandDetails",
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    const groupId = {};
    const groupDimensionAcc = {};
    const groupDimensionProject = {};

    const addDimension = (dim) => {
      if (dim === "stockCode") {
        groupId.stockCode = "$stockCode";
        groupDimensionAcc.stockCodeInfo = {
          $first: {
            _id: "$stock._id",
            code: "$stock.code",
            description: "$stock.description",
          },
        };
        groupDimensionProject.stockCode = "$stockCodeInfo";
        return;
      }

      if (dim === "categoryCode") {
        groupId.categoryCode = "$stock.category";
        groupDimensionAcc.categoryCodeInfo = {
          $first: {
            _id: "$categoryDetails._id",
            code: "$categoryDetails.code",
            description: "$categoryDetails.description",
          },
        };
        groupDimensionProject.categoryCode = "$categoryCodeInfo";
        return;
      }

      if (dim === "karat") {
        groupId.karat = "$stock.karat";
        groupDimensionAcc.karatInfo = {
          $first: {
            _id: "$karatDetails._id",
            code: "$karatDetails.karatCode",
            description: "$karatDetails.description",
          },
        };
        groupDimensionProject.karat = "$karatInfo";
        return;
      }

      if (dim === "type") {
        groupId.type = "$stock.type";
        groupDimensionAcc.typeInfo = {
          $first: {
            _id: "$typeDetails._id",
            code: "$typeDetails.code",
            description: "$typeDetails.description",
          },
        };
        groupDimensionProject.type = "$typeInfo";
        return;
      }

      if (dim === "size") {
        groupId.size = "$stock.size";
        groupDimensionAcc.sizeInfo = {
          $first: {
            _id: "$sizeDetails._id",
            code: "$sizeDetails.code",
            description: "$sizeDetails.description",
          },
        };
        groupDimensionProject.size = "$sizeInfo";
        return;
      }

      if (dim === "color") {
        groupId.color = "$stock.color";
        groupDimensionAcc.colorInfo = {
          $first: {
            _id: "$colorDetails._id",
            code: "$colorDetails.code",
            description: "$colorDetails.description",
          },
        };
        groupDimensionProject.color = "$colorInfo";
        return;
      }

      if (dim === "brand") {
        groupId.brand = "$stock.brand";
        groupDimensionAcc.brandInfo = {
          $first: {
            _id: "$brandDetails._id",
            code: "$brandDetails.code",
            description: "$brandDetails.description",
          },
        };
        groupDimensionProject.brand = "$brandInfo";
      }
    };

    [...dimensionsNeedingLookup].forEach(addDimension);

    // Group dynamically based on groupBy
    pipeline.push({
      $group: {
        _id: groupBy.length === 1 ? groupId[groupBy[0]] : groupId,
        ...groupDimensionAcc,

        stocks: {
          $addToSet: {
            _id: "$stock._id",
            code: "$stock.code",
            description: "$stock.description",
          },
        },

        // Net gross weight and pcs
        totalGrossWeight: { $sum: signedGrossWeightExpr },
        totalPcs: { $sum: signedPcsExpr },

        // Net pure weight based on MetalStock.standardPurity (decimal)
        totalPureWeight: {
          $sum: {
            $multiply: [
              signedGrossWeightExpr,
              { $ifNull: ["$stock.standardPurity", 0] },
            ],
          },
        },

        // Making totals (purchase-like only)
        makingGrossWeight: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$transactionType",
                  ["purchase", "importPurchase", "saleReturn", "exportSaleReturn"],
                ],
              },
              "$grossWeight",
              0,
            ],
          },
        },
        totalMakingAmount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$transactionType",
                  ["purchase", "importPurchase", "saleReturn", "exportSaleReturn"],
                ],
              },
              "$avgMakingAmount",
              0,
            ],
          },
        },
      },
    });

    const primaryGroupKey = groupBy[0];
    const primaryInfoPathByKey = {
      stockCode: "$stockCodeInfo",
      categoryCode: "$categoryCodeInfo",
      karat: "$karatInfo",
      type: "$typeInfo",
      size: "$sizeInfo",
      color: "$colorInfo",
      brand: "$brandInfo",
    };

    const primaryInfoPath = primaryInfoPathByKey[primaryGroupKey] || "$stockCodeInfo";

    pipeline.push({
      $project: {
        _id: 0,
        group: groupDimensionProject,

        groupKey: primaryGroupKey,
        groupId: { $ifNull: [`${primaryInfoPath}._id`, null] },
        code: { $ifNull: [`${primaryInfoPath}.code`, null] },
        description: { $ifNull: [`${primaryInfoPath}.description`, null] },

        stockCode: { $ifNull: ["$stockCodeInfo.code", null] },
        metalId: { $ifNull: ["$stockCodeInfo._id", null] },

        stocks: {
          $filter: {
            input: "$stocks",
            as: "s",
            cond: { $ne: ["$$s._id", null] },
          },
        },
        stocksCount: {
          $size: {
            $filter: {
              input: "$stocks",
              as: "s",
              cond: { $ne: ["$$s._id", null] },
            },
          },
        },

        grossWeight: "$totalGrossWeight",
        pcs: "$totalPcs",

        pureWeight: "$totalPureWeight",
        purity: {
          $cond: [
            { $ne: ["$totalGrossWeight", 0] },
            { $divide: ["$totalPureWeight", "$totalGrossWeight"] },
            0,
          ],
        },

        avgMakingRate: {
          $cond: [
            { $gt: ["$makingGrossWeight", 0] },
            { $divide: ["$totalMakingAmount", "$makingGrossWeight"] },
            0,
          ],
        },

        avgMakingAmount: {
          $cond: [
            { $gt: ["$makingGrossWeight", 0] },
            {
              $multiply: [
                { $divide: ["$totalMakingAmount", "$makingGrossWeight"] },
                "$totalGrossWeight",
              ],
            },
            0,
          ],
        },
      },
    });

    // Filter out entries with zero gross weight
    pipeline.push({
      $match: {
        grossWeight: { $ne: 0 },
      },
    });

    // Sort by stock code
    pipeline.push({
      $sort: {
        code: 1,
      },
    });

    return pipeline;
  }

  buildTransactionSummaryPipeline(filters) {

    const pipeline = [];

    // Step 1: Base match condition
    const matchConditions = {
      isActive: true,
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


    // Step 3: Include documents where at least one type of transaction exists
    matchConditions.$or = [
      { metalTransactionId: { $exists: true, $ne: null } },
      { EntryTransactionId: { $exists: true, $ne: null } },
      { TransferTransactionId: { $exists: true, $ne: null } },
    ];

    // Step 4: Apply the match
    pipeline.push({ $match: matchConditions });

    if (filters.voucher?.length > 0) {
      const regexFilters = filters.voucher.map((v) => {
        const prefix = v.prefix || v; // if object use v.prefix, else string
        return {
          reference: { $regex: `^${prefix}\\d+$`, $options: "i" },
        };
      });

      pipeline.push({ $match: { $or: regexFilters } });
    }

    // Step 5: Lookup related collections

    // 5a: Lookup metalTransaction data
    pipeline.push({
      $lookup: {
        from: "metaltransactions",
        localField: "metalTransactionId",
        foreignField: "_id",
        as: "metaltransactions",
      },
    });

    // 5b: Lookup entries (e.g., purchase or manual entry records)
    pipeline.push({
      $lookup: {
        from: "entries",
        localField: "EntryTransactionId",
        foreignField: "_id",
        as: "entries",
      },
    });

    // 5c: Lookup fund transfers
    pipeline.push({
      $lookup: {
        from: "fundtransfers",
        localField: "TransferTransactionId",
        foreignField: "_id",
        as: "fundtransfers",
      },
    });

    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "metaltransactions.stockItems.stockCode",
        foreignField: "_id",
        as: "MetalTransactionMetalStock",
      },
    });

    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "entries.stocks.stock",
        foreignField: "_id",
        as: "entriesMetalStock",
      },
    });

    // Step 6: Unwind joined data (preserve null for optional relationships)
    pipeline.push({
      $unwind: { path: "$metaltransactions", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$entries", preserveNullAndEmptyArrays: true },
    });
    pipeline.push({
      $unwind: { path: "$fundtransfers", preserveNullAndEmptyArrays: true },
    });

    // Step 7: Filter by transactionType if provided
    if (filters.transactionType && filters.transactionType !== "all") {
      pipeline.push({
        $match: {
          "metaltransactions.transactionType": filters.transactionType,
        },
      });
    }

    if (filters.groupByRange?.stockCode?.length > 0) {
      pipeline.push({
        $match: {
          $or: [
            { "entries.stocks.stock": { $in: filters.groupByRange.stockCode } },
            {
              "metaltransactions.stockItems.stockCode": {
                $in: filters.groupByRange.stockCode,
              },
            },
          ],
        },
      });
    }

    if (filters.groupByRange?.karat?.length > 0) {
      pipeline.push({
        $match: {
          $or: [
            { "metalInfo._id": { $in: filters.groupByRange.stockCode } },
            {
              "metalTxnInfo.stockItems.stockCode": {
                $in: filters.groupByRange.stockCode,
              },
            },
          ],
        },
      });
    }

    // Step 8: Unwind stockItems from metaltransactions
    pipeline.push({
      $unwind: {
        path: "$metaltransactions.stockItems",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 9: Lookup metalstocks for stock details
    pipeline.push({
      $lookup: {
        from: "metalstocks",
        localField: "metaltransactions.stockItems.stockCode",
        foreignField: "_id",
        as: "metaldetail",
      },
    });

    // Step 10: Unwind metaldetail
    pipeline.push({
      $unwind: {
        path: "$metaldetail",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 11: Lookup karat details (optional, as purity is available in stockItems)
    pipeline.push({
      $lookup: {
        from: "karatmasters",
        localField: "metaldetail.karat",
        foreignField: "_id",
        as: "karatDetails",
      },
    });

    // Step 12: Unwind karatDetails
    pipeline.push({
      $unwind: {
        path: "$karatDetails",
        preserveNullAndEmptyArrays: true,
      },
    });

    pipeline.push({
      $lookup: {
        from: "metalratemasters",
        localField: "metaltransactions.stockItems.metalRate",
        foreignField: "_id",
        as: "metalRate",
      },
    });

    // Step 12: Unwind karatDetails
    pipeline.push({
      $unwind: {
        path: "$metalRate",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 13: Project the required fields
    pipeline.push({
      $project: {
        transactionId: "$transactionId",
        reference: "$reference",
        description: "$description",
        pcs: { $ifNull: ["$metaltransactions.stockItems.pieces", 0] },
        code: { $ifNull: ["$metaldetail.code", 0] },
        grossWeight: {
          $ifNull: [
            "$grossWeight",
            "$metaltransactions.stockItems.grossWeight",
            0,
          ],
        },
        premium: {
          $ifNull: ["$metaltransactions.stockItems.premium.amount", 0],
        },
        makingCharge: {
          $ifNull: ["$metaltransactions.stockItems.makingCharges.amount", 0],
        },
        discount: { $literal: 0 }, // Explicitly set to 0 using $literal
        purity: {
          $ifNull: ["$purity", "$metaltransactions.stockItems.purity", 0],
        },
        pureWeight: {
          $ifNull: [
            "$pureWeight",
            "$metaltransactions.stockItems.pureWeight",
            0,
          ],
        },
        totalAmount: {
          $ifNull: [
            "$metaltransactions.totalAmountSession.totalAmountAED",
            "$entries.totalAmount",
            0,
          ],
        },
        metalValue: {
          $ifNull: [
            "$metaltransactions.stockItems.metalRateRequirements.rate",
            0,
          ],
        },
        _id: 0,
      },
    });

    if (filters.costFilter?.minAmount) {
      pipeline.push({
        $match: {
          totalAmount: { $gte: filters.costFilter.minAmount },
        },
      });
    }

    // Step 14: Group to calculate totals
    pipeline.push({
      $group: {
        _id: null,
        transactions: {
          $push: {
            transactionId: "$transactionId",
            reference: "$reference",
            description: "$description",
            pcs: "$pcs",
            code: "$code",
            grossWeight: "$grossWeight",
            premium: "$premium",
            discount: "$discount",
            purity: "$purity",
            pureWeight: "$pureWeight",
            metalValue: "$metalValue",
            makingCharge: "$makingCharge",
            total: "$totalAmount",
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

    // Step 15: Project the final output
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

    // Dynamically add conditions based on non-empty arrays
    if (filters.groupByRange?.stockCode?.length > 0) {
      groupByMatch["metalInfo.code"] = { $in: filters.groupByRange.stockCode };
    }

    if (filters.groupByRange?.categoryCode?.length > 0) {
      groupByMatch["metalInfo.category"] = {
        $in: filters.groupByRange.categoryCode,
      };
    }

    if (filters.groupByRange?.karat?.length > 0) {
      groupByMatch["metalInfo.karat"] = { $in: filters.groupByRange.karat };
    }

    if (filters.groupByRange?.type?.length > 0) {
      groupByMatch["metalInfo.type"] = { $in: filters.groupByRange.type };
    }

    if (filters.groupByRange?.size?.length > 0) {
      groupByMatch["metalInfo.size"] = { $in: filters.groupByRange.size };
    }

    if (filters.groupByRange?.color?.length > 0) {
      groupByMatch["metalInfo.color"] = { $in: filters.groupByRange.color };
    }

    if (filters.groupByRange?.brand?.length > 0) {
      groupByMatch["metalInfo.brand"] = { $in: filters.groupByRange.brand };
    }

    // Only push $match if any filter was added
    if (Object.keys(groupByMatch).length > 0) {
      pipeline.push({ $match: groupByMatch });
    }
    pipeline.push({
      $lookup: {
        from: "karatmasters",
        localField: "metalInfo.karat",
        foreignField: "_id",
        as: "karatDetails",
      },
    });

    pipeline.push({
      $group: {
        _id: {
          metalId: "$metalId",
          code: "$metalInfo.code",
          description: "$metalInfo.description",
          metalType: "$metalInfo.metalType",
          purity: "$purity",
        },
        metalName: { $first: "$metalInfo.code" },
        totalGrossWeight: { $sum: "$grossWeight" },
        totalPureWeight: { $sum: "$pureWeight" },

        totalCredit: { $sum: "$credit" },
        totalDebit: { $sum: "$debit" },

        // Smart pcsCount computation
        totalPcsCount: {
          $sum: {
            $cond: [
              { $eq: ["$metalInfo.pcs", true] },
              {
                $round: [
                  { $divide: ["$grossWeight", "$metalInfo.totalValue"] },
                  0,
                ],
              },
              0,
            ],
          },
        },
        logs: { $push: "$$ROOT" },
      },
    });

    // Conditionally filter based on transactionType
    if (filters.transactionType) {
      pipeline.push({
        $project: {
          metalId: "$_id.metalId",
          code: "$_id.code",
          description: "$_id.description",
          metalType: "$_id.metalType",
          purity: "$_id.purity",
          totalPcsCount: 1,
          totalGrossWeight: 1,
          totalPureWeight: 1,
          totalValue: 1,
          _id: 0,
        },
      });
    }
    return pipeline;
  }

  async getOpeningBalance(fromDate, filters) {
    try {
      if (!fromDate)
        throw new Error("From date is required to calculate opening balance");

      const startDate = new Date(fromDate);
      const year = startDate.getFullYear();
      const financialStart = new Date(`${year}-01-01T00:00:00.000Z`);

      const previousDay = new Date(startDate);
      previousDay.setDate(previousDay.getDate() - 1);
      previousDay.setHours(23, 59, 59, 999);

      if (previousDay < financialStart) {
        return { opening: 0 };
      }

      const pipeline = [
        {
          $match: {
            isActive: true,
            type: { $in: ["purchase-fixing", "sales-fixing"] },
            transactionDate: { $gte: financialStart, $lte: previousDay },
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
          $project: {
            type: 1,
            grossWeight: { $ifNull: ["$grossWeight", 0] },
            purityDiffWeight: {
              $cond: [
                { $eq: ["$metalTransaction.fixed", true] },
                { $ifNull: ["$metalTransaction.stockItems.purityDiffWeight", 0] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalPurchase: {
              $sum: {
                $cond: [{ $eq: ["$type", "purchase-fixing"] }, "$grossWeight", 0],
              },
            },
            totalSales: {
              $sum: {
                $cond: [{ $eq: ["$type", "sales-fixing"] }, "$grossWeight", 0],
              },
            },
            totalPurityDiff: { $sum: "$purityDiffWeight" },
          },
        },
        {
          $project: {
            _id: 0,
            netPurchase: { $subtract: ["$totalPurchase", "$totalSales"] },
            purityDifference: "$totalPurityDiff",
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      const data = result[0] || { netPurchase: 0, purityDifference: 0 };

      const opening = data.netPurchase + data.purityDifference;

      return { opening, ...data };
    } catch (error) {
      console.error("Error calculating opening balance:", error);
      throw new Error(`Failed to calculate opening balance: ${error.message}`);
    }
  }

  // New method for Own Stock Opening Balance (OFP only)
  async getOwnStockOpeningBalance(fromDate, filters) {
    try {
      if (!fromDate) return { opening: 0, purityDifference: 0, netPurchase: 0 };

      const startDate = uaeDateToUTC(fromDate, 'start');
      const previousDay = getPreviousDayEndInUTC(fromDate);

      const pipeline = [
        {
          $match: {
            isActive: true,
            type: "OPENING_FIXING_POSITION", // Match the exact type
            transactionDate: { $lte: previousDay },
          },
        },
        {
          $group: {
            _id: null,
            totalGoldCredit: { $sum: { $ifNull: ["$goldCredit", 0] } },
            totalGoldDebit: { $sum: { $ifNull: ["$goldDebit", 0] } },
            totalValue: { $sum: { $ifNull: ["$value", 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            opening: { $subtract: ["$totalGoldDebit", "$totalGoldCredit"] },
            openingValue: "$totalValue",
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      const data = result[0] || { opening: 0, openingValue: 0 };

      return {
        opening: data.opening || 0,
        openingValue: data.openingValue || 0,
        purityDifference: 0,
        netPurchase: 0,
      };
    } catch (error) {
      console.error("Error calculating own stock opening balance:", error);
      return { opening: 0, openingValue: 0, purityDifference: 0, netPurchase: 0 };
    }
  }





  getReceivablesAndPayables() {
    const pipeline = [
      {
        $facet: {
          receivables: [
            {
              $match: {
                "balances.goldBalance.totalGrams": { $gt: 0 }
              }
            },
            {
              $group: {
                _id: null,
                totalReceivableGrams: {
                  $sum: { $multiply: ["$balances.goldBalance.totalGrams", -1] }
                },
                accountCount: { $sum: 1 } // Count number of accounts
              }
            }
          ],
          payables: [
            {
              $match: {
                "balances.goldBalance.totalGrams": { $lt: 0 }
              }
            },
            {
              $group: {
                _id: null,
                totalPayableGrams: {
                  $sum: { $abs: "$balances.goldBalance.totalGrams" }
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

  // Get MetalTransaction data grouped by transactionType
  // IMPORTANT: This method is Registry-based - only includes MetalTransaction records that have matching Registry entries
  // Filters Registry by type "purchase-fixing" or "sales-fixing" with valid metalTransactionId
  // Then matches to MetalTransaction collection to get transaction details
  async getOwnStockMetalTransactions(filters) {
    try {
      const matchConditions = {
        isActive: true,
      };

      // Only add date filter if dates are provided
      if (filters.startDate || filters.endDate) {
        matchConditions.transactionDate = {};
        if (filters.startDate) {
          matchConditions.transactionDate.$gte = filters.startDate;
        }
        if (filters.endDate) {
          matchConditions.transactionDate.$lte = filters.endDate;
        }
      }

      // Apply voucher filter if provided
      let voucherMatch = {};
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        voucherMatch = { $or: regexFilters };
      }

      // Determine type filter and fixed filter based on excludeHedging
      // excludeHedging: true = only show fixed=true transactions (exclude hedging/unfixed)
      // excludeHedging: false = show all transactions (include hedging/unfixed)
      // Handle both boolean and string values
      const excludeHedgingValue = filters.excludeHedging;
      const shouldFilterByFixed = excludeHedgingValue === true || excludeHedgingValue === "true";
      const registryTypes = ["purchase-fixing", "sales-fixing"];
      
      // Debug logging
      console.log("=== getOwnStockMetalTransactions DEBUG ===");
      console.log("excludeHedging raw value:", excludeHedgingValue, "type:", typeof excludeHedgingValue);
      console.log("shouldFilterByFixed:", shouldFilterByFixed);
      console.log("===========================================");
      
      const pipeline = [
        // Step 1: Match Registry by date, voucher, and type
        {
          $match: {
            ...matchConditions,
            ...voucherMatch,
            type: { $in: registryTypes },
            metalTransactionId: { $exists: true, $ne: null },
          },
        },
        // Step 2: Lookup MetalTransaction
        {
          $lookup: {
            from: "metaltransactions",
            localField: "metalTransactionId",
            foreignField: "_id",
            as: "metalTransaction",
          },
        },
        {
          $unwind: {
            path: "$metalTransaction",
            preserveNullAndEmptyArrays: false,
          },
        },
      ];

      // Step 3: Conditionally filter by fixed=true only when excludeHedging is true
      // When excludeHedging is true, only show fixed transactions (exclude hedging/unfixed)
      // When excludeHedging is false, show all transactions (include hedging/unfixed)
      if (shouldFilterByFixed) {
        console.log("✓ Adding fixed=true filter to pipeline (excluding hedging/unfixed)");
        pipeline.push({
          $match: {
            "metalTransaction.fixed": true,
          },
        });
      } else {
        console.log("✗ NOT adding fixed filter - will show ALL transactions (fixed and unfixed)");
      }

      // Step 4: Group by transactionType category
      // Note: No $unwind on stockItems needed since we're using Registry-level fields
      // (goldCredit, goldDebit, cashCredit, cashDebit) which are transaction-level, not stockItem-level
      pipeline.push({
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $in: ["$metalTransaction.transactionType", ["purchase", "importPurchase"]] }, then: "purchase" },
                { case: { $in: ["$metalTransaction.transactionType", ["purchaseReturn", "importPurchaseReturn"]] }, then: "purchaseReturn" },
                { case: { $in: ["$metalTransaction.transactionType", ["sale", "exportSale"]] }, then: "sale" },
                { case: { $in: ["$metalTransaction.transactionType", ["saleReturn", "exportSaleReturn"]] }, then: "saleReturn" },
              ],
              default: "other",
            },
          },
          totalGold: {
            $sum: {
              $switch: {
                branches: [
                  // Purchase: goldCredit increases stock
                  { case: { $in: ["$metalTransaction.transactionType", ["purchase", "importPurchase"]] }, then: { $ifNull: ["$goldCredit", 0] } },
                  // Purchase Return: goldDebit decreases stock (negative)
                  { case: { $in: ["$metalTransaction.transactionType", ["purchaseReturn", "importPurchaseReturn"]] }, then: { $multiply: [{ $ifNull: ["$goldDebit", 0] }, -1] } },
                  // Sale: goldDebit decreases stock (negative)
                  { case: { $in: ["$metalTransaction.transactionType", ["sale", "exportSale"]] }, then: { $multiply: [{ $ifNull: ["$goldDebit", 0] }, -1] } },
                  // Sale Return: goldCredit increases stock
                  { case: { $in: ["$metalTransaction.transactionType", ["saleReturn", "exportSaleReturn"]] }, then: { $ifNull: ["$goldCredit", 0] } },
                ],
                default: 0,
              },
            },
          },
          totalValue: {
            $sum: {
              $switch: {
                branches: [
                  // Purchase: cashDebit is the cost (positive)
                  { case: { $in: ["$metalTransaction.transactionType", ["purchase", "importPurchase"]] }, then: { $ifNull: ["$cashDebit", 0] } },
                  // Purchase Return: cashCredit is refund (negative)
                  { case: { $in: ["$metalTransaction.transactionType", ["purchaseReturn", "importPurchaseReturn"]] }, then: { $multiply: [{ $ifNull: ["$cashCredit", 0] }, -1] } },
                  // Sale: cashCredit is revenue (negative for net calculation)
                  { case: { $in: ["$metalTransaction.transactionType", ["sale", "exportSale"]] }, then: { $multiply: [{ $ifNull: ["$cashCredit", 0] }, -1] } },
                  // Sale Return: cashDebit is refund (positive)
                  { case: { $in: ["$metalTransaction.transactionType", ["saleReturn", "exportSaleReturn"]] }, then: { $ifNull: ["$cashDebit", 0] } },
                ],
                default: 0,
              },
            },
          },
        },
      });

      pipeline.push({
        $project: {
          _id: 0,
          category: "$_id",
          totalGold: 1,
          totalValue: 1,
        },
      });

      // Filter out "other" category
      pipeline.push({
        $match: {
          category: { $ne: "other" },
        },
      });

      const result = await Registry.aggregate(pipeline);
      return result;
    } catch (error) {
      console.error("Error getting metal transactions:", error);
      return [];
    }
  }

  // Get Purchase Fix / Sale Fix from TransactionFixing
  // IMPORTANT: This method is Registry-based - only includes TransactionFixing records that have matching Registry entries
  // Filters Registry by type "purchase-fixing" or "sales-fixing" with valid fixingTransactionId
  // Then matches to TransactionFixing collection to validate the transaction exists
  async getOwnStockFixingTransactions(filters) {
    try {
      const matchConditions = {
        isActive: true,
      };

      // Only add date filter if dates are provided
      if (filters.startDate || filters.endDate) {
        matchConditions.transactionDate = {};
        if (filters.startDate) {
          matchConditions.transactionDate.$gte = filters.startDate;
        }
        if (filters.endDate) {
          matchConditions.transactionDate.$lte = filters.endDate;
        }
      }

      // Apply voucher filter if provided
      let voucherMatch = {};
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        voucherMatch = { $or: regexFilters };
      }

      const pipeline = [
        {
          $match: {
            ...matchConditions,
            ...voucherMatch,
            type: { $in: ["purchase-fixing", "sales-fixing"] },
            fixingTransactionId: { $exists: true, $ne: null }, // Only include Registry entries with valid fixingTransactionId
          },
        },
        {
          $lookup: {
            from: "transactionfixings",
            localField: "fixingTransactionId",
            foreignField: "_id",
            as: "transactionFixing",
          },
        },
        {
          $unwind: {
            path: "$transactionFixing",
            preserveNullAndEmptyArrays: false, // Only include Registry entries that have matching TransactionFixing
          },
        },
        {
          $group: {
            _id: "$type",
            totalGold: {
              $sum: {
                // Calculate: goldCredit - goldDebit
                $subtract: [
                  { $ifNull: ["$goldCredit", 0] },
                  { $ifNull: ["$goldDebit", 0] }
                ]
              },
            },
            totalValue: {
              $sum: {
                // Calculate: cashDebit - cashCredit
                $subtract: [
                  { $ifNull: ["$cashDebit", 0] },
                  { $ifNull: ["$cashCredit", 0] }
                ]
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            category: {
              $cond: [
                { $eq: ["$_id", "purchase-fixing"] },
                "purchaseFix",
                "saleFix",
              ],
            },
            totalGold: 1,
            totalValue: 1,
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      return result;
    } catch (error) {
      console.error("Error getting fixing transactions:", error);
      return [];
    }
  }


  // Get Purchase Fix / Sale Fix from TransactionFixing
  // IMPORTANT: This method is Registry-based - only includes TransactionFixing records that have matching Registry entries
  // Filters Registry by type "purchase-fixing" or "sales-fixing" with valid fixingTransactionId
  // Then matches to TransactionFixing collection to validate the transaction exists
  async getOwnStockFixingTransactions(filters) {
    try {
      const matchConditions = {
        isActive: true,
      };

      // Only add date filter if dates are provided
      if (filters.startDate || filters.endDate) {
        matchConditions.transactionDate = {};
        if (filters.startDate) {
          matchConditions.transactionDate.$gte = filters.startDate;
        }
        if (filters.endDate) {
          matchConditions.transactionDate.$lte = filters.endDate;
        }
      }

      // Apply voucher filter if provided
      let voucherMatch = {};
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        voucherMatch = { $or: regexFilters };
      }

      const pipeline = [
        {
          $match: {
            ...matchConditions,
            ...voucherMatch,
            type: { $in: ["purchase-fixing", "sales-fixing"] },
            fixingTransactionId: { $exists: true, $ne: null }, // Only include Registry entries with valid fixingTransactionId
          },
        },
        {
          $lookup: {
            from: "transactionfixings",
            localField: "fixingTransactionId",
            foreignField: "_id",
            as: "transactionFixing",
          },
        },
        {
          $unwind: {
            path: "$transactionFixing",
            preserveNullAndEmptyArrays: false, // Only include Registry entries that have matching TransactionFixing
          },
        },
        {
          $group: {
            _id: "$type",
            totalGold: {
              $sum: {
                // Calculate: goldCredit - goldDebit
                $subtract: [
                  { $ifNull: ["$goldCredit", 0] },
                  { $ifNull: ["$goldDebit", 0] }
                ]
              },
            },
            totalValue: {
              $sum: {
                // Calculate: cashDebit - cashCredit
                $subtract: [
                  { $ifNull: ["$cashDebit", 0] },
                  { $ifNull: ["$cashCredit", 0] }
                ]
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            category: {
              $cond: [
                { $eq: ["$_id", "purchase-fixing"] },
                "purchaseFix",
                "saleFix",
              ],
            },
            totalGold: 1,
            totalValue: 1,
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      return result;
    } catch (error) {
      console.error("Error getting fixing transactions:", error);
      return [];
    }
  }

  // Get Hedge Entries as Fixing Transactions
  // IMPORTANT: This method handles Registry entries with type "HEDGE_ENTRY"
  // Only processes when excludeHedging === false
  // Treats hedge entries as fixing entries (purchaseFix or saleFix) based on MetalTransaction.transactionType
  // Does NOT affect metal transaction totals, inventory, opening balance, purity, or adjustments
  async getOwnStockHedgeFixingTransactions(filters) {
    try {
      // Only process hedge entries when excludeHedging === false
      const excludeHedging = filters.excludeHedging === true || filters.excludeHedging === "true";
      if (excludeHedging) {
        return []; // Completely ignore hedge entries when excludeHedging === true
      }

      const matchConditions = {
        isActive: true,
        type: "HEDGE_ENTRY",
        metalTransactionId: { $exists: true, $ne: null }, // Must have metalTransactionId
      };

      // Only add date filter if dates are provided
      if (filters.startDate || filters.endDate) {
        matchConditions.transactionDate = {};
        if (filters.startDate) {
          matchConditions.transactionDate.$gte = filters.startDate;
        }
        if (filters.endDate) {
          matchConditions.transactionDate.$lte = filters.endDate;
        }
      }

      // Apply voucher filter if provided
      let voucherMatch = {};
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        voucherMatch = { $or: regexFilters };
      }

      const pipeline = [
        {
          $match: {
            ...matchConditions,
            ...voucherMatch,
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
        {
          $unwind: {
            path: "$metalTransaction",
            preserveNullAndEmptyArrays: false, // Only include Registry entries that have matching MetalTransaction
          },
        },
        {
          $match: {
            "metalTransaction.hedge": true, // Only include entries where MetalTransaction.hedge === true
          },
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  // PurchaseFix: sale-side transactions
                  {
                    case: {
                      $in: [
                        "$metalTransaction.transactionType",
                        ["sale", "exportSale", "purchaseReturn", "importPurchaseReturn", "hedgeMetalPayment"],
                      ],
                    },
                    then: "purchaseFix",
                  },
                  // SaleFix: purchase-side transactions
                  {
                    case: {
                      $in: [
                        "$metalTransaction.transactionType",
                        [
                          "purchase",
                          "importPurchase",
                          "saleReturn",
                          "exportSaleReturn",
                          "hedgeMetalReceipt",
                          "hedgeMetalReciept", // Note: typo in original requirement
                        ],
                      ],
                    },
                    then: "saleFix",
                  },
                ],
                default: "other", // Should not happen, but handle gracefully
              },
            },
            totalGold: {
              $sum: {
                // Calculate: goldCredit - goldDebit (same as fixing)
                $subtract: [
                  { $ifNull: ["$goldCredit", 0] },
                  { $ifNull: ["$goldDebit", 0] },
                ],
              },
            },
            totalValue: {
              $sum: {
                // Calculate: cashDebit - cashCredit (same as fixing)
                $subtract: [
                  { $ifNull: ["$cashDebit", 0] },
                  { $ifNull: ["$cashCredit", 0] },
                ],
              },
            },
          },
        },
        {
          $match: {
            _id: { $ne: "other" }, // Exclude any unclassified entries
          },
        },
        {
          $project: {
            _id: 0,
            category: "$_id",
            totalGold: 1,
            totalValue: 1,
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      return result;
    } catch (error) {
      console.error("Error getting hedge fixing transactions:", error);
      return [];
    }
  }

  // Get Open Account Fixing Transactions
  // IMPORTANT: This method handles Registry entries with type "OPEN-ACCOUNT-FIXING"
  // These entries do NOT have metalTransactionId and rely ONLY on Registry fields
  // Treats OPEN-ACCOUNT-FIXING entries as fixing entries (purchaseFix or saleFix) based on Registry.transactionType
  // Does NOT affect metal transaction totals, inventory, opening balance, purity, or adjustments
  async getOwnStockOpenAccountFixingTransactions(filters) {
    try {
      const matchConditions = {
        isActive: true,
        type: "OPEN-ACCOUNT-FIXING",
        transactionType: { $in: ["opening-purchaseFix", "opening-saleFix"] },
        ...(filters.startDate || filters.endDate ? {
          transactionDate: {
            ...(filters.startDate ? { $gte: filters.startDate } : {}),
            ...(filters.endDate ? { $lte: filters.endDate } : {}),
          }
        } : {}),
      };

      // Apply voucher filter if provided
      let voucherMatch = {};
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        voucherMatch = { $or: regexFilters };
      }

      const pipeline = [
        {
          $match: {
            ...matchConditions,
            ...voucherMatch,
          },
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  // PurchaseFix: opening-purchaseFix
                  {
                    case: { $eq: ["$transactionType", "opening-purchaseFix"] },
                    then: "purchaseFix",
                  },
                  // SaleFix: opening-saleFix
                  {
                    case: { $eq: ["$transactionType", "opening-saleFix"] },
                    then: "saleFix",
                  },
                ],
                default: "other", // Should not happen, but handle gracefully
              },
            },
            totalGold: {
              $sum: {
                // Calculate: goldCredit - goldDebit (same as fixing)
                $subtract: [
                  { $ifNull: ["$goldCredit", 0] },
                  { $ifNull: ["$goldDebit", 0] },
                ],
              },
            },
            totalValue: {
              $sum: {
                // Calculate: cashDebit - cashCredit (same as fixing)
                $subtract: [
                  { $ifNull: ["$cashDebit", 0] },
                  { $ifNull: ["$cashCredit", 0] },
                ],
              },
            },
          },
        },
        {
          $match: {
            _id: { $ne: "other" }, // Exclude any unclassified entries
          },
        },
        {
          $project: {
            _id: 0,
            category: "$_id",
            totalGold: 1,
            totalValue: 1,
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      return result;
    } catch (error) {
      console.error("Error getting open account fixing transactions:", error);
      return [];
    }
  }

  // Get Adjustments (MSA)
  // IMPORTANT: This method is Registry-based - only includes adjustments that have matching Registry entries
  // Filters Registry by type "STOCK_ADJUSTMENT" - all adjustments must be recorded in Registry
  async getOwnStockAdjustments(filters) {
    try {
      const matchConditions = {
        isActive: true,
        type: "STOCK_ADJUSTMENT",
      };

      // Only add date filter if dates are provided
      if (filters.startDate || filters.endDate) {
        matchConditions.transactionDate = {};
        if (filters.startDate) {
          matchConditions.transactionDate.$gte = filters.startDate;
        }
        if (filters.endDate) {
          matchConditions.transactionDate.$lte = filters.endDate;
        }
      }

      const pipeline = [
        {
          $match: matchConditions,
        },
        {
          $group: {
            _id: null,
            totalGold: {
              $sum: {
                $subtract: [
                  { $ifNull: ["$goldCredit", 0] },
                  { $ifNull: ["$goldDebit", 0] },
                ],
              },
            },
            totalValue: {
              $sum: { $ifNull: ["$value", 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            category: "adjustment",
            totalGold: 1,
            totalValue: 1,
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      return result.length > 0 ? result : [{ category: "adjustment", totalGold: 0, totalValue: 0 }];
    } catch (error) {
      console.error("Error getting adjustments:", error);
      return [{ category: "adjustment", totalGold: 0, totalValue: 0 }];
    }
  }

  // Get Purity Gain/Loss
  // IMPORTANT: This method first fetches MetalTransaction records, then matches them in Registry
  // Step 1: Query MetalTransaction with filters (date range only - excludeHedging is NOT applied to purity difference)
  // Step 2: Get the ObjectIds from MetalTransaction
  // Step 3: Match those IDs in Registry where type is PURITY_DIFFERENCE
  // NOTE: Purity difference always shows regardless of excludeHedging filter
  async getOwnStockPurityDifference(filters) {
    try {
      // Step 1: Build MetalTransaction query conditions
      const metalTransactionQuery = {
        isActive: true,
      };

      // Only add date filter if dates are provided
      // NOTE: We do NOT apply excludeHedging filter here - purity difference always shows
      if (filters.startDate || filters.endDate) {
        metalTransactionQuery.voucherDate = {};
        if (filters.startDate) {
          metalTransactionQuery.voucherDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          metalTransactionQuery.voucherDate.$lte = new Date(filters.endDate);
        }
      }

      // Step 2: Get MetalTransaction ObjectIds that match the filters
      // No excludeHedging filter applied - include all transactions for purity difference
      const metalTransactions = await MetalTransaction.find(metalTransactionQuery).select("_id").lean();
      const metalTransactionIds = metalTransactions.map((mt) => mt._id);

      // If no metal transactions found, return default
      if (metalTransactionIds.length === 0) {
        return [{ category: "purityDifference", totalGold: 0, totalValue: 0 }];
      }

      // Step 3: Match those IDs in Registry where type is PURITY_DIFFERENCE
      const registryMatchConditions = {
        isActive: true,
        type: "PURITY_DIFFERENCE",
        metalTransactionId: { $in: metalTransactionIds },
      };

      // Apply date filter to Registry if provided (additional validation)
      if (filters.startDate || filters.endDate) {
        registryMatchConditions.transactionDate = {};
        if (filters.startDate) {
          registryMatchConditions.transactionDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          registryMatchConditions.transactionDate.$lte = new Date(filters.endDate);
        }
      }

      // Apply voucher filter if provided
      let voucherMatch = {};
      if (filters.voucher?.length > 0) {
        const regexFilters = filters.voucher.map((v) => ({
          reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
        }));
        voucherMatch = { $or: regexFilters };
      }

      const pipeline = [
        {
          $match: {
            ...registryMatchConditions,
            ...voucherMatch,
          },
        },
        {
          $group: {
            _id: null,
            totalGold: {
              $sum: {
                // Use credit - debit for gold amount
                $subtract: [
                  { $ifNull: ["$credit", 0] },
                  { $ifNull: ["$debit", 0] },
                ],
              },
            },
            totalValue: {
              $sum: {
                // Use credit - debit for value (not goldCredit/goldDebit)
                $subtract: [
                  { $ifNull: ["$credit", 0] },
                  { $ifNull: ["$debit", 0] },
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            category: "purityDifference",
            totalGold: 1,
            totalValue: 1,
          },
        },
      ];

      const result = await Registry.aggregate(pipeline);
      
      // Debug logging
      console.log("PURITY_DIFFERENCE - MetalTransaction IDs count:", metalTransactionIds.length);
      console.log("PURITY_DIFFERENCE - Registry query result:", JSON.stringify(result, null, 2));
      
      if (result.length > 0) {
        return result;
      } else {
        // Return default structure
        return [{ category: "purityDifference", totalGold: 0, totalValue: 0 }];
      }
    } catch (error) {
      console.error("Error getting purity difference:", error);
      return [{ category: "purityDifference", totalGold: 0, totalValue: 0 }];
    }
  }

  // Get Receivables, Payables, Balance, and General from Account
  async getOwnStockReceivablesPayables() {
    try {
      // DEBUG: List all AccountMode names to help identify the correct names
      const allAccountModes = await AccountMode.find({}).select("_id name").lean();
      console.log("\n=== ALL ACCOUNT MODES IN DATABASE ===");
      allAccountModes.forEach(mode => {
        console.log(`  - ID: ${mode._id.toString()}, Name: ${mode.name}`);
      });

      // Get account mode IDs for RECEIVABLE, PAYABLE, and BALANCE & GENERAL (single mode)
      const receivableMode = await AccountMode.findOne({ name: { $regex: /RECEIVABLE/i } }).select("_id name").lean();
      const payableMode = await AccountMode.findOne({ name: { $regex: /PAYABLE/i } }).select("_id name").lean();
      // Look for a single AccountMode that contains both BALANCE and GENERAL
      const balanceGeneralMode = await AccountMode.findOne({ 
        name: { $regex: /BALANCE.*GENERAL|GENERAL.*BALANCE/i } 
      }).select("_id name").lean();

      const receivableModeId = receivableMode?._id;
      const payableModeId = payableMode?._id;
      const balanceGeneralModeId = balanceGeneralMode?._id;

      // DEBUG: Check AccountMode findings
      console.log("=== ACCOUNT MODE DEBUG ===");
      console.log("Receivable Mode Found:", receivableMode ? { id: receivableMode._id.toString(), name: receivableMode.name } : "NOT FOUND");
      console.log("Payable Mode Found:", payableMode ? { id: payableMode._id.toString(), name: payableMode.name } : "NOT FOUND");
      console.log("Balance General Mode Found:", balanceGeneralMode ? { id: balanceGeneralMode._id.toString(), name: balanceGeneralMode.name } : "NOT FOUND");

      // Build match conditions
      const matchReceivables = receivableModeId ? { accountType: receivableModeId } : {};
      const matchPayables = payableModeId ? { accountType: payableModeId } : {};
      const matchBalanceGeneral = balanceGeneralModeId ? { accountType: balanceGeneralModeId } : {};

      // DEBUG: Check accounts matching conditions (fetch all, no limit)
      const allReceivableAccounts = await Account.find({
        isActive: true,
        ...matchReceivables,
      }).select("accountCode customerName accountType balances.goldBalance.totalGrams").lean();

      const allPayableAccounts = await Account.find({
        isActive: true,
        ...matchPayables,
      }).select("accountCode customerName accountType balances.goldBalance.totalGrams").lean();

      const allBankAccounts = await Account.find({
        isActive: true,
        accountCode: { $regex: /BANK/i },
      }).select("accountCode customerName accountType balances.goldBalance.totalGrams").lean();

      console.log("\n=== ACCOUNTS DEBUG ===");
      console.log(`Total Receivable Accounts (all): ${allReceivableAccounts.length}`);
      allReceivableAccounts.forEach(acc => {
        const balance = acc.balances?.goldBalance?.totalGrams || 0;
        console.log(`  - ${acc.accountCode} | ${acc.customerName}: Balance = ${balance}, AccountType = ${acc.accountType}`);
      });

      console.log(`\nTotal Payable Accounts (all): ${allPayableAccounts.length}`);
      allPayableAccounts.forEach(acc => {
        const balance = acc.balances?.goldBalance?.totalGrams || 0;
        console.log(`  - ${acc.accountCode} | ${acc.customerName}: Balance = ${balance}, AccountType = ${acc.accountType}`);
      });

      console.log(`\nTotal Bank Accounts (all): ${allBankAccounts.length}`);
      allBankAccounts.forEach(acc => {
        const balance = acc.balances?.goldBalance?.totalGrams || 0;
        console.log(`  - ${acc.accountCode} | ${acc.customerName}: Balance = ${balance}, AccountType = ${acc.accountType}`);
      });

      const pipeline = [
        {
          $facet: {
            receivables: [
              {
                $match: {
                  isActive: true,
                  ...matchReceivables,
                },
              },
              {
                $group: {
                  _id: null,
                  totalGold: {
                    $sum: { $multiply: ["$balances.goldBalance.totalGrams", -1] },
                  },
                },
              },
            ],
            payables: [
              {
                $match: {
                  isActive: true,
                  ...matchPayables,
                },
              },
              {
                $group: {
                  _id: null,
                  totalGold: {
                    $sum: { $multiply: ["$balances.goldBalance.totalGrams", -1] },
                  },
                },
              },
            ],
            balanceGeneral: [
              {
                $match: {
                  isActive: true,
                  ...matchBalanceGeneral,
                },
              },
              {
                $group: {
                  _id: null,
                  totalGold: {
                    $sum: { $ifNull: ["$balances.goldBalance.totalGrams", 0] },
                  },
                },
              },
            ],
            bank: [
              {
                $match: {
                  isActive: true,
                  accountCode: { $regex: /BANK/i },
                },
              },
              {
                $group: {
                  _id: null,
                  totalGold: {
                    $sum: { $ifNull: ["$balances.goldBalance.totalGrams", 0] },
                  },
                },
              },
            ],
          },
        },
        {
          $project: {
            receivables: {
              $ifNull: [{ $arrayElemAt: ["$receivables.totalGold", 0] }, 0],
            },
            payables: {
              $ifNull: [{ $arrayElemAt: ["$payables.totalGold", 0] }, 0],
            },
            balanceGeneral: {
              $ifNull: [{ $arrayElemAt: ["$balanceGeneral.totalGold", 0] }, 0],
            },
            bank: {
              $ifNull: [{ $arrayElemAt: ["$bank.totalGold", 0] }, 0],
            },
          },
        },
      ];

      const result = await Account.aggregate(pipeline);
      const data = result[0] || { receivables: 0, payables: 0, balanceGeneral: 0, bank: 0 };

      // RECEIVABLE: Sum all balances (positive and negative), then negate (multiply by -1)
      // PAYABLE: Sum all balances (positive and negative), then negate (multiply by -1)
      // BALANCE & GENERAL: single value that can be split or used as is
      // BANK: accounts with accountCode containing "BANK"
      const balanceGeneralValue = data.balanceGeneral || 0;
      const bankValue = data.bank || 0;
      
      const returnData = {
        receivables: data.receivables || 0, // Already negated from aggregation (multiplied by -1)
        payables: data.payables || 0, // Already negated from aggregation (multiplied by -1)
        balance: balanceGeneralValue, // Use the same value for balance
        general: balanceGeneralValue, // Use the same value for general (or split if needed)
        bank: bankValue,
      };

      // Console logs to check receivables and payables
      console.log("=== RECEIVABLES & PAYABLES ===");
      console.log("RECEIVABLES:", returnData.receivables);
      console.log("PAYABLES:", returnData.payables);
      console.log("Raw aggregation data:", {
        receivables: data.receivables,
        payables: data.payables,
        balanceGeneral: data.balanceGeneral,
        bank: data.bank,
      });
      console.log("=================================");
      
      return returnData;
    } catch (error) {
      console.error("Error getting receivables and payables:", error);
      return { receivables: 0, payables: 0, balance: 0, general: 0, bank: 0 };
    }
  }

  // Get Inventory Logs summary
  async getOwnStockInventoryLogs(filters) {
    try {
      const matchConditions = {
        voucherDate: {},
      };

      if (filters.startDate) {
        matchConditions.voucherDate.$gte = filters.startDate;
      }
      if (filters.endDate) {
        matchConditions.voucherDate.$lte = filters.endDate;
      }

      const pipeline = [
        {
          $match: matchConditions,
        },
        {
          $group: {
            _id: {
              stockCode: "$stockCode",
              purity: "$purity",
            },
            totalGrossWeight: { $sum: { $ifNull: ["$grossWeight", 0] } },
            purity: { $first: "$purity" },
          },
        },
        {
          $group: {
            _id: null,
            totalGrossWeight: { $sum: "$totalGrossWeight" },
            totalPureWeight: {
              $sum: {
                $multiply: [
                  "$totalGrossWeight",
                  { $divide: [{ $ifNull: ["$purity", 0] }, 100] },
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalGrossWeight: 1,
            totalPureWeight: 1,
          },
        },
      ];

      const result = await InventoryLog.aggregate(pipeline);
      return result[0] || { totalGrossWeight: 0, totalPureWeight: 0 };
    } catch (error) {
      console.error("Error getting inventory logs:", error);
      return { totalGrossWeight: 0, totalPureWeight: 0 };
    }
  }

  // Get Pure Weight Gold Jewelry from InventoryLog
  // Groups by stockCode, calculates pure weight (grossWeight * purity / 100), and sums all
  async getOwnStockPureWtGoldJew(filters) {
    try {
      const matchConditions = {
        isDraft: false, // Exclude draft entries
      };

      // Only add date filter if dates are provided
      if (filters.startDate || filters.endDate) {
        matchConditions.voucherDate = {};
        if (filters.startDate) {
          matchConditions.voucherDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          matchConditions.voucherDate.$lte = new Date(filters.endDate);
        }
      }

      const pipeline = [
        {
          $match: matchConditions,
        },
        {
          $group: {
            _id: "$stockCode",
            // Sum gross weight for each stockCode based on action field
            // action="add" → positive (add to inventory)
            // action="remove" → negative (remove from inventory)
            sumGrossWeight: {
              $sum: {
                $cond: [
                  { $eq: ["$action", "add"] },
                  { $ifNull: ["$grossWeight", 0] }, // action="add" → positive
                  {
                    $cond: [
                      { $eq: ["$action", "remove"] },
                      { $multiply: [{ $ifNull: ["$grossWeight", 0] }, -1] }, // action="remove" → negative
                      0, // Other actions (update, delete) → 0
                    ],
                  },
                ],
              },
            },
          },
        },
        // Lookup MetalStock to get purity (standardPurity)
        {
          $lookup: {
            from: "metalstocks",
            localField: "_id",
            foreignField: "_id",
            as: "stockInfo",
          },
        },
        {
          $unwind: {
            path: "$stockInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            stockCode: "$_id",
            sumGrossWeight: 1,
            // Get purity from MetalStock (standardPurity is stored as decimal 0-1, e.g., 0.999 = 99.9%)
            purity: {
              $ifNull: ["$stockInfo.standardPurity", 0],
            },
          },
        },
        {
          $project: {
            stockCode: 1,
            sumGrossWeight: 1,
            purity: 1,
            // Calculate pure weight for each stock: sumGrossWeight * purity (purity is already decimal)
            pureWeight: {
              $multiply: [
                "$sumGrossWeight",
                { $ifNull: ["$purity", 0] },
              ],
            },
          },
        },
        // Sum all pure weights from all stocks
        {
          $group: {
            _id: null,
            totalPureWeight: {
              $sum: "$pureWeight",
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalPureWeight: 1,
          },
        },
      ];

      // DEBUG: Log pipeline stages
      console.log("=== INVENTORY PURE WEIGHT DEBUG ===");
      console.log("Match Conditions:", JSON.stringify(matchConditions, null, 2));

      // Execute pipeline and log intermediate results
      const result = await InventoryLog.aggregate(pipeline);
      
      // Get intermediate results for debugging
      const debugPipeline = [
        ...pipeline.slice(0, -2), // Get all stages except the final $group and $project
      ];
      
      const intermediateResults = await InventoryLog.aggregate(debugPipeline);
      console.log("Intermediate Results (by stockCode):", JSON.stringify(intermediateResults.slice(0, 10), null, 2)); // Show first 10
      console.log("Total StockCodes:", intermediateResults.length);
      
      // Calculate sum manually for verification
      const manualSum = intermediateResults.reduce((sum, item) => {
        return sum + (item.pureWeight || 0);
      }, 0);
      console.log("Manual Sum of Pure Weights:", manualSum);
      
      const finalResult = result[0]?.totalPureWeight || 0;
      console.log("Final Result (from aggregation):", finalResult);
      console.log("===================================");
      
      return finalResult;
    } catch (error) {
      console.error("Error getting pure weight gold jewelry:", error);
      return 0;
    }
  }
  formatedOwnStock(reportData, receivablesAndPayables, openingBalance, branchSettings = null) {
    // Get branch settings if not provided
    const settings = branchSettings || {
      metalDecimal: 3,
      amountDecimal: 2,
      goldOzConversion: 31.1035,
    };

    const summary = {
      totalGrossWeight: 0,
      netGrossWeight: 0,
      totalValue: 0,
      totalReceivableGrams: 0,
      totalPayableGrams: 0,
      avgGrossWeight: 0,
      avgBidValue: 0,
      openingBalance: this.roundMetal(openingBalance?.opening || 0, settings.metalDecimal), // Use resolved opening balance
      netPurchase: 0,
      purityDifference: 0, // Use resolved or default
      shortLongPosition: 0
    };

    // Extract receivable/payable safely
    if (receivablesAndPayables?.length) {
      summary.totalReceivableGrams = this.roundMetal(receivablesAndPayables[0].totalReceivableGrams || 0, settings.metalDecimal);
      summary.totalPayableGrams = this.roundMetal(receivablesAndPayables[0].totalPayableGrams || 0, settings.metalDecimal);
    }

    // Define purchase and sale categories
    const purchaseCategories = ['PRM', 'PF', 'PR'];
    const saleCategories = ['SAL', 'PR', 'SF'];

    let totalPurchase = 0;
    let totalSale = 0;
    let purchasePurityDifference = 0;
    let salePurityDifference = 0;

    const categories = reportData?.length ? reportData.map((item) => {
      summary.totalGrossWeight += item.totalGrossWeight || 0;
      summary.totalValue += item.totalValue || 0;

      if (purchaseCategories.includes(item.category)) {
        totalPurchase += item.totalGrossWeight || 0;
        purchasePurityDifference += item.totalPurityDiff || 0;
      } else if (saleCategories.includes(item.category)) {
        totalSale += item.totalGrossWeight || 0;
        salePurityDifference += item.totalPurityDiff || 0;
      }

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
        totalPurityDiff: item.totalPurityDiff
      };
    }) : [];

    // Calculate averages
    const totalCategories = reportData?.length || 0;
    const rawAvgGrossWeight = totalCategories > 0 ? reportData.reduce((sum, item) => sum + (item.avgGrossWeight || 0), 0) / totalCategories : 0;
    const rawAvgBidValue = totalCategories > 0 ? reportData.reduce((sum, item) => sum + (item.avgBidValue || 0), 0) / totalCategories : 0;
    summary.avgGrossWeight = this.roundMetal(rawAvgGrossWeight, settings.metalDecimal);
    summary.avgBidValue = this.roundAmount(rawAvgBidValue, settings.amountDecimal);

    // Calculate summary fields
    const rawNetPurchase = totalPurchase - totalSale;
    const rawPurityDifference = purchasePurityDifference + salePurityDifference;
    const rawNetGrossWeight = totalPurchase - totalSale;
    const rawShortLongPosition = summary.openingBalance + rawNetPurchase + rawPurityDifference;
    
    summary.netPurchase = this.roundMetal(rawNetPurchase, settings.metalDecimal);
    summary.purityDifference = this.roundMetal(rawPurityDifference, settings.metalDecimal);
    summary.netGrossWeight = this.roundMetal(rawNetGrossWeight, settings.metalDecimal);
    summary.shortLongPosition = this.roundMetal(rawShortLongPosition, settings.metalDecimal);
    
    // Round other summary fields
    summary.totalGrossWeight = this.roundMetal(summary.totalGrossWeight, settings.metalDecimal);
    summary.totalValue = this.roundAmount(summary.totalValue, settings.amountDecimal);

    // log puriy difference

    return {
      summary,
      categories
    };
  }

  // Format Own Stock Data according to the image structure
  formatOwnStockData(data) {
    const {
      openingBalance,
      metalTransactionData,
      fixingData,
      adjustmentData,
      purityData,
      receivablesPayables,
      inventoryData,
      pureWtGoldJew = 0,
      filters,
      branchSettings = null,
    } = data;

    // Get branch settings if not provided
    const settings = branchSettings || {
      metalDecimal: 3,
      amountDecimal: 2,
      goldOzConversion: 31.1035,
    };

    // Handle excludeOpening filter
    // excludeOpening: true → don't show opening balance (set to 0)
    // excludeOpening: false → show opening balance
    const excludeOpening = filters?.excludeOpening === true || filters?.excludeOpening === "true";
    const openingGold = excludeOpening ? 0 : (openingBalance.opening || 0);
    const openingValue = excludeOpening ? 0 : (openingBalance.openingValue || 0);

    // Helper function to find category data
    const findCategory = (categoryName) => {
      const allData = [...metalTransactionData, ...fixingData, ...adjustmentData, ...purityData];
      return allData.find((item) => item.category === categoryName) || { totalGold: 0, totalValue: 0 };
    };

    // Calculate purchase totals
    const purchaseData = findCategory("purchase");
    const purchaseReturnData = findCategory("purchaseReturn");
    const purchaseFixData = findCategory("purchaseFix");
    
    // Calculate sale totals
    const saleData = findCategory("sale");
    const saleReturnData = findCategory("saleReturn");
    const saleFixData = findCategory("saleFix");

    // Calculate net purchase = purchase + purchaseReturn + purchaseFix
    const netPurchaseGold = 
      (purchaseData.totalGold || 0) +
      (purchaseReturnData.totalGold || 0) +
      (purchaseFixData.totalGold || 0);

    const netPurchaseValue = 
      (purchaseData.totalValue || 0) +
      (purchaseReturnData.totalValue || 0) +
      (purchaseFixData.totalValue || 0);

    // Calculate net sale = sale + saleReturn + saleFix
    const netSaleGold = 
      (saleData.totalGold || 0) +
      (saleReturnData.totalGold || 0) +
      (saleFixData.totalGold || 0);

    const netSaleValue = 
      (saleData.totalValue || 0) +
      (saleReturnData.totalValue || 0) +
      (saleFixData.totalValue || 0);

    // Get adjustments and purity
    const adjustment = adjustmentData[0] || { totalGold: 0, totalValue: 0 };
    const purityDiff = purityData[0] || { totalGold: 0, totalValue: 0 };

    // DEBUG: Log all input values
    console.log("=== OWN STOCK CALCULATION DEBUG ===");
    console.log("excludeOpening:", filters?.excludeOpening);
    console.log("Opening Balance:", {
      openingGold,
      openingValue,
      rawOpening: openingBalance,
    });
    console.log("Purchase Data:", {
      purchase: purchaseData,
      purchaseReturn: purchaseReturnData,
      purchaseFix: purchaseFixData,
    });
    console.log("Sale Data:", {
      sale: saleData,
      saleReturn: saleReturnData,
      saleFix: saleFixData,
    });
    console.log("Net Purchase:", {
      gold: netPurchaseGold,
      value: netPurchaseValue,
    });
    console.log("Net Sale:", {
      gold: netSaleGold,
      value: netSaleValue,
    });
    console.log("Adjustment:", adjustment);
    console.log("Purity Difference:", purityDiff);

    // Calculate subtotal = opening + netPurchase - netSale
    // Note: netSale is already negative, so we subtract it (which adds it)
    // Formula: opening + netPurchase - netSale
    // Since netSale is negative, this becomes: opening + netPurchase + |netSale|
    // But we want: opening + netPurchase - |netSale|
    // So we need to subtract the absolute value of netSale
    const subtotalGold = openingGold + netPurchaseGold - Math.abs(netSaleGold);
    const subtotalValue = openingValue + netPurchaseValue - Math.abs(netSaleValue);
    console.log("Subtotal:", {
      gold: subtotalGold,
      value: subtotalValue,
      calculation: `${openingGold} + ${netPurchaseGold} - ${Math.abs(netSaleGold)} = ${subtotalGold}`,
      note: "netSale is already negative, so we subtract its absolute value",
    });

    // Calculate final = subtotal + adjustment + purity gain/loss
    const finalGold = subtotalGold + (adjustment.totalGold || 0) + (purityDiff.totalGold || 0);
    const finalValue = subtotalValue ;
    console.log("Final (Long/Short):", {
      gold: finalGold,
      value: finalValue,
      calculation: `${subtotalGold} + ${adjustment.totalGold || 0} + ${purityDiff.totalGold || 0} = ${finalGold}`,
    });

    // Calculate long/short: if positive then "long", if negative then "short"
    const longShortGold = finalGold;
    const longShortValue = finalValue;
    const positionType = longShortGold >= 0 ? "long" : "short";
    console.log("Position Type:", positionType, "(gold:", longShortGold, ")");
    console.log("===================================");

    // Structure response similar to image
    const response = {
      openingBalance: {
        gold: this.roundMetal(openingGold, settings.metalDecimal),
        value: this.roundAmount(openingValue, settings.amountDecimal),
      },
      purchases: {
        Purchases: {
          gold: this.roundMetal(purchaseData.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(purchaseData.totalValue || 0, settings.amountDecimal),
        },
        posPurchases: {
          gold: 0, // Not specified in requirements
          value: 0,
        },
        purchaseReturn: {
          gold: this.roundMetal(purchaseReturnData.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(purchaseReturnData.totalValue || 0, settings.amountDecimal),
        },
        purchaseFixing: {
          gold: this.roundMetal(purchaseFixData.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(purchaseFixData.totalValue || 0, settings.amountDecimal),
        },
        branchTransIn: {
          gold: 0,
          value: 0,
        },
        diaPurchase: {
          gold: 0, // Not specified
          value: 0,
        },
        diaPurchaseReturn: {
          gold: 0, // Not specified
          value: 0,
        },
        netPurchase: {
          gold: this.roundMetal(netPurchaseGold, settings.metalDecimal),
          value: this.roundAmount(netPurchaseValue, settings.amountDecimal),
        },
      },
      sales: {
        Sales: {
          gold: this.roundMetal(saleData.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(saleData.totalValue || 0, settings.amountDecimal),
        },
        posSales: {
          gold: 0, // Not specified
          value: 0,
        },
        salesReturn: {
          gold: this.roundMetal(saleReturnData.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(saleReturnData.totalValue || 0, settings.amountDecimal),
        },
        salesFixing: {
          gold: this.roundMetal(saleFixData.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(saleFixData.totalValue || 0, settings.amountDecimal),
        },
        branchTransOut: {
          gold: 0,
          value: 0,
        },
        diaSales: {
          gold: 0, // Not specified
          value: 0,
        },
        diaSalesReturn: {
          gold: 0, // Not specified
          value: 0,
        },
        netSales: {
          gold: this.roundMetal(netSaleGold, settings.metalDecimal),
          value: this.roundAmount(netSaleValue, settings.amountDecimal),
        },
      },
      otherDetails: {
        manufacturing: {
          gold: 0, // Not specified
          value: 0,
        },
        subTotal: {
          gold: this.roundMetal(subtotalGold, settings.metalDecimal),
          value: this.roundAmount(subtotalValue, settings.amountDecimal),
        },
        adjustments: {
          gold: this.roundMetal(adjustment.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(adjustment.totalValue || 0, settings.amountDecimal),
        },
        purityLossGain: {
          gold: this.roundMetal(purityDiff.totalGold || 0, settings.metalDecimal),
          value: this.roundAmount(purityDiff.totalValue || 0, settings.amountDecimal),
        },
        stoneLossGain: {
          gold: 0, // Not specified
          value: 0,
        },
        wasteLossGain: {
          gold: 0, // Not specified
          value: 0,
        },
        mfgLossGain: {
          gold: 0,
          value: 0,
        },
        otherExpenses: {
          gold: 0, // Not specified
          value: 0,
        },
        long: {
          gold: this.roundMetal(longShortGold, settings.metalDecimal),
          value: this.roundAmount(longShortValue, settings.amountDecimal),
          positionType: positionType, // "long" if positive, "short" if negative
        },
        currentRate: {
          gold: 0,
          value: 0, // This would need current rate calculation
        },
        profit: {
          gold: 0,
          value: 0, // This would need profit calculation
        },
      },
      positionSummary: {
        receivables: {
          gold: this.roundMetal(receivablesPayables.receivables || 0, settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
        payables: {
          gold: this.roundMetal(receivablesPayables.payables || 0, settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
        general: {
          gold: this.roundMetal(receivablesPayables.general || 0, settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
        bank: {
          gold: this.roundMetal(receivablesPayables.bank || 0, settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
        subTotal: {
          gold: this.roundMetal((receivablesPayables.receivables || 0) + (receivablesPayables.payables || 0) + (receivablesPayables.general || 0) + (receivablesPayables.bank || 0), settings.metalDecimal),
          value: 0,
        },
        pureWtDiaJew: {
          gold: this.roundMetal(inventoryData.totalPureWeight || 0, settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
        pureWtWIP: {
          gold: 0,
          value: 0,
        },
        pureWtGoldJew: {
          gold: this.roundMetal(pureWtGoldJew || 0, settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
        netPosition: {
          gold: this.roundMetal((receivablesPayables.receivables || 0) + (receivablesPayables.payables || 0) + (receivablesPayables.general || 0) + (receivablesPayables.bank || 0) + (pureWtGoldJew || 0), settings.metalDecimal),
          value: 0, // Would need rate calculation
        },
      },
    };

    return response;
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

    pipeline.push({
      $unwind: {
        path: "$metaltransactions.stockItems",
        preserveNullAndEmptyArrays: true,
      },
    });

    /* ------------------------------------------
       Step 7: Sort by transactionDate to ensure consistent $first selection
    ------------------------------------------ */
    pipeline.push({ $sort: { transactionDate: 1 } });

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
        totalPurityDiff: { $sum: { $ifNull: ["$metaltransactions.stockItems.purityDiffWeight", 0] } },
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
        totalPurityDiff: { $sum: "$totalPurityDiff" }, // <-- added
        transactionCount: { $sum: 1 },
        latestTransactionDate: { $max: "$latestTransactionDate" },
      },
    });

    /* ------------------------------------------
       Step 10: Project to format the output with average
    ------------------------------------------ */
    const descriptionSwitchBranches = (filters.voucher || []).map(({ prefix, type }) => ({
      case: { $eq: ["$_id", prefix] },
      then: type.replace(/[-_]/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()),
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
        totalPurityDiff: 1, // <-- included in output

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

  metalFxingPipeLine(filters) {
    const pipeline = [];
    
    // Step 1: Start from Registry - match purchase-fixing, sales-fixing, HEDGE_ENTRY, and OPEN-ACCOUNT-FIXING entries
    // Include HEDGE_ENTRY when excludeHedging is false
    const excludeHedgingValue = filters.excludeHedging;
    const shouldExcludeHedge = excludeHedgingValue === true || excludeHedgingValue === "true";
    
    const registryTypes = ["purchase-fixing", "sales-fixing", "OPEN-ACCOUNT-FIXING"];
    if (!shouldExcludeHedge) {
      registryTypes.push("HEDGE_ENTRY");
    }
    
    const registryMatch = {
      isActive: true,
      type: { $in: registryTypes },
      $or: [
        { metalTransactionId: { $exists: true, $ne: null } },
        { fixingTransactionId: { $exists: true, $ne: null } },
        { type: "OPEN-ACCOUNT-FIXING" } // OPEN-ACCOUNT-FIXING may not have metalTransactionId or fixingTransactionId
      ],
    };

    // Step 2: Apply date filter on Registry
    if (filters.startDate || filters.endDate) {
      registryMatch.transactionDate = {};
      if (filters.startDate) {
        registryMatch.transactionDate.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        registryMatch.transactionDate.$lte = new Date(filters.endDate);
      }
    }

    // Step 3: Apply voucher filter if provided
    if (filters.voucher?.length > 0) {
      const regexFilters = filters.voucher.map((v) => ({
        reference: { $regex: `^${v.prefix}\\d+$`, $options: "i" },
      }));
      registryMatch.$and = [{ $or: regexFilters }];
    }

    pipeline.push({ $match: registryMatch });

    // Step 4: Lookup MetalTransaction and filter by date
    pipeline.push({
      $lookup: {
        from: "metaltransactions",
        let: { metalTxnId: "$metalTransactionId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$metalTxnId"] },
              isActive: true,
              // Filter by date in MetalTransaction
              ...(filters.startDate || filters.endDate ? {
                voucherDate: {
                  ...(filters.startDate ? { $gte: new Date(filters.startDate) } : {}),
                  ...(filters.endDate ? { $lte: new Date(filters.endDate) } : {})
                }
              } : {})
            }
          }
        ],
        as: "metalTransaction",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$metalTransaction",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 5: Lookup TransactionFixing and filter by date
    pipeline.push({
      $lookup: {
        from: "transactionfixings",
        let: { fixingTxnId: "$fixingTransactionId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$fixingTxnId"] },
              isActive: true,
              status: "active",
              // Filter by date in TransactionFixing
              ...(filters.startDate || filters.endDate ? {
                transactionDate: {
                  ...(filters.startDate ? { $gte: new Date(filters.startDate) } : {}),
                  ...(filters.endDate ? { $lte: new Date(filters.endDate) } : {})
                }
              } : {})
            }
          }
        ],
        as: "transactionFixing",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$transactionFixing",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 6: Filter out entries where MetalTransaction or TransactionFixing don't match date filter
    // OPEN-ACCOUNT-FIXING entries don't require MetalTransaction or TransactionFixing
    pipeline.push({
      $match: {
        $and: [
          // Must have at least one of MetalTransaction, TransactionFixing, or be OPEN-ACCOUNT-FIXING
          {
            $or: [
              { "metalTransaction._id": { $exists: true } },
              { "transactionFixing._id": { $exists: true } },
              { type: "OPEN-ACCOUNT-FIXING" }
            ]
          }
        ]
      }
    });

    // Step 7: Handle excludeHedging filter and HEDGE_ENTRY type mapping
    // excludeHedging: false → show hedge entries (hedge=true)
    // excludeHedging: true → only show purchase-fixing and sales-fixing where MetalTransaction.fixed = true
    
    // Debug: Log match conditions
    console.log("=== METAL FIXING PIPELINE DEBUG ===");
    console.log("Starting from Registry, filtering by date in MetalTransaction and TransactionFixing");
    console.log("excludeHedging:", filters.excludeHedging, "shouldExcludeHedge:", shouldExcludeHedge);
    console.log("Registry types included:", registryTypes);

    // Filter based on excludeHedging
    if (shouldExcludeHedge) {
      console.log("✓ Filtering: excludeHedging=true - only showing where MetalTransaction.fixed=true");
      // When excludeHedging is true, only show entries where MetalTransaction.fixed = true
      // OPEN-ACCOUNT-FIXING entries are always included (they don't have MetalTransaction)
      pipeline.push({
        $match: {
          $or: [
            { type: "OPEN-ACCOUNT-FIXING" }, // OPEN-ACCOUNT-FIXING always included
            { "metalTransaction._id": { $exists: false } }, // No MetalTransaction
            { "metalTransaction.fixed": true } // MetalTransaction exists and is fixed
          ]
        },
      });
    } else {
      console.log("✓ Filtering: excludeHedging=false - including all entries, HEDGE_ENTRY, and OPEN-ACCOUNT-FIXING");
      // When excludeHedging is false, show all entries including HEDGE_ENTRY and OPEN-ACCOUNT-FIXING
      // For HEDGE_ENTRY, filter to only include entries where MetalTransaction.hedge = true
      // OPEN-ACCOUNT-FIXING entries are always included
      pipeline.push({
        $match: {
          $or: [
            { type: "OPEN-ACCOUNT-FIXING" }, // OPEN-ACCOUNT-FIXING always included
            { type: { $nin: ["HEDGE_ENTRY", "OPEN-ACCOUNT-FIXING"] } }, // Not HEDGE_ENTRY or OPEN-ACCOUNT-FIXING, include it
            { 
              // Is HEDGE_ENTRY, must have MetalTransaction with hedge = true
              $and: [
                { type: "HEDGE_ENTRY" },
                { "metalTransaction.hedge": true }
              ]
            }
          ]
        },
      });
    }

    // Step 8: Lookup FixingPrice matching EITHER fixingTransactionId OR metalTransactionId
    // Match FixingPrice using ONE of the following:
    // 1) If fixingTransactionId exists: FixingPrice.transactionFix === Registry.fixingTransactionId
    // 2) Else if metalTransactionId exists: FixingPrice.transaction === Registry.metalTransactionId
    pipeline.push({
      $lookup: {
        from: "fixingprices",
        let: {
          metalTxnId: "$metalTransactionId",
          fixingTxnId: "$fixingTransactionId"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$status", "active"] },
                  {
                    $or: [
                      // Match by TransactionFixing ID if it exists
                      {
                        $and: [
                          { $ne: ["$$fixingTxnId", null] },
                          { $eq: ["$transactionFix", "$$fixingTxnId"] }
                        ]
                      },
                      // Match by MetalTransaction ID if it exists
                      {
                        $and: [
                          { $ne: ["$$metalTxnId", null] },
                          { $eq: ["$transaction", "$$metalTxnId"] }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },
          { $sort: { fixedAt: -1 } }, // Get the most recent fixing price
          { $limit: 1 }
        ],
        as: "fixingPrice",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$fixingPrice",
        preserveNullAndEmptyArrays: true, // Allow entries without FixingPrice (will use default rate)
      },
    });

    // Step 9: Lookup parties from accounts collection
    pipeline.push({
      $lookup: {
        from: "accounts",
        localField: "party",
        foreignField: "_id",
        as: "parties",
      },
    });

    pipeline.push({
      $unwind: {
        path: "$parties",
        preserveNullAndEmptyArrays: true,
      },
    });

    // Step 10: Sort by transactionDate and createdAt for consistent ordering
    pipeline.push({
      $sort: {
        transactionDate: 1,
        createdAt: 1,
      },
    });

    // Step 11: Project fields - Use FixingPrice values if matched, otherwise default rate 2500
    // Each voucher shows rate, bidValue, currentBidValue from FixingPrice (or default 2500)
    pipeline.push({
      $project: {
        _id: 1,
        voucher: "$reference",
        date: "$transactionDate",
        narration: "$parties.customerName",
        // Map HEDGE_ENTRY and OPEN-ACCOUNT-FIXING to purchase-fixing or sales-fixing
        type: {
          $cond: {
            if: { $eq: ["$type", "HEDGE_ENTRY"] },
            then: {
              $switch: {
                branches: [
                  // PurchaseFix: sale-side transactions
                  {
                    case: {
                      $in: [
                        "$metalTransaction.transactionType",
                        ["sale", "exportSale", "purchaseReturn", "importPurchaseReturn", "hedgeMetalPayment"],
                      ],
                    },
                    then: "purchase-fixing",
                  },
                  // SaleFix: purchase-side transactions
                  {
                    case: {
                      $in: [
                        "$metalTransaction.transactionType",
                        [
                          "purchase",
                          "importPurchase",
                          "saleReturn",
                          "exportSaleReturn",
                          "hedgeMetalReceipt",
                          "hedgeMetalReciept",
                        ],
                      ],
                    },
                    then: "sales-fixing",
                  },
                ],
                default: "$type", // Fallback to original type if no match
              },
            },
            else: {
              // Handle OPEN-ACCOUNT-FIXING based on Registry.transactionType
              $cond: {
                if: { $eq: ["$type", "OPEN-ACCOUNT-FIXING"] },
                then: {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: ["$transactionType", "opening-purchaseFix"] },
                        then: "purchase-fixing",
                      },
                      {
                        case: { $eq: ["$transactionType", "opening-saleFix"] },
                        then: "sales-fixing",
                      },
                    ],
                    default: "$type",
                  },
                },
                else: "$type", // Keep original type for purchase-fixing and sales-fixing
              },
            },
          },
        },
        pureWeightIn: { $ifNull: ["$goldCredit", 0] },
        pureWeightOut: { $ifNull: ["$goldDebit", 0] },
        // Calculate netGold and netCash for fallback calculation
        netGold: {
          $abs: {
            $subtract: [
              { $ifNull: ["$goldCredit", 0] },
              { $ifNull: ["$goldDebit", 0] }
            ]
          }
        },
        netCash: {
          $abs: {
            $subtract: [
              { $ifNull: ["$cashDebit", 0] },
              { $ifNull: ["$cashCredit", 0] }
            ]
          }
        },
        // Rate resolution: FixingPrice.bidValue → Registry.goldBidValue → calculated from cash/gold
        // MUST follow same logic as bidValue to ensure consistency
        // Per-voucher resolution - each voucher resolves independently
        rate: {
          $cond: {
            // 1) If FixingPrice exists and has bidValue > 0: use FixingPrice.bidValue
            if: {
              $and: [
                { $ne: ["$fixingPrice", null] },
                { $ne: ["$fixingPrice.bidValue", null] },
                { $gt: ["$fixingPrice.bidValue", 0] }
              ]
            },
            then: "$fixingPrice.bidValue",
            else: {
              // 2) Else if Registry.goldBidValue > 0: use goldBidValue
              $cond: {
                if: { $gt: [{ $ifNull: ["$goldBidValue", 0] }, 0] },
                then: "$goldBidValue",
                else: {
                  // 3) FINAL FALLBACK: Calculate from cash and gold
                  // netGold = ABS(goldCredit - goldDebit)
                  // netCash = ABS(cashDebit - cashCredit)
                  // gramRate = netCash / netGold
                  // ozRate = (gramRate / 3.674) * 31.1035
                  // Requires BOTH netGold > 0 AND netCash > 0
                  $cond: {
                    if: {
                      $and: [
                        { $gt: ["$netGold", 0] },
                        { $gt: ["$netCash", 0] }
                      ]
                    },
                    then: {
                      $multiply: [
                        { $divide: ["$netCash", "$netGold"] },
                        { $divide: [31.1035, 3.674] }
                      ]
                    },
                    else: 0
                  }
                }
              }
            }
          }
        },
        // bidValue: Use FixingPrice.bidValue, fallback to Registry.goldBidValue, then calculate from cash/gold
        // Per-voucher resolution - each voucher resolves independently
        bidValue: {
          $cond: {
            // 1) If FixingPrice exists and has bidValue > 0: use FixingPrice.bidValue
            if: {
              $and: [
                { $ne: ["$fixingPrice", null] },
                { $ne: ["$fixingPrice.bidValue", null] },
                { $gt: ["$fixingPrice.bidValue", 0] }
              ]
            },
            then: "$fixingPrice.bidValue",
            else: {
              $cond: {
                if: { $gt: [{ $ifNull: ["$goldBidValue", 0] }, 0] },
                then: "$goldBidValue",
                else: {
                  // FINAL FALLBACK: Calculate from cash and gold
                  // gramRate = netCash / netGold, ozRate = (gramRate / 3.674) * 31.1035
                  // Requires BOTH netGold > 0 AND netCash > 0
                  $cond: {
                    if: {
                      $and: [
                        { $gt: ["$netGold", 0] },
                        { $gt: ["$netCash", 0] }
                      ]
                    },
                    then: {
                      $multiply: [
                        { $divide: ["$netCash", "$netGold"] },
                        { $divide: [31.1035, 3.674] }
                      ]
                    },
                    else: 0
                  }
                }
              }
            }
          }
        },
        // currentBidValue: Use FixingPrice.currentBidValue, fallback to Registry.goldBidValue, then calculate from cash/gold
        // Per-voucher resolution - each voucher resolves independently
        currentBidValue: {
          $cond: {
            // 1) If FixingPrice exists and has currentBidValue > 0: use FixingPrice.currentBidValue
            if: {
              $and: [
                { $ne: ["$fixingPrice", null] },
                { $ne: ["$fixingPrice.currentBidValue", null] },
                { $gt: ["$fixingPrice.currentBidValue", 0] }
              ]
            },
            then: "$fixingPrice.currentBidValue",
            else: {
              $cond: {
                if: { $gt: [{ $ifNull: ["$goldBidValue", 0] }, 0] },
                then: "$goldBidValue",
                else: {
                  // FINAL FALLBACK: Calculate from cash and gold
                  // gramRate = netCash / netGold, ozRate = (gramRate / 3.674) * 31.1035
                  // Requires BOTH netGold > 0 AND netCash > 0
                  $cond: {
                    if: {
                      $and: [
                        { $gt: ["$netGold", 0] },
                        { $gt: ["$netCash", 0] }
                      ]
                    },
                    then: {
                      $multiply: [
                        { $divide: ["$netCash", "$netGold"] },
                        { $divide: [31.1035, 3.674] }
                      ]
                    },
                    else: 0
                  }
                }
              }
            }
          }
        },
        rateInGram: { 
          $ifNull: [
            "$fixingPrice.rateInGram",      // FixingPrice.rateInGram
            "$goldBidValue",               // Registry.goldBidValue (if FixingPrice doesn't exist yet)
            2500                            // Default: 2500 if no FixingPrice and no goldBidValue
          ]
        },
        // CRITICAL: Include cashDebit and cashCredit for value calculation in Step 13
        // These fields are required to calculate value = cashDebit - cashCredit
        cashDebit: { $ifNull: ["$cashDebit", 0] },
        cashCredit: { $ifNull: ["$cashCredit", 0] },
        createdAt: 1,
        metalTransactionId: 1,
        fixingTransactionId: 1,
      },
    });

    // Step 13: Calculate value using ONLY Registry fields (cashDebit - cashCredit)
    // NEVER use rate × netGold - value MUST come from Registry fields
    // Pass through bidValue and currentBidValue (already resolved per voucher in Step 11)
    pipeline.push({
      $project: {
        _id: 1,
        voucher: 1,
        date: 1,
        type: 1, // Include type field
        narration: { $ifNull: ["$narration", "--"] },
        pureWeightIn: { $round: ["$pureWeightIn", 2] },
        pureWeightOut: { $round: ["$pureWeightOut", 2] },
        rate: { $round: ["$rate", 2] }, // Rate from FixingPrice or TransactionFixing.orders.bidValue (for display only)
        // VALUE CALCULATION: Use ONLY Registry fields - cashDebit - cashCredit
        // CRITICAL: Value may be NEGATIVE for sales-fixing (cashDebit < cashCredit)
        // Do NOT clamp, abs, or zero negative values
        // This applies to: purchase-fixing, sales-fixing, HEDGE_ENTRY, OPEN-ACCOUNT-FIXING
        value: {
          $round: [
            {
              $subtract: [
                { $ifNull: ["$cashDebit", 0] },
                { $ifNull: ["$cashCredit", 0] }
              ]
            },
            2
          ]
        },
        // bidValue and currentBidValue already resolved per voucher in Step 11 (from FixingPrice with fallback)
        bidValue: { $round: ["$bidValue", 2] },
        currentBidValue: { $round: ["$currentBidValue", 2] },
        createdAt: 1,
        metalTransactionType: "$metalTransaction.transactionType", // Include transactionType for calculation
        metalTransactionId: 1,
      },
    });

    // Step 14: Sort by date
    pipeline.push({
      $sort: {
        date: 1,
        createdAt: 1,
      },
    });

    return pipeline;
  }

  formatFixingReportData(reportData, openingBalance, filters, additionalData = {}, branchSettings = null) {
    // Get branch settings if not provided
    const settings = branchSettings || {
      metalDecimal: 3,
      amountDecimal: 2,
      goldOzConversion: 31.1035,
    };

    const openingGold = openingBalance.opening || 0;
    const openingValue = openingBalance.openingValue || 0;
    const openingAverage = openingGold !== 0 ? openingValue / openingGold : 0;

    // Extract additional data with defaults
    const netPurchase = additionalData.netPurchase || { gold: 0, value: 0 };
    const netSales = additionalData.netSales || { gold: 0, value: 0 };
    const adjustmentData = additionalData.adjustmentData || { gold: 0, value: 0 };
    const purityGain = additionalData.purityGain || { gold: 0, value: 0 };
    const purityLoss = additionalData.purityLoss || { gold: 0, value: 0 };

    if (!reportData || reportData.length === 0) {
      return {
        transactions: [],
        openingBalance: {
          gold: this.roundMetal(openingGold, settings.metalDecimal),
          value: this.roundAmount(openingValue, settings.amountDecimal),
          average: this.roundAmount(openingAverage, settings.amountDecimal),
        },
        summary: {
          totalPureWeightIn: 0,
          totalPureWeightOut: 0,
          totalPureWeightBalance: this.roundMetal(openingGold, settings.metalDecimal),
          totalValue: this.roundAmount(openingValue, settings.amountDecimal),
          average: this.roundAmount(openingAverage, settings.amountDecimal),
        },
        netPurchase: {
          gold: this.roundMetal(netPurchase.gold, settings.metalDecimal),
          value: this.roundAmount(netPurchase.value, settings.amountDecimal),
        },
        netSales: {
          gold: this.roundMetal(netSales.gold, settings.metalDecimal),
          value: this.roundAmount(netSales.value, settings.amountDecimal),
        },
        adjustmentData: {
          gold: this.roundMetal(adjustmentData.gold, settings.metalDecimal),
          value: this.roundAmount(adjustmentData.value, settings.amountDecimal),
        },
        purityGain: {
          gold: this.roundMetal(purityGain.gold, settings.metalDecimal),
          value: this.roundAmount(purityGain.value, settings.amountDecimal),
        },
        purityLoss: {
          gold: this.roundMetal(purityLoss.gold, settings.metalDecimal),
          value: this.roundAmount(purityLoss.value, settings.amountDecimal),
        },
      };
    }

    // Calculate running balances starting from opening balance
    let runningPureWeightBalance = openingGold;
    let runningValueBalance = openingValue;

    const transactions = reportData.map((item) => {
      const pureWeightIn = Number(item.pureWeightIn || 0);
      const pureWeightOut = Number(item.pureWeightOut || 0);
      const rate = Number(item.rate || 0);
      // CRITICAL: Value comes from pipeline (cashDebit - cashCredit)
      // Value may be NEGATIVE for sales-fixing - do NOT clamp or zero
      // Use nullish coalescing to preserve 0 but handle null/undefined
      const value = item.value != null ? Number(item.value) : 0;

      // Update running balances
      // Gold balance: pureWeightIn - pureWeightOut (may be negative)
      runningPureWeightBalance += pureWeightIn - pureWeightOut;
      // Value balance: add value (may be negative for sales-fixing)
      runningValueBalance += value;

      // Calculate average: runningValueBalance / runningGoldBalance
      // Only calculate when runningGoldBalance ≠ 0
      const average = runningPureWeightBalance !== 0 
        ? runningValueBalance / runningPureWeightBalance 
        : 0;

      return {
        voucher: item.voucher || "--",
        date: typeof item.date === 'string' ? item.date : (item.date ? moment(item.date).format("DD/MM/YYYY") : "--"),
        narration: item.narration || "--",
        type: item.type || "--", // Include type: purchase-fixing, sales-fixing, HEDGE_ENTRY, OPEN-ACCOUNT-FIXING
        pureWeight: {
          in: this.roundMetal(pureWeightIn, settings.metalDecimal),
          out: this.roundMetal(pureWeightOut, settings.metalDecimal),
          balance: this.roundMetal(runningPureWeightBalance, settings.metalDecimal),
        },
        amount: {
          rate: this.roundAmount(rate, settings.amountDecimal), // Rate from FixingPrice or TransactionFixing.orders.bidValue
          value: this.roundAmount(value, settings.amountDecimal),
          balance: this.roundAmount(runningValueBalance, settings.amountDecimal),
        },
        average: this.roundAmount(average, settings.amountDecimal),
        bidValue: this.roundAmount(item.bidValue || 0, settings.amountDecimal),
        currentBidValue: this.roundAmount(item.currentBidValue || 0, settings.amountDecimal),
      };
    });

    // Calculate summary
    const totalPureWeightIn = reportData.reduce((sum, item) => sum + Number(item.pureWeightIn || 0), 0);
    const totalPureWeightOut = reportData.reduce((sum, item) => sum + Number(item.pureWeightOut || 0), 0);
    const totalValue = reportData.reduce((sum, item) => sum + Number(item.value || 0), 0);

    const summary = {
      totalPureWeightIn: this.roundMetal(totalPureWeightIn, settings.metalDecimal),
      totalPureWeightOut: this.roundMetal(totalPureWeightOut, settings.metalDecimal),
      totalPureWeightBalance: this.roundMetal(runningPureWeightBalance, settings.metalDecimal),
      totalValue: this.roundAmount(runningValueBalance, settings.amountDecimal),
      average: runningPureWeightBalance !== 0 
        ? this.roundAmount(runningValueBalance / runningPureWeightBalance, settings.amountDecimal)
        : 0,
    };

    return {
      transactions,
      openingBalance: {
        gold: this.roundMetal(openingGold, settings.metalDecimal),
        value: this.roundAmount(openingValue, settings.amountDecimal),
        average: this.roundAmount(openingAverage, settings.amountDecimal),
      },
      summary,
      netPurchase: {
        gold: this.roundMetal(netPurchase.gold, settings.metalDecimal),
        value: this.roundAmount(netPurchase.value, settings.amountDecimal),
      },
      netSales: {
        gold: this.roundMetal(netSales.gold, settings.metalDecimal),
        value: this.roundAmount(netSales.value, settings.amountDecimal),
      },
      adjustmentData: {
        gold: this.roundMetal(adjustmentData.gold, settings.metalDecimal),
        value: this.roundAmount(adjustmentData.value, settings.amountDecimal),
      },
      purityGain: {
        gold: this.roundMetal(purityGain.gold, settings.metalDecimal),
        value: this.roundAmount(purityGain.value, settings.amountDecimal),
      },
      purityLoss: {
        gold: this.roundMetal(purityLoss.gold, settings.metalDecimal),
        value: this.roundAmount(purityLoss.value, settings.amountDecimal),
      },
    };
  }

  formatReportData(reportData, filters) {
    if (!reportData || reportData.length === 0) {
      return {
        transactions: [],
        summary: {
          totalTransactions: 0,
          totalDebit: 0,
          totalCredit: 0,
          totalGrossWeight: 0,
          totalPcs: 0,
          totalPureWeight: 0,
          totalValue: 0,
        },
        appliedFilters: this.getAppliedFiltersInfo(filters),
      };
    }

    // Calculate summary statistics
    const summary = reportData.reduce(
      (acc, item) => {
        acc.totalTransactions += 1;
        acc.totalDebit += item.debit || 0;
        acc.totalCredit += item.credit || 0;
        if (filters.grossWeight && item.grossWeight) {
          acc.totalGrossWeight += item.grossWeight;
        }
        if (filters.pureWeight && item.pureWeight) {
          acc.totalPureWeight += item.pureWeight;
        }
        if (filters.showPcs && item.pcs) {
          acc.totalPcs += item.pcs;
        }
        acc.totalValue += item.value || 0;
        return acc;
      },
      {
        totalTransactions: 0,
        totalDebit: 0,
        totalCredit: 0,
        totalGrossWeight: 0,
        totalPureWeight: 0,
        totalPcs: 0,
        totalValue: 0,
      }
    );

    // Format individual transactions
    const transactions = reportData.map((item) => {
      const transaction = {
        date: item.date ? moment(item.date, "DD/MM/YYYY").format("DD/MM/YYYY") : "N/A",
        voucherNumber: item.voucherNumber,
        partyName: item.partyName,
        debit: item.debit || 0,
        credit: item.credit || 0,
        value: item.value || 0,
        stock: item.stockCode || "N/A",
      };

      // Add conditional fields based on filters
      if (filters.grossWeight && item.grossWeight !== null) {
        transaction.grossWeight = item.grossWeight;
      }
      if (filters.pureWeight && item.pureWeight !== null) {
        transaction.pureWeight = item.pureWeight;
      }
      if (filters.showPcs && item.pcs !== null) {
        transaction.pcs = item.pcs;
      }

      return transaction;
    });

    return {
      transactions,
      summary,
      appliedFilters: this.getAppliedFiltersInfo(filters),
    };
  }

  /**
   * Generates information about applied filters
   * @param {Object} filters - Validated filter parameters
   * @returns {Object} Summary of applied filters
   */
  getAppliedFiltersInfo(filters) {
    return {
      dateRange:
        filters.startDate && filters.endDate
          ? `${moment(filters.startDate).format("DD/MM/YYYY")} to ${moment(
            filters.endDate
          ).format("DD/MM/YYYY")}`
          : "All dates",
      hasStockFilter: filters.stock.length > 0,
      hasKaratFilter: filters.karat.length > 0,
      hasDivisionFilter: filters.division.length > 0,
      hasVoucherFilter: filters.voucher.length > 0,
      hasAccountTypeFilter: filters.accountType.length > 0,
      showGrossWeight: filters.grossWeight,
      showPureWeight: filters.pureWeight,
      showPcs: filters.showPcs,
    };
  }
}
