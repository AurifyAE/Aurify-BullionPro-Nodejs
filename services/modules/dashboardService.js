import mongoose from "mongoose";
import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import MetalStock from "../../models/modules/inventory.js";
import MetalTransaction from "../../models/modules/MetalTransaction.js";
import AccountMaster from "../../models/modules/accountMaster.js";
import TransactionFixing from "../../models/modules/TransactionFixing.js";

export class DashboardService {
  /**
   * Main dashboard data aggregation
   **/
  async getDashboardData(filters = {}) {
    try {

      const [
        balances,
        stockMetrics,
        transactionSummary,
        unfixedTransactions,
        recentActivity,
        topParties,
        balanceTrend,
        fixedUnfixedCount,
        fixingTransactions,
        payableReceivableSummary
      ] = await Promise.all([
        this.calculateBalances(),
        this.calculateStockMetrics(),
        this.getTransactionSummary(filters),
        this.getUnfixedTransactions(1, 10, filters), 
        this.getRecentActivity(filters),
        this.getTopParties(10, "transactionValue", filters),
        this.getBalanceTrend(filters),
        this.getFixedUnfixedByTransactionType(filters),
        this.getFixingTransactions(filters),
        this.getPayableReceivableSummary()
      ]);

      return {
        success: true,
        data: {
          // Balance Overview (current)
          totalCashBalance: balances.cashBalance,
          totalGoldBalance: balances.goldBalance,
          totalCashValue: balances.totalCashValue,
          
          // Stock Metrics (current)
          currentStock: stockMetrics.totalNetWeight,
          
          // Risk Indicators
          unfixedTransactions: unfixedTransactions,
          unfixedCount: unfixedTransactions.summary.totalUnfixedTransactions,
          unfixedValue: unfixedTransactions.summary.totalValue || 0,
          
          // Trends (for graphs)
          transactionSummaryData: transactionSummary, 
          balanceTrend: balanceTrend, 
          fixedUnfixedCount: fixedUnfixedCount,
          topParties: topParties,
          totalTransactions: topParties.data.totalTransactions || 0,
          fixingTransactions: fixingTransactions,
          payableReceivableSummary: payableReceivableSummary,
          // Recent Activity
          recentTransactions: recentActivity,
          lastUpdated: new Date()
        }
      };
    } catch (error) {
      console.error('Dashboard data error:', error);
      throw new Error(`Failed to fetch dashboard data: ${error.message}`);
    }
  }

  /**
   * Calculate cash and gold balances from Registry
   * Registry.type determines the balance type
   */
  async calculateBalances() {
    try {
      // Calculate gold balance from Registry
      const goldPipeline = [
        {
          $match: {
            isActive: true,
            type: 'PARTY_GOLD_BALANCE'
          }
        },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$runningBalance' }
          }
        }
      ];

      const [goldResult] = await Registry.aggregate(goldPipeline);
      const goldData = goldResult || { totalBalance: 0 };

      // Calculate cash balance from AccountMaster
      const cashPipeline = [
        {
          $match: {
            deleted: false
          }
        },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$openingBalance' }
          }
        }
      ];

      const [cashResult] = await AccountMaster.aggregate(cashPipeline);
      const cashData = cashResult || { totalBalance: 0 };

      return {
        cashBalance: cashData.totalBalance,
        goldBalance: goldData.totalBalance,
        totalCashValue: Math.abs(cashData.totalBalance) + Math.abs(goldData.totalBalance)
      };
    } catch (error) {
      console.error('Calculate balances error:', error);
      return {
        cashBalance: 0,
        goldBalance: 0,
        totalCashValue: 0
      };
    }
  }

  /**
   * Calculate stock metrics from Registry GOLD_STOCK entries
   */
  async calculateStockMetrics() {
    
    const pipeline = [
      {
        $match: {
          isActive: true,
          type: 'GOLD_STOCK'
        }
      },
      {
        $group: {
          _id: '$metalId',
          totalDebit: { $sum: { $ifNull: ['$debit', 0] } },
          totalCredit: { $sum: { $ifNull: ['$credit', 0] } },
          totalValue: { $sum: { $ifNull: ['$value', 0] } },
          totalGrossWeight: { $sum: { $ifNull: ['$grossWeight', 0] } },
          totalPureWeight: { $sum: { $ifNull: ['$pureWeight', 0] } }
        }
      },
      {
        $group: {
          _id: null,
          totalStockValue: { $sum: '$totalValue' },
          totalPureWeight: { $sum: '$totalPureWeight' },
          totalNetWeight: { $sum: { $subtract: ['$totalDebit', '$totalCredit'] } },
          totalDebit: { $sum: '$totalDebit' },
          totalCredit: { $sum: '$totalCredit' },
          uniqueStocks: { $sum: 1 }
        }
      }
      
    ];

    const [result] = await Registry.aggregate(pipeline);

    return {
      totalStockValue: result?.totalStockValue || 0,
      totalPureWeight: result?.totalPureWeight || 0,
      totalNetWeight: result?.totalNetWeight || 0,
      totalPieces: result?.uniqueStocks || 0,
      totalDebit: result?.totalDebit || 0,
      totalCredit: result?.totalCredit || 0
    };
  }

  /**
 * Get summary of total debit and credit for specified transaction types and date period
 */
async getTransactionSummary(filters = {}) {
  const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
  const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

  // Define valid transaction types
  const transactionTypes = ['GOLD_STOCK', 'MAKING_CHARGES', 'PREMIUM', 'VAT', 'sales-fixing', 'purchase-fixing',"OTHER_CHARGES"];

  // Aggregation pipeline for summary data
  const summaryPipeline = [
    {
      $match: {
        isActive: true,
        type: { $in: transactionTypes },
        transactionDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$type',
        totalDebit: { $sum: { $ifNull: ['$debit', 0] } },
        totalCredit: { $sum: { $ifNull: ['$credit', 0] } }
      }
    },
    {
      $project: {
        _id: 0,
        type: '$_id',
        totalDebit: 1,
        totalCredit: 1
      }
    },
    { $sort: { type: 1 } }
  ];

  // Execute pipeline
  const summaryData = await Registry.aggregate(summaryPipeline);

  // Format summary as an object for easier frontend consumption
  const summary = summaryData.reduce((acc, item) => ({
    ...acc,
    [item.type]: {
      totalDebit: item.totalDebit,
      totalCredit: item.totalCredit
    }
  }), {});

  // Ensure all transaction types are included in summary, even if no data exists
  transactionTypes.forEach((type) => {
    if (!summary[type]) {
      summary[type] = { totalDebit: 0, totalCredit: 0 };
    }
  });

  return { summary };
}



  async getFixedUnfixedByTransactionType(filters = {}) {
    const startDate = filters.startDate
      ? new Date(filters.startDate)
      : new Date(new Date().setMonth(new Date().getMonth() - 12));
  
    const endDate = filters.endDate ? new Date(filters.endDate) : new Date();
  
    const pipeline = [
      {
        $match: {
          isActive: true,
          voucherDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$transactionType", // group only by transactionType
          fixedCount: { $sum: { $cond: [{ $eq: ["$fixed", true] }, 1, 0] } },
          unfixedCount: { $sum: { $cond: [{ $eq: ["$unfix", true] }, 1, 0] } },
          fixedAmount: {
            $sum: { $cond: [{ $eq: ["$fixed", true] }, "$totalAmountSession.totalAmountAED", 0] },
          },
          unfixedAmount: {
            $sum: { $cond: [{ $eq: ["$unfix", true] }, "$totalAmountSession.totalAmountAED", 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          transactionType: "$_id",
          fixedCount: 1,
          unfixedCount: 1,
          fixedAmount: 1,
          unfixedAmount: 1,
        },
      },
      { $sort: { transactionType: 1 } },
    ];
  
    return await MetalTransaction.aggregate(pipeline);
  }
  
  /**
   * Get recent activity (last 10 transactions, filtered by period)
   */
  async getRecentActivity(filters = {}) {
    const match = { isActive: true };
    if (filters.startDate) {
      match.transactionDate = { ...(match.transactionDate || {}), $gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      match.transactionDate = { ...(match.transactionDate || {}), $lte: new Date(filters.endDate) };
    }

    const pipeline = [
      { $match: match },
      { $sort: { transactionDate: -1, createdAt: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'accounts',
          localField: 'party',
          foreignField: '_id',
          as: 'partyInfo'
        }
      },
      {
        $project: {
          transactionId: 1,
          type: 1,
          description: 1,
          value: 1,
          transactionDate: 1,
          partyName: { $arrayElemAt: ['$partyInfo.customerName', 0] }
        }
      }
    ];

    return await Registry.aggregate(pipeline);
  }

  /**
   * Get fixing status percentage
   */
  async getFixingStatus() {
    const pipeline = [
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          fixed: {
            $sum: {
              $cond: [{ $ifNull: ['$fixingTransactionId', false] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          fixed: 1,
          unfixed: { $subtract: ['$total', '$fixed'] },
          fixedPercentage: {
            $multiply: [{ $divide: ['$fixed', '$total'] }, 100]
          }
        }
      }
    ];

    const [result] = await Registry.aggregate(pipeline);
    return result || { total: 0, fixed: 0, unfixed: 0, fixedPercentage: 0 };
  }

  /**
   * Get sales vs purchases trend (last 6 months)
   */
  async getSalesPurchaseTrend() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const pipeline = [
      {
        $match: {
          isActive: true,
          metalTransactionId: { $exists: true },
          transactionDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $lookup: {
          from: 'metaltransactions',
          localField: 'metalTransactionId',
          foreignField: '_id',
          as: 'metalTxn'
        }
      },
      { $unwind: '$metalTxn' },
      {
        $match: {
          'metalTxn.transactionType': { $in: ['purchase', 'sale'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$transactionDate' },
            month: { $month: '$transactionDate' },
            type: '$metalTxn.transactionType'
          },
          totalValue: { $sum: { $ifNull: ['$value', 0] } },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month'
          },
          purchases: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'purchase'] }, '$totalValue', 0]
            }
          },
          sales: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'sale'] }, '$totalValue', 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          month: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $cond: [{ $lt: ['$_id.month', 10] }, '0', ''] },
              { $toString: '$_id.month' }
            ]
          },
          purchases: 1,
          sales: 1,
          netProfit: { $subtract: ['$sales', '$purchases'] }
        }
      },
      { $sort: { month: 1 } }
    ];

    return await Registry.aggregate(pipeline);
  }

  /**
   * Get inventory alerts (low stock items)
   */
  async getInventoryAlerts(threshold = 100) {
    const pipeline = [
      {
        $match: {
          isActive: true,
          type: 'GOLD_STOCK'
        }
      },
      {
        $group: {
          _id: '$metalId',
          currentStock: {
            $sum: { $subtract: [{ $ifNull: ['$debit', 0] }, { $ifNull: ['$credit', 0] }] }
          }
        }
      },
      {
        $match: {
          currentStock: { $lt: threshold, $gt: 0 }
        }
      },
      {
        $lookup: {
          from: 'metalstocks',
          localField: '_id',
          foreignField: '_id',
          as: 'stockInfo'
        }
      },
      {
        $unwind: '$stockInfo'
      },
      {
        $project: {
          _id: 0,
          stockCode: '$stockInfo.code',
          description: '$stockInfo.description',
          currentStock: 1,
          status: 'LOW'
        }
      },
      { $sort: { currentStock: 1 } },
      { $limit: 10 }
    ];

    return await Registry.aggregate(pipeline);
  }


  /**
   * get unfixed transactions
   */

   async getUnfixedTransactions(page = 1, limit = 10, filters = {}) {
      const skip = (page - 1) * limit;
      const query = {
        isActive: true,
        unfix: true, // Show only transactions where unfix is true
      };
  
      // Apply filters
      if (filters.transactionType) {
        query.transactionType = filters.transactionType;
      }
      if (filters.partyCode) {
        query.partyCode = filters.partyCode;
      }
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.startDate && filters.endDate) {
        query.voucherDate = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate),
        };
      }
      // Find transactions but only populate specific party fields
      const transactions = await MetalTransaction.find(query)
        .populate({
          path: "partyCode",
          select:
            "accountCode customerName addresses balances.goldBalance.totalGrams balances.cashBalance.amount limitsMargins.shortMargin",
        })
        .sort({ voucherDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);
      const total = await MetalTransaction.countDocuments(query);
  
      // Extract unique party data with only required fields
      const partyDataMap = new Map();
      transactions.forEach((transaction) => {
        if (transaction.partyCode && transaction.partyCode._id) {
          const partyId = transaction.partyCode._id.toString();
          if (!partyDataMap.has(partyId)) {
            const party = transaction.partyCode;
  
            // Find primary address or fallback to first address
            const primaryAddress =
              party.addresses?.find((addr) => addr.isPrimary === true) ||
              party.addresses?.[0];
  
            // Transform party data to include only required fields
            const transformedParty = {
              _id: party._id,
              accountCode: party.accountCode,
              customerName: party.customerName,
              email: primaryAddress?.email || null,
              phone: primaryAddress?.phoneNumber1 || null,
              goldBalance: {
                totalGrams: party.balances?.goldBalance?.totalGrams || 0,
              },
              cashBalance: party.balances?.cashBalance?.amount || 0,
              shortMargin: party.limitsMargins?.[0]?.shortMargin || 0,
            };
  
            partyDataMap.set(partyId, transformedParty);
          }
        }
      });
  
      const uniquePartyData = Array.from(partyDataMap.values());
  
      return {
        parties: uniquePartyData,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        summary: {
          totalUnfixedTransactions: total,
          totalPurchases: transactions.filter(
            (t) => t.transactionType === "purchase"
          ).length,
          totalSales: transactions.filter((t) => t.transactionType === "sale")
            .length,
          totalParties: uniquePartyData.length,
        },
      };
    }



/**
 * Get party-wise transaction breakdown with metal transaction details
 * @param {string} partyId - Party ID to get detailed breakdown
 * @param {Object} filters - Optional filters
 */
async getPartyTransactionBreakdown(partyId, filters = {}) {
  try {
    const matchConditions = {
      isActive: true,
      party: new mongoose.Types.ObjectId(partyId)
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

    // Get Registry transactions
    const registryTransactions = await Registry.find(matchConditions)
      .sort({ transactionDate: -1 })
      .limit(filters.limit || 50)
      .populate('metalTransactionId')
      .populate('party', 'accountCode customerName');

    // Get Metal Transactions for this party
    const metalTxnMatch = {
      isActive: true,
      partyCode: new mongoose.Types.ObjectId(partyId)
    };

    if (filters.startDate || filters.endDate) {
      metalTxnMatch.voucherDate = {};
      if (filters.startDate) {
        metalTxnMatch.voucherDate.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        metalTxnMatch.voucherDate.$lte = new Date(filters.endDate);
      }
    }

    const metalTransactions = await MetalTransaction.find(metalTxnMatch)
      .sort({ voucherDate: -1 })
      .limit(filters.limit || 50)
      .populate('partyCode', 'accountCode customerName')
      .populate('stockItems.stockCode', 'code description');

    // Get party details
    const party = await Account.findById(partyId);

    return {
  
        party: {
          id: party._id,
          code: party.accountCode,
          name: party.customerName,
          goldBalance: party.balances.goldBalance.totalGrams,
          cashBalance: party.balances.cashBalance.amount,
          totalOutstanding: party.balances.totalOutstanding
        },
        registryTransactions,
        metalTransactions,
        summary: {
          totalRegistryTransactions: registryTransactions.length,
          totalMetalTransactions: metalTransactions.length,
          dateRange: {
            startDate: filters.startDate,
            endDate: filters.endDate
          }
        }
      
    };

  } catch (error) {
    console.error('Get party breakdown error:', error);
    throw new Error(`Failed to fetch party breakdown: ${error.message}`);
  }
}


/**
 * Get top parties by transaction volume for fixed transactions, focused on metal weights with return handling
 * @param {number} limit - Number of top parties to return (default: 10)
 * @param {string} sortBy - Metric to sort by: 'transactionValue', 'transactionCount', 'goldBalance', 'pureWeight'
 * @param {Object} filters - Optional filters (dateRange, transactionType, status)
 * @returns {Promise<Object>} - Top parties data with summary and filters
 */
async getTopParties(limit = 10, sortBy = 'transactionValue', filters = {}) {
  try {
    const matchConditions = {
      isActive: true,
      fixed: true, 
      partyCode: { $exists: true, $ne: null },
    };

    if (filters.status) {
      matchConditions.status = filters.status;
    }

  
    if (filters.startDate || filters.endDate) {
      matchConditions.voucherDate = {};
      if (filters.startDate) matchConditions.voucherDate.$gte = new Date(filters.startDate);
      if (filters.endDate) matchConditions.voucherDate.$lte = new Date(filters.endDate);
    }

  
    if (filters.transactionType) {
      matchConditions.transactionType = filters.transactionType;
    } else {
      matchConditions.transactionType = { $in: ['purchase', 'sale', 'purchase_return', 'sale_return'] };
    }

    // Log total transactions count
    const totalTransactions = await MetalTransaction.countDocuments();

    const pipeline = [
      { $match: matchConditions },
      { $unwind: { path: '$stockItems', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$partyCode',
          totalTransactions: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['purchase', 'sale']] }, // Count only purchase/sale, not returns
                1,
                0,
              ],
            },
          },
          totalValue: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'purchase_return'] },
                { $multiply: ['$totalAmountSession.totalAmountAED', -1] }, // Reverse for purchase return
                { $cond: [
                    { $eq: ['$transactionType', 'sale_return'] },
                    { $multiply: ['$totalAmountSession.totalAmountAED', -1] }, // Reverse for sale return
                    '$totalAmountSession.totalAmountAED', // Normal for purchase/sale
                  ],
                },
              ],
            },
          },
          totalGoldDebit: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'purchase_return'] },
                { $multiply: [{ $ifNull: ['$stockItems.goldDebit', 0] }, -1] }, // Reverse debit
                { $ifNull: ['$stockItems.goldDebit', 0] },
              ],
            },
          },
          totalGoldCredit: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'sale_return'] },
                { $multiply: [{ $ifNull: ['$stockItems.goldCredit', 0] }, -1] }, // Reverse credit
                { $ifNull: ['$stockItems.goldCredit', 0] },
              ],
            },
          },
          netGoldBalance: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'purchase_return'] },
                { $multiply: [{ $ifNull: ['$stockItems.goldDebit', 0] }, -1] }, // Reverse debit
                { $cond: [
                    { $eq: ['$transactionType', 'sale_return'] },
                    { $multiply: [{ $ifNull: ['$stockItems.goldCredit', 0] }, -1] }, // Reverse credit
                    { $subtract: [
                        { $ifNull: ['$stockItems.goldDebit', 0] },
                        { $ifNull: ['$stockItems.goldCredit', 0] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          totalPureWeight: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['purchase_return', 'sale_return']] },
                { $multiply: [{ $ifNull: ['$stockItems.pureWeight', 0] }, -1] }, // Reverse weight for returns
                { $ifNull: ['$stockItems.pureWeight', 0] },
              ],
            },
          },
          totalGrossWeight: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['purchase_return', 'sale_return']] },
                { $multiply: [{ $ifNull: ['$stockItems.grossWeight', 0] }, -1] }, // Reverse weight for returns
                { $ifNull: ['$stockItems.grossWeight', 0] },
              ],
            },
          },
          transactionTypes: { $addToSet: '$transactionType' },
          firstTransaction: { $min: '$voucherDate' },
          lastTransaction: { $max: '$voucherDate' },
        },
      },
      {
        $lookup: {
          from: 'accounts',
          localField: '_id',
          foreignField: '_id',
          as: 'partyInfo',
        },
      },
      { $unwind: { path: '$partyInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          outstandingAmount: {
            $abs: { $add: ['$netGoldBalance', { $ifNull: ['$partyInfo.balances.totalOutstanding', 0] }] },
          },
          avgTransactionValue: {
            $cond: [
              { $gt: ['$totalTransactions', 0] },
              { $divide: ['$totalValue', '$totalTransactions'] },
              0,
            ],
          },
          primaryContact: {
            $arrayElemAt: [
              { $filter: { input: { $ifNull: ['$partyInfo.addresses', []] }, as: 'addr', cond: { $eq: ['$$addr.isPrimary', true] } } },
              0,
            ],
          },
        },
      },
      {
        $project: {
          partyId: '$_id',
          partyCode: '$partyInfo.accountCode',
          partyName: '$partyInfo.customerName',
          accountType: '$partyInfo.accountType',
          classification: '$partyInfo.classification',
          email: '$primaryContact.email',
          phone: '$primaryContact.phoneNumber1',
          city: '$primaryContact.city',
          country: '$primaryContact.city', // Fixed typo (was city)
          transactionCount: '$totalTransactions',
          totalValue: { $round: ['$totalValue', 2] },
          avgTransactionValue: { $round: ['$avgTransactionValue', 2] },
          netGoldBalance: { $round: ['$netGoldBalance', 3] },
          goldDebit: { $round: ['$totalGoldDebit', 3] },
          goldCredit: { $round: ['$totalGoldCredit', 3] },
          totalPureWeight: { $round: ['$totalPureWeight', 3] },
          totalGrossWeight: { $round: ['$totalGrossWeight', 3] },
          partyGoldBalance: '$partyInfo.balances.goldBalance.totalGrams',
          partyTotalOutstanding: '$partyInfo.balances.totalOutstanding',
          shortMargin: { $arrayElemAt: ['$partyInfo.limitsMargins.shortMargin', 0] },
          creditDaysMtl: { $arrayElemAt: ['$partyInfo.limitsMargins.creditDaysMtl', 0] },
          transactionTypes: 1,
          firstTransaction: 1,
          lastTransaction: 1,
          isActive: '$partyInfo.isActive',
          status: '$partyInfo.status',
        },
      },
    ];

    const sortField = {
      transactionValue: { totalValue: -1 },
      transactionCount: { transactionCount: -1 },
      goldBalance: { netGoldBalance: -1 },
      pureWeight: { totalPureWeight: -1 },
      outstanding: { outstandingAmount: -1 },
      avgTransaction: { avgTransactionValue: -1 },
    }[sortBy] || { totalValue: -1 };

    pipeline.push({ $sort: sortField });
    pipeline.push({ $limit: limit });


    const topParties = await MetalTransaction.aggregate(pipeline).catch((err) => {
      console.error('Aggregation error:', err);
      return [];
    });

    // Summary pipeline
    const summaryPipeline = [
      { $match: matchConditions },
      { $unwind: { path: '$stockItems', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalParties: { $addToSet: '$partyCode' },
          totalTransactions: {
            $sum: {
              $cond: [{ $in: ['$transactionType', ['purchase', 'sale']] }, 1, 0], // Count only purchase/sale
            },
          },
          totalPurchases: {
            $sum: { $cond: [{ $eq: ['$transactionType', 'purchase'] }, 1, 0] },
          },
          totalSales: {
            $sum: { $cond: [{ $eq: ['$transactionType', 'sale'] }, 1, 0] },
          },
          totalPurchaseReturns: {
            $sum: { $cond: [{ $eq: ['$transactionType', 'purchase_return'] }, 1, 0] },
          },
          totalSaleReturns: {
            $sum: { $cond: [{ $eq: ['$transactionType', 'sale_return'] }, 1, 0] },
          },
          totalValue: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'purchase_return'] },
                { $multiply: ['$totalAmountSession.totalAmountAED', -1] },
                { $cond: [
                    { $eq: ['$transactionType', 'sale_return'] },
                    { $multiply: ['$totalAmountSession.totalAmountAED', -1] },
                    '$totalAmountSession.totalAmountAED',
                  ],
                },
              ],
            },
          },
          totalGoldFlow: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['purchase_return', 'sale_return']] },
                { $multiply: [{ $add: [{ $ifNull: ['$stockItems.goldDebit', 0] }, { $ifNull: ['$stockItems.goldCredit', 0] }] }, -1] },
                { $add: [{ $ifNull: ['$stockItems.goldDebit', 0] }, { $ifNull: ['$stockItems.goldCredit', 0] }] },
              ],
            },
          },
          totalPureWeight: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['purchase_return', 'sale_return']] },
                { $multiply: [{ $ifNull: ['$stockItems.pureWeight', 0] }, -1] },
                { $ifNull: ['$stockItems.pureWeight', 0] },
              ],
            },
          },
          totalGrossWeight: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['purchase_return', 'sale_return']] },
                { $multiply: [{ $ifNull: ['$stockItems.grossWeight', 0] }, -1] },
                { $ifNull: ['$stockItems.grossWeight', 0] },
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalUniqueParties: { $size: '$totalParties' },
          totalTransactions: 1,
          totalPurchases: 1,
          totalSales: 1,
          totalPurchaseReturns: 1,
          totalSaleReturns: 1,
          totalValue: { $round: ['$totalValue', 2] },
          totalGoldFlow: { $round: ['$totalGoldFlow', 3] },
          totalPureWeight: { $round: ['$totalPureWeight', 3] },
          totalGrossWeight: { $round: ['$totalGrossWeight', 3] },
        },
      },
    ];

    const [summary] = await MetalTransaction.aggregate(summaryPipeline).catch((err) => {
      console.error('Summary aggregation error:', err);
      return [null];
    });

    return {
      success: true,
      data: {
        topParties,
        totalTransactions: totalTransactions || 0,
        summary: summary || {
          totalUniqueParties: 0,
          totalTransactions: 0,
          totalPurchases: 0,
          totalSales: 0,
          totalPurchaseReturns: 0,
          totalSaleReturns: 0,
          totalValue: 0,
          totalGoldFlow: 0,
          totalPureWeight: 0,
          totalGrossWeight: 0,
        },
        filters: {
          limit,
          sortBy,
          dateRange: filters.startDate || filters.endDate ? { startDate: filters.startDate, endDate: filters.endDate } : null,
          transactionType: filters.transactionType || null,
          status: filters.status || null,
        },
        generatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error('Get top parties error:', error);
    throw new Error(`Failed to fetch top parties: ${error.message}`);
  }
}

  /**
   * Get balance trend for the period
   * @param {Object} filters - Date range filters
   * @returns {Promise<Array>} - Array of {date, cash, gold}
   */
  async getBalanceTrend(filters = {}) {
    try {
      const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
      const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

      // Cash deltas
      const cashDeltasPipeline = [
        {
          $match: {
            isActive: true,
            transactionDate: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            delta: { $sum: { $subtract: [ { $ifNull: ['$cashDebit', 0] }, { $ifNull: ['$cashCredit', 0] } ] } }
          }
        },
        { $sort: { _id: 1 } }
      ];
      const cashDeltas = await Registry.aggregate(cashDeltasPipeline);

      // Gold deltas
      const goldDeltasPipeline = [
        {
          $match: {
            isActive: true,
            transactionDate: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            delta: { $sum: { $subtract: [ { $ifNull: ['$goldDebit', 0] }, { $ifNull: ['$goldCredit', 0] } ] } }
          }
        },
        { $sort: { _id: 1 } }
      ];
      const goldDeltas = await Registry.aggregate(goldDeltasPipeline);

      // Current balances
      const { cashBalance: currentCash, goldBalance: currentGold } = await this.calculateBalances();

      // Total deltas in period
      const totalCashDelta = cashDeltas.reduce((sum, d) => sum + d.delta, 0);
      const totalGoldDelta = goldDeltas.reduce((sum, d) => sum + d.delta, 0);

      // Start balances for the period
      const startCash = currentCash - totalCashDelta;
      const startGold = currentGold - totalGoldDelta;

      // Unique sorted months
      const months = [...new Set([...cashDeltas.map(d => d._id), ...goldDeltas.map(d => d._id)])].sort();

      // Build trend data
      const trend = [];
      let cumCash = startCash;
      let cumGold = startGold;

      months.forEach((month) => {
        const cashD = cashDeltas.find(d => d._id === month);
        const goldD = goldDeltas.find(d => d._id === month);
        cumCash += cashD ? cashD.delta : 0;
        cumGold += goldD ? goldD.delta : 0;
        trend.push({
          date: month,
          cash: cumCash,
          gold: cumGold
        });
      });

      return trend;
    } catch (error) {
      console.error('Get balance trend error:', error);
      return [];
    }
  }



/**
 * Get summary of total debit and credit for transactions grouped by voucherType
 * @param {Object} filters - Contains startDate and endDate for the period
 * @returns {Object} Summary object with total debit and credit per voucherType
 */
async  getFixingTransactions(filters = {}) {
  // Default to last 12 months if no dates provided
  const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().setMonth(new Date().getMonth() - 12));
  const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

  // Aggregation pipeline
  const pipeline = [
    {
      $match: {
        isActive: true,
        status: 'active',
        type: { $in: ['purchase', 'sell'] },
        transactionDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $unwind: '$orders'
    },
    {
      $group: {
        _id: '$type',
        totalPrice: { $sum: '$orders.price' },
        totalPureWeight: { $sum: '$orders.quantityGm' }
      }
    },
    {
      $group: {
        _id: null,
        totalDebit: {
          $sum: {
            $cond: [{ $eq: ['$_id', 'purchase'] }, '$totalPrice', 0]
          }
        },
        totalCredit: {
          $sum: {
            $cond: [{ $eq: ['$_id', 'sell'] }, '$totalPrice', 0]
          }
        },
        totalPureWeightPurchase: {
          $sum: {
            $cond: [{ $eq: ['$_id', 'purchase'] }, '$totalPureWeight', 0]
          }
        },
        totalPureWeightSell: {
          $sum: {
            $cond: [{ $eq: ['$_id', 'sell'] }, '$totalPureWeight', 0]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalDebit: 1,
        totalCredit: 1,
        totalPureWeightPurchase: 1,
        totalPureWeightSell: 1
      }
    }
  ];

  // Execute pipeline
  const [summaryData] = await TransactionFixing.aggregate(pipeline);

  // Return summary with defaults if no data
  return {
    summary: summaryData || {
      totalDebit: 0,
      totalCredit: 0,
      totalPureWeightPurchase: 0,
      totalPureWeightSell: 0
    }
  };
}


async  getPayableReceivableSummary() {
  const pipeline = [
    {
      $match: {
        isActive: true,
        status: "active",
      },
    },
    {
      $group: {
        _id: null,
        totalPayable: {
          $sum: {
            $cond: [{ $gt: ["$balances.cashBalance.amount", 0] }, "$balances.cashBalance.amount", 0],
          },
        },
        totalReceivable: {
          $sum: {
            $cond: [{ $lt: ["$balances.cashBalance.amount", 0] }, "$balances.cashBalance.amount", 0],
          },
        },
        totalAccounts: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        totalPayable: 1,
        totalReceivable: { $abs: "$totalReceivable" }, // convert negative sum to positive
        totalAccounts: 1,
      },
    },
  ];

  const result = await Account.aggregate(pipeline);
  return result[0] || { totalPayable: 0, totalReceivable: 0, totalAccounts: 0 };
}
}