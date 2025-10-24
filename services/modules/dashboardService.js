import mongoose from 'mongoose';
import Registry from '../../models/modules/Registry.js';
import Account from '../../models/modules/AccountType.js';
import MetalStock from '../../models/modules/inventory.js';
import MetalTransaction from '../../models/modules/MetalTransaction.js';
import AccountMaster from '../../models/modules/accountMaster.js';
import TransactionFixing from '../../models/modules/TransactionFixing.js';
import { normalizeDateRange } from '../../utils/dateUtils.js'; // Adjust path

export class DashboardService {
  /**
   * Main dashboard data aggregation
   */
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
        payableReceivableSummary,
      ] = await Promise.all([
        this.calculateBalances(),
        this.calculateStockMetrics(),
        this.getTransactionSummary(filters),
        this.getUnfixedTransactions(1, 10, filters),
        this.getRecentActivity(filters),
        this.getTopParties(10, 'transactionValue', filters),
        this.getBalanceTrend(filters),
        this.getFixedUnfixedByTransactionType(filters),
        this.getFixingTransactions(filters),
        this.getPayableReceivableSummary(),
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
          unfixedTransactions,
          unfixedCount: unfixedTransactions.summary.totalUnfixedTransactions,
          unfixedValue: unfixedTransactions.summary.totalValue || 0,
          // Trends (for graphs)
          transactionSummaryData: transactionSummary,
          balanceTrend,
          fixedUnfixedCount,
          topParties,
          totalTransactions: topParties.data.totalTransactions || 0,
          fixingTransactions,
          payableReceivableSummary,
          // Recent Activity
          recentTransactions: recentActivity,
          lastUpdated: new Date(),
        },
      };
    } catch (error) {
      console.error('Dashboard data error:', error.message);
      throw new Error(`Failed to fetch dashboard data: ${error.message}`);
    }
  }

  /**
   * Calculate cash and gold balances from Registry
   */
  async calculateBalances() {
    try {
      const goldPipeline = [
        {
          $match: {
            isActive: true,
            type: 'PARTY_GOLD_BALANCE',
          },
        },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$runningBalance' },
          },
        },
      ];

      const [goldResult] = await Registry.aggregate(goldPipeline).exec();
      const goldData = goldResult || { totalBalance: 0 };

      const cashPipeline = [
        {
          $match: {
            deleted: false,
          },
        },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$openingBalance' },
          },
        },
      ];

      const [cashResult] = await AccountMaster.aggregate(cashPipeline).exec();
      const cashData = cashResult || { totalBalance: 0 };

      return {
        cashBalance: cashData.totalBalance,
        goldBalance: goldData.totalBalance,
        totalCashValue: Math.abs(cashData.totalBalance) + Math.abs(goldData.totalBalance),
      };
    } catch (error) {
      console.error('Calculate balances error:', error.message);
      return {
        cashBalance: 0,
        goldBalance: 0,
        totalCashValue: 0,
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
          type: 'GOLD_STOCK',
        },
      },
      {
        $group: {
          _id: '$metalId',
          totalDebit: { $sum: { $ifNull: ['$debit', 0] } },
          totalCredit: { $sum: { $ifNull: ['$credit', 0] } },
          totalValue: { $sum: { $ifNull: ['$value', 0] } },
          totalGrossWeight: { $sum: { $ifNull: ['$grossWeight', 0] } },
          totalPureWeight: { $sum: { $ifNull: ['$pureWeight', 0] } },
        },
      },
      {
        $group: {
          _id: null,
          totalStockValue: { $sum: '$totalValue' },
          totalPureWeight: { $sum: '$totalPureWeight' },
          totalNetWeight: { $sum: { $subtract: ['$totalDebit', '$totalCredit'] } },
          totalDebit: { $sum: '$totalDebit' },
          totalCredit: { $sum: '$totalCredit' },
          uniqueStocks: { $sum: 1 },
        },
      },
    ];

    const [result] = await Registry.aggregate(pipeline).exec();
    // console.log('Stock Metrics Result:', result);

    return {
      totalStockValue: result?.totalStockValue || 0,
      totalPureWeight: result?.totalPureWeight || 0,
      totalNetWeight: result?.totalNetWeight || 0,
      totalPieces: result?.uniqueStocks || 0,
      totalDebit: result?.totalDebit || 0,
      totalCredit: result?.totalCredit || 0,
    };
  }

  /**
   * Get summary of total debit and credit for specified transaction types and date period
   */
  async getTransactionSummary(filters = {}) {
    const transactionTypes = [
      'GOLD_STOCK',
      'MAKING_CHARGES',
      'PREMIUM',
      'VAT',
      'sales-fixing',
      'purchase-fixing',
      'OTHER_CHARGES',
    ];

    const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 1);

    const typeFilter = filters.transactionType
      ? Array.isArray(filters.transactionType)
        ? filters.transactionType.filter(t => transactionTypes.includes(t))
        : transactionTypes.includes(filters.transactionType)
        ? [filters.transactionType]
        : transactionTypes
      : transactionTypes;

    // console.log('Filters in getTransactionSummary:', {
    //   startDate: startDate.toISOString(),
    //   endDate: endDate.toISOString(),
    //   transactionType: typeFilter,
    //   status: filters.status,
    // });

    const summaryPipeline = [
      {
        $match: {
          isActive: true,
          type: { $in: typeFilter },
          transactionDate: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: '$type',
          totalDebit: { $sum: { $ifNull: ['$debit', 0] } },
          totalCredit: { $sum: { $ifNull: ['$credit', 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          type: '$_id',
          totalDebit: 1,
          totalCredit: 1,
        },
      },
      { $sort: { type: 1 } },
    ];

    // console.log('Summary Pipeline:', JSON.stringify(summaryPipeline, null, 2));

    // Debug: Check data existence
    const totalDocs = await Registry.countDocuments({ isActive: true, type: { $in: typeFilter } });
    const matchedDocs = await Registry.find({
      isActive: true,
      type: { $in: typeFilter },
      transactionDate: { $gte: startDate, $lte: endDate },
    })
      .limit(5)
      .lean();
    // console.log('Total documents (isActive: true, type in list):', totalDocs);
    // console.log(
    //   'Sample matched documents:',
    //   matchedDocs.map(d => ({
    //     _id: d._id,
    //     type: d.type,
    //     transactionDate: d.transactionDate,
    //     debit: d.debit,
    //     credit: d.credit,
    //   }))
    // );

    const summaryData = await Registry.aggregate(summaryPipeline).exec();
    // console.log('Summary Data:', summaryData);

    const summary = summaryData.reduce(
      (acc, item) => ({
        ...acc,
        [item.type]: {
          totalDebit: item.totalDebit,
          totalCredit: item.totalCredit,
        },
      }),
      {}
    );

    transactionTypes.forEach(type => {
      if (!summary[type]) {
        summary[type] = { totalDebit: 0, totalCredit: 0 };
      }
    });

    return { summary };
  }

  /**
   * Get fixed vs unfixed transactions by transaction type
   */
  async getFixedUnfixedByTransactionType(filters = {}) {
    const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 12);

    // console.log('Filters in getFixedUnfixedByTransactionType:', {
    //   startDate: startDate.toISOString(),
    //   endDate: endDate.toISOString(),
    // });

    const pipeline = [
      {
        $match: {
          isActive: true,
          voucherDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$transactionType',
          fixedCount: { $sum: { $cond: [{ $eq: ['$fixed', true] }, 1, 0] } },
          unfixedCount: { $sum: { $cond: [{ $eq: ['$unfix', true] }, 1, 0] } },
          fixedAmount: {
            $sum: { $cond: [{ $eq: ['$fixed', true] }, '$totalAmountSession.totalAmountAED', 0] },
          },
          unfixedAmount: {
            $sum: { $cond: [{ $eq: ['$unfix', true] }, '$totalAmountSession.totalAmountAED', 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          transactionType: '$_id',
          fixedCount: 1,
          unfixedCount: 1,
          fixedAmount: 1,
          unfixedAmount: 1,
        },
      },
      { $sort: { transactionType: 1 } },
    ];

    // console.log('Fixed/Unfixed Pipeline:', JSON.stringify(pipeline, null, 2));

    const matchedDocs = await MetalTransaction.find({
      isActive: true,
      voucherDate: { $gte: startDate, $lte: endDate },
    })
      .limit(5)
      .lean();
    // console.log(
    //   'Sample matched documents:',
    //   matchedDocs.map(d => ({
    //     _id: d._id,
    //     transactionType: d.transactionType,
    //     voucherDate: d.voucherDate,
    //     fixed: d.fixed,
    //     unfix: d.unfix,
    //     totalAmountAED: d.totalAmountSession?.totalAmountAED,
    //   }))
    // );

    return await MetalTransaction.aggregate(pipeline).exec();
  }

  /**
   * Get recent activity (last 10 transactions, filtered by period)
   */
  async getRecentActivity(filters = {}) {
    const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 1);
    const match = {
      isActive: true,
      transactionDate: { $gte: startDate, $lte: endDate },
    };

    const pipeline = [
      { $match: match },
      { $sort: { transactionDate: -1, createdAt: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'accounts',
          localField: 'party',
          foreignField: '_id',
          as: 'partyInfo',
        },
      },
      {
        $project: {
          transactionId: 1,
          type: 1,
          description: 1,
          value: 1,
          transactionDate: 1,
          partyName: { $arrayElemAt: ['$partyInfo.customerName', 0] },
        },
      },
    ];

    // console.log('Recent Activity Filters:', {
    //   startDate: startDate.toISOString(),
    //   endDate: endDate.toISOString(),
    // });

    const matchedDocs = await Registry.find(match).limit(5).lean();
    // console.log(
    //   'Sample recent activity documents:',
    //   matchedDocs.map(d => ({
    //     _id: d._id,
    //     type: d.type,
    //     transactionDate: d.transactionDate,
    //   }))
    // );

    return await Registry.aggregate(pipeline).exec();
  }

  /**
   * Get fixing status percentage
   */
  async getFixingStatus() {
    const pipeline = [
      {
        $match: { isActive: true },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          fixed: {
            $sum: {
              $cond: [{ $ifNull: ['$fixingTransactionId', false] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          fixed: 1,
          unfixed: { $subtract: ['$total', '$fixed'] },
          fixedPercentage: {
            $multiply: [{ $divide: ['$fixed', '$total'] }, 100],
          },
        },
      },
    ];

    const [result] = await Registry.aggregate(pipeline).exec();
    return result || { total: 0, fixed: 0, unfixed: 0, fixedPercentage: 0 };
  }

  /**
   * Get sales vs purchases trend (last 6 months)
   */
  async getSalesPurchaseTrend() {
    const { startDate } = normalizeDateRange(null, null, 6);

    const pipeline = [
      {
        $match: {
          isActive: true,
          metalTransactionId: { $exists: true },
          transactionDate: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: 'metaltransactions',
          localField: 'metalTransactionId',
          foreignField: '_id',
          as: 'metalTxn',
        },
      },
      { $unwind: '$metalTxn' },
      {
        $match: {
          'metalTxn.transactionType': { $in: ['purchase', 'sale'] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$transactionDate' },
            month: { $month: '$transactionDate' },
            type: '$metalTxn.transactionType',
          },
          totalValue: { $sum: { $ifNull: ['$value', 0] } },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month',
          },
          purchases: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'purchase'] }, '$totalValue', 0],
            },
          },
          sales: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'sale'] }, '$totalValue', 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          month: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $cond: [{ $lt: ['$_id.month', 10] }, '0', ''] },
              { $toString: '$_id.month' },
            ],
          },
          purchases: 1,
          sales: 1,
          netProfit: { $subtract: ['$sales', '$purchases'] },
        },
      },
      { $sort: { month: 1 } },
    ];

    return await Registry.aggregate(pipeline).exec();
  }

  /**
   * Get inventory alerts (low stock items)
   */
  async getInventoryAlerts(threshold = 100) {
    const pipeline = [
      {
        $match: {
          isActive: true,
          type: 'GOLD_STOCK',
        },
      },
      {
        $group: {
          _id: '$metalId',
          currentStock: {
            $sum: { $subtract: [{ $ifNull: ['$debit', 0] }, { $ifNull: ['$credit', 0] }] },
          },
        },
      },
      {
        $match: {
          currentStock: { $lt: threshold, $gt: 0 },
        },
      },
      {
        $lookup: {
          from: 'metalstocks',
          localField: '_id',
          foreignField: '_id',
          as: 'stockInfo',
        },
      },
      {
        $unwind: '$stockInfo',
      },
      {
        $project: {
          _id: 0,
          stockCode: '$stockInfo.code',
          description: '$stockInfo.description',
          currentStock: 1,
          status: 'LOW',
        },
      },
      { $sort: { currentStock: 1 } },
      { $limit: 10 },
    ];

    return await Registry.aggregate(pipeline).exec();
  }

  /**
   * Get unfixed transactions
   */
  async getUnfixedTransactions(page = 1, limit = 10, filters = {}) {
    const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 1);
    const skip = (page - 1) * limit;
    const query = {
      isActive: true,
      unfix: true,
    };

    if (filters.transactionType) {
      query.transactionType = filters.transactionType;
    }
    if (filters.partyCode) {
      query.partyCode = filters.partyCode;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.startDate || filters.endDate) {
      query.voucherDate = { $gte: startDate, $lte: endDate };
    }

    // console.log('Unfixed Transactions Filters:', {
    //   startDate: startDate.toISOString(),
    //   endDate: endDate.toISOString(),
    //   query,
    // });

    const matchedDocs = await MetalTransaction.find(query).limit(5).lean();
    // console.log(
    //   'Sample unfixed documents:',
    //   matchedDocs.map(d => ({
    //     _id: d._id,
    //     transactionType: d.transactionType,
    //     voucherDate: d.voucherDate,
    //   }))
    // );

    const transactions = await MetalTransaction.find(query)
      .populate({
        path: 'partyCode',
        select:
          'accountCode customerName addresses balances.goldBalance.totalGrams balances.cashBalance.amount limitsMargins.shortMargin',
      })
      .sort({ voucherDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await MetalTransaction.countDocuments(query);

    const partyDataMap = new Map();
    transactions.forEach(transaction => {
      if (transaction.partyCode && transaction.partyCode._id) {
        const partyId = transaction.partyCode._id.toString();
        if (!partyDataMap.has(partyId)) {
          const party = transaction.partyCode;
          const primaryAddress =
            party.addresses?.find(addr => addr.isPrimary === true) || party.addresses?.[0];

          partyDataMap.set(partyId, {
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
          });
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
        totalPurchases: transactions.filter(t => t.transactionType === 'purchase').length,
        totalSales: transactions.filter(t => t.transactionType === 'sale').length,
        totalParties: uniquePartyData.length,
      },
    };
  }

  /**
   * Get party-wise transaction breakdown with metal transaction details
   */
  async getPartyTransactionBreakdown(partyId, filters = {}) {
    try {
      const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 1);
      const matchConditions = {
        isActive: true,
        party: new mongoose.Types.ObjectId(partyId),
        transactionDate: { $gte: startDate, $lte: endDate },
      };

      // console.log('Party Breakdown Filters:', {
      //   partyId,
      //   startDate: startDate.toISOString(),
      //   endDate: endDate.toISOString(),
      // });

      const registryTransactions = await Registry.find(matchConditions)
        .sort({ transactionDate: -1 })
        .limit(filters.limit || 50)
        .populate('metalTransactionId')
        .populate('party', 'accountCode customerName')
        .lean();

      const metalTxnMatch = {
        isActive: true,
        partyCode: new mongoose.Types.ObjectId(partyId),
        voucherDate: { $gte: startDate, $lte: endDate },
      };

      const metalTransactions = await MetalTransaction.find(metalTxnMatch)
        .sort({ voucherDate: -1 })
        .limit(filters.limit || 50)
        .populate('partyCode', 'accountCode customerName')
        .populate('stockItems.stockCode', 'code description')
        .lean();

      // console.log('Sample registry transactions:', registryTransactions.slice(0, 5).map(t => ({
      //   _id: t._id,
      //   transactionDate: t.transactionDate,
      //   type: t.type,
      // })));
      // console.log('Sample metal transactions:', metalTransactions.slice(0, 5).map(t => ({
      //   _id: t._id,
      //   voucherDate: t.voucherDate,
      //   transactionType: t.transactionType,
      // })));

      const party = await Account.findById(partyId).lean();

      return {
        party: {
          id: party._id,
          code: party.accountCode,
          name: party.customerName,
          goldBalance: party.balances?.goldBalance?.totalGrams || 0,
          cashBalance: party.balances?.cashBalance?.amount || 0,
          totalOutstanding: party.balances?.totalOutstanding || 0,
        },
        registryTransactions,
        metalTransactions,
        summary: {
          totalRegistryTransactions: registryTransactions.length,
          totalMetalTransactions: metalTransactions.length,
          dateRange: {
            startDate: filters.startDate,
            endDate: filters.endDate,
          },
        },
      };
    } catch (error) {
      console.error('Get party breakdown error:', error.message);
      throw new Error(`Failed to fetch party breakdown: ${error.message}`);
    }
  }

  /**
   * Get top parties by transaction volume for fixed transactions
   */
  async getTopParties(limit = 10, sortBy = 'transactionValue', filters = {}) {
    try {
      const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 1);
      const matchConditions = {
        isActive: true,
        fixed: true,
        partyCode: { $exists: true, $ne: null },
        voucherDate: { $gte: startDate, $lte: endDate },
      };

      if (filters.status) {
        matchConditions.status = filters.status;
      }

      if (filters.transactionType) {
        matchConditions.transactionType = filters.transactionType;
      } else {
        matchConditions.transactionType = { $in: ['purchase', 'sale', 'purchase_return', 'sale_return'] };
      }

      // console.log('Top Parties Filters:', {
      //   startDate: startDate.toISOString(),
      //   endDate: endDate.toISOString(),
      //   transactionType: matchConditions.transactionType,
      //   status: filters.status,
      // });

      const totalTransactions = await MetalTransaction.countDocuments();

      const pipeline = [
        { $match: matchConditions },
        { $unwind: { path: '$stockItems', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$partyCode',
            totalTransactions: {
              $sum: {
                $cond: [{ $in: ['$transactionType', ['purchase', 'sale']] }, 1, 0],
              },
            },
            totalValue: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'purchase_return'] },
                  { $multiply: ['$totalAmountSession.totalAmountAED', -1] },
                  {
                    $cond: [
                      { $eq: ['$transactionType', 'sale_return'] },
                      { $multiply: ['$totalAmountSession.totalAmountAED', -1] },
                      '$totalAmountSession.totalAmountAED',
                    ],
                  },
                ],
              },
            },
            totalGoldDebit: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'purchase_return'] },
                  { $multiply: [{ $ifNull: ['$stockItems.goldDebit', 0] }, -1] },
                  { $ifNull: ['$stockItems.goldDebit', 0] },
                ],
              },
            },
            totalGoldCredit: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'sale_return'] },
                  { $multiply: [{ $ifNull: ['$stockItems.goldCredit', 0] }, -1] },
                  { $ifNull: ['$stockItems.goldCredit', 0] },
                ],
              },
            },
            netGoldBalance: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'purchase_return'] },
                  { $multiply: [{ $ifNull: ['$stockItems.goldDebit', 0] }, -1] },
                  {
                    $cond: [
                      { $eq: ['$transactionType', 'sale_return'] },
                      { $multiply: [{ $ifNull: ['$stockItems.goldCredit', 0] }, -1] },
                      {
                        $subtract: [
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
            country: '$primaryContact.country', // Fixed typo
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

      const matchedDocs = await MetalTransaction.find(matchConditions).limit(5).lean();
      // console.log(
      //   'Sample top parties documents:',
      //   matchedDocs.map(d => ({
      //     _id: d._id,
      //     partyCode: d.partyCode,
      //     voucherDate: d.voucherDate,
      //     transactionType: d.transactionType,
      //   }))
      // );

      const topParties = await MetalTransaction.aggregate(pipeline).exec();

      const summaryPipeline = [
        { $match: matchConditions },
        { $unwind: { path: '$stockItems', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalParties: { $addToSet: '$partyCode' },
            totalTransactions: {
              $sum: { $cond: [{ $in: ['$transactionType', ['purchase', 'sale']] }, 1, 0] },
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
                  {
                    $cond: [
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

      const [summary] = await MetalTransaction.aggregate(summaryPipeline).exec();

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
      console.error('Get top parties error:', error.message);
      throw new Error(`Failed to fetch top parties: ${error.message}`);
    }
  }

  /**
   * Get balance trend for the period
   */
  async getBalanceTrend(filters = {}) {
    try {
      const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 12);

      // console.log('Balance Trend Filters:', {
      //   startDate: startDate.toISOString(),
      //   endDate: endDate.toISOString(),
      // });

      const cashDeltasPipeline = [
        {
          $match: {
            isActive: true,
            transactionDate: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            delta: { $sum: { $subtract: [{ $ifNull: ['$cashDebit', 0] }, { $ifNull: ['$cashCredit', 0] }] } },
          },
        },
        { $sort: { _id: 1 } },
      ];
      const goldDeltasPipeline = [
        {
          $match: {
            isActive: true,
            transactionDate: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            delta: { $sum: { $subtract: [{ $ifNull: ['$goldDebit', 0] }, { $ifNull: ['$goldCredit', 0] }] } },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const [cashDeltas, goldDeltas] = await Promise.all([
        Registry.aggregate(cashDeltasPipeline).exec(),
        Registry.aggregate(goldDeltasPipeline).exec(),
      ]);


      const { cashBalance: currentCash, goldBalance: currentGold } = await this.calculateBalances();
      const totalCashDelta = cashDeltas.reduce((sum, d) => sum + d.delta, 0);
      const totalGoldDelta = goldDeltas.reduce((sum, d) => sum + d.delta, 0);
      const startCash = currentCash - totalCashDelta;
      const startGold = currentGold - totalGoldDelta;

      const months = [...new Set([...cashDeltas.map(d => d._id), ...goldDeltas.map(d => d._id)])].sort();
      const trend = [];
      let cumCash = startCash;
      let cumGold = startGold;

      months.forEach(month => {
        const cashD = cashDeltas.find(d => d._id === month);
        const goldD = goldDeltas.find(d => d._id === month);
        cumCash += cashD ? cashD.delta : 0;
        cumGold += goldD ? goldD.delta : 0;
        trend.push({
          date: month,
          cash: cumCash,
          gold: cumGold,
        });
      });

      return trend;
    } catch (error) {
      console.error('Get balance trend error:', error.message);
      return [];
    }
  }

  /**
   * Get fixing transactions summary
   */
  async getFixingTransactions(filters = {}) {
    const { startDate, endDate } = normalizeDateRange(filters.startDate, filters.endDate, 12);

    const pipeline = [
      {
        $match: {
          isActive: true,
          status: 'active',
          type: { $in: ['purchase', 'sell'] },
          transactionDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $unwind: '$orders',
      },
      {
        $group: {
          _id: '$type',
          totalPrice: { $sum: '$orders.price' },
          totalPureWeight: { $sum: '$orders.quantityGm' },
        },
      },
      {
        $group: {
          _id: null,
          totalDebit: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'purchase'] }, '$totalPrice', 0],
            },
          },
          totalCredit: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'sell'] }, '$totalPrice', 0],
            },
          },
          totalPureWeightPurchase: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'purchase'] }, '$totalPureWeight', 0],
            },
          },
          totalPureWeightSell: {
            $sum: {
              $cond: [{ $eq: ['$_id', 'sell'] }, '$totalPureWeight', 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalDebit: 1,
          totalCredit: 1,
          totalPureWeightPurchase: 1,
          totalPureWeightSell: 1,
        },
      },
    ];


    const matchedDocs = await TransactionFixing.find({
      isActive: true,
      status: 'active',
      type: { $in: ['purchase', 'sell'] },
      transactionDate: { $gte: startDate, $lte: endDate },
    })
      .limit(5)
      .lean();
  

    const [summaryData] = await TransactionFixing.aggregate(pipeline).exec();

    return {
      summary: summaryData || {
        totalDebit: 0,
        totalCredit: 0,
        totalPureWeightPurchase: 0,
        totalPureWeightSell: 0,
      },
    };
  }

  /**
   * Get payable and receivable summary
   */
  async getPayableReceivableSummary() {
    const pipeline = [
      {
        $match: {
          isActive: true,
          status: 'active',
        },
      },
      {
        $group: {
          _id: null,
          totalPayable: {
            $sum: {
              $cond: [{ $gt: ['$balances.cashBalance.amount', 0] }, '$balances.cashBalance.amount', 0],
            },
          },
          totalReceivable: {
            $sum: {
              $cond: [{ $lt: ['$balances.cashBalance.amount', 0] }, '$balances.cashBalance.amount', 0],
            },
          },
          totalAccounts: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalPayable: 1,
          totalReceivable: { $abs: '$totalReceivable' },
          totalAccounts: 1,
        },
      },
    ];

    const [result] = await Account.aggregate(pipeline).exec();
    return result || { totalPayable: 0, totalReceivable: 0, totalAccounts: 0 };
  }
}