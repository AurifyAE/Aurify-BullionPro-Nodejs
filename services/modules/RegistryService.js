import { createAppError } from "../../utils/errorHandler.js";
import Registry from "../../models/modules/Registry.js";
import mongoose from "mongoose";

class RegistryService {
  // Create new registry entry
  static async createRegistry(registryData, adminId) {
    try {
      const registry = new Registry({
        ...registryData,
        createdBy: adminId,
      });

      await registry.save();

      return await Registry.findById(registry._id)
        .populate("createdBy", "name email")
        .populate("costCenter", "code name");
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Transaction ID already exists",
          400,
          "DUPLICATE_TRANSACTION_ID"
        );
      }
      throw error;
    }
  }

  // Get all registries with filters, search and pagination
  static async getAllRegistries(page, limit, filters, sort) {
    try {
      const skip = (page - 1) * limit;
      const query = { isActive: true };

      // Apply filters
      if (filters.type && Array.isArray(filters.type)) {
        query.type = { $in: filters.type };
      }

      if (filters.costCenter) {
        query.costCenter = filters.costCenter;
      }

      if (filters.status) {
        query.status = filters.status;
      }

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.transactionDate = {};
        if (filters.startDate) {
          query.transactionDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.transactionDate.$lte = new Date(filters.endDate);
        }
      }

      // Search functionality
      if (filters.search) {
        const searchRegex = new RegExp(filters.search, "i");
        query.$or = [
          { transactionId: searchRegex },
          { description: searchRegex },
          { reference: searchRegex },
          { costCenter: searchRegex },
        ];
      }

      // Sort configuration
      const sortConfig = {};
      sortConfig[sort.sortBy] = sort.sortOrder === "desc" ? -1 : 1;

      // Execute query
      const [registries, total] = await Promise.all([
        Registry.find(query)
          .populate("createdBy")
          .populate("updatedBy")
          .populate("party")
          // .populate('costCenter', 'code name')
          .sort({ transactionDate: -1 })
          .skip(skip)
          .limit(limit),
        Registry.countDocuments(query),
      ]);

      // Calculate summary
      const summaryPipeline = [
        { $match: query },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: "$debit" },
            totalCredit: { $sum: "$credit" },
            totalTransactions: { $sum: 1 },
            avgValue: { $avg: "$value" },
          },
        },
      ];

      const summaryResult = await Registry.aggregate(summaryPipeline);
      const summary = summaryResult[0] || {
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: 0,
        avgValue: 0,
      };

      return {
        registries,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        summary,
      };
    } catch (error) {
      throw error;
    }
  }

  // Get registry by ID
  static async getRegistryById(id) {
    try {
      const registry = await Registry.findOne({ _id: id, isActive: true })
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("costCenter", "code name");

      return registry;
    } catch (error) {
      throw error;
    }
  }
  // services/RegistryService.js
static async generateVoucherByMetalTransaction(metalTransactionId) {
  if (!mongoose.Types.ObjectId.isValid(metalTransactionId)) return null;

  const registries = await Registry.find({
    metalTransactionId,
    isActive: true,
  })
    .populate("party", "customerName accountCode")
    .populate("createdBy", "name")
    .sort({ createdAt: 1 })
    .lean();

  if (!registries || registries.length === 0) return null;

  const main = registries[0];
  const party = main.party;

  const lines = [];
  const added = new Set();

  // PARTY
  const PARTY_CASH_TYPES = [
    "PARTY_CASH_BALANCE",
    "PARTY_MAKING_CHARGES",
    "PARTY_PREMIUM",
    "PARTY_DISCOUNT",
    "PARTY_VAT_AMOUNT",
    "OTHER-CHARGE",
  ];

  const PARTY_GOLD_TYPES = ["PARTY_GOLD_BALANCE"];

  // BULLION TYPES (all)
  const BULLION_TYPES = [
    "PURITY_DIFFERENCE",
    "GOLD",
    "DISCOUNT",
    "PREMIUM",
    "VAT_AMOUNT",
    "OTHER-CHARGE",
    "FX_EXCHANGE",        // <-- normal debit/credit
    "MAKING_CHARGES",
    "purchase-fixing",
    "sales-fixing",       // <-- corrected
    "HEDGE_ENTRY",
  ];

  // Combined cash+gold entry types
  const COMBINED_TYPES = [
    "HEDGE_ENTRY",
    "purchase-fixing",
    "sales-fixing",
  ];

  const addLine = (desc, accCode, currDr = 0, currCr = 0, goldDr = 0, goldCr = 0) => {
    const key = `${desc}-${accCode}-${currDr}-${currCr}-${goldDr}-${goldCr}`;
    if (added.has(key)) return;
    added.add(key);

    lines.push({
      accCode,
      description: desc,
      currencyDebit: Number(currDr.toFixed(2)),
      currencyCredit: Number(currCr.toFixed(2)),
      metalDebit: Number(goldDr.toFixed(3)),
      metalCredit: Number(goldCr.toFixed(3)),
    });
  };

  // Supplier totals
  let partyCurrencyDebit = 0;
  let partyCurrencyCredit = 0;
  let partyGoldDebit = 0;
  let partyGoldCredit = 0;

  // Process entries
  for (const reg of registries) {
    const t = reg.type;

    // Dynamic description
    const desc = t.replace(/[_-]/g, " ").toUpperCase();

    // Dynamic account code
    const prefix = t.replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase();
    const accCode = prefix + "001";

    // 1️⃣ PARTY CASH
    if (PARTY_CASH_TYPES.includes(t)) {
      partyCurrencyDebit += reg.debit || 0;
      partyCurrencyCredit += reg.credit || 0;
      continue;
    }

    // 2️⃣ PARTY GOLD
    if (PARTY_GOLD_TYPES.includes(t)) {
      partyGoldDebit += reg.debit || 0;
      partyGoldCredit += reg.credit || 0;
      continue;
    }

    // 3️⃣ BULLION
    if (BULLION_TYPES.includes(t)) {

      // Combined cash + gold
      if (COMBINED_TYPES.includes(t)) {
        addLine(
          desc,
          accCode,
          reg.cashDebit || 0,
          reg.cashCredit || 0,
          reg.goldDebit || 0,
          reg.goldCredit || 0
        );
        continue;
      }

      // Purity difference = ONLY gold
      if (t === "PURITY_DIFFERENCE") {
        if (reg.goldDebit > 0) addLine(desc, accCode, 0, 0, reg.goldDebit, 0);
        if (reg.goldCredit > 0) addLine(desc, accCode, 0, 0, 0, reg.goldCredit);
        continue;
      }

      // FX_EXCHANGE normal debit/credit (currency only)
      if (t === "FX_EXCHANGE") {
        if (reg.debit > 0) addLine(desc, accCode, reg.debit, 0, 0, 0);
        if (reg.credit > 0) addLine(desc, accCode, 0, reg.credit, 0, 0);
        continue;
      }

      // Standard bullion (currency only)
      if (reg.debit > 0) addLine(desc, accCode, reg.debit, 0, 0, 0);
      if (reg.credit > 0) addLine(desc, accCode, 0, reg.credit, 0, 0);

      continue;
    }
  }

  // 4️⃣ SUPPLIER SUMMARY
  if (party) {
    const netCurrDr = partyCurrencyDebit - partyCurrencyCredit;
    const netCurrCr = partyCurrencyCredit - partyCurrencyDebit;
    const netGoldDr = partyGoldDebit - partyGoldCredit;
    const netGoldCr = partyGoldCredit - partyGoldDebit;

    addLine(
      "SUPPLIER",
      party.accountCode || "SUP001",
      netCurrDr > 0 ? netCurrDr : 0,
      netCurrCr > 0 ? netCurrCr : 0,
      netGoldDr > 0 ? netGoldDr : 0,
      netGoldCr > 0 ? netGoldCr : 0
    );
  }

  // 5️⃣ Totals
  const totals = lines.reduce(
    (a, l) => {
      a.currencyDebit += l.currencyDebit;
      a.currencyCredit += l.currencyCredit;
      a.metalDebit += l.metalDebit;
      a.metalCredit += l.metalCredit;
      return a;
    },
    { currencyDebit: 0, currencyCredit: 0, metalDebit: 0, metalCredit: 0 }
  );

  // 6️⃣ Final return
  return {
    metalTransactionId,
    transactionId: main.transactionId,
    reference: main.reference,
    date: main.transactionDate,
    party: {
      name: party?.customerName || "Walk-in Customer",
      code: party?.accountCode || "SUP001",
    },
    entries: lines,
    totals: {
      currencyDebit: Number(totals.currencyDebit.toFixed(2)),
      currencyCredit: Number(totals.currencyCredit.toFixed(2)),
      metalDebit: Number(totals.metalDebit.toFixed(3)),
      metalCredit: Number(totals.metalCredit.toFixed(3)),
    },
  };
}



  // Update registry
  static async updateRegistry(id, updateData, adminId) {
    try {
      const registry = await Registry.findOneAndUpdate(
        { _id: id, isActive: true },
        {
          ...updateData,
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("costCenter", "code name");

      return registry;
    } catch (error) {
      throw error;
    }
  }

  // Soft delete registry
  static async deleteRegistry(id, adminId) {
    try {
      const registry = await Registry.findOneAndUpdate(
        { _id: id, isActive: true },
        {
          isActive: false,
          updatedBy: adminId,
        },
        { new: true }
      );

      return registry;
    } catch (error) {
      throw error;
    }
  }

  // Permanent delete registry
  static async permanentDeleteRegistry(id) {
    try {
      const result = await Registry.findByIdAndDelete(id);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // delelte Registry by voucher
  static async deleteRegistryByVoucher(voucherCode) {
    try {
      const result = await Registry.deleteMany({ reference: voucherCode });
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Get registries by type with debit/credit summary
  static async getRegistriesByType(page, limit, filters, sort) {
    try {
      const skip = (page - 1) * limit;
      const query = {
        type: filters.type,
        isActive: true,
      };

      // Apply additional filters
      if (filters.costCenter) {
        query.costCenter = filters.costCenter;
      }

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.transactionDate = {};
        if (filters.startDate) {
          query.transactionDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.transactionDate.$lte = new Date(filters.endDate);
        }
      }

      // Sort configuration
      const sortConfig = {};
      sortConfig[sort.sortBy] = sort.sortOrder === "desc" ? -1 : 1;

      // Execute query
      const [registries, total] = await Promise.all([
        Registry.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .populate("costCenter", "code name")
          .sort(sortConfig)
          .skip(skip)
          .limit(limit),
        Registry.countDocuments(query),
      ]);

      // Calculate type-specific summary
      const summaryPipeline = [
        { $match: query },
        {
          $group: {
            _id: "$type",
            totalDebit: { $sum: "$debit" },
            totalCredit: { $sum: "$credit" },
            totalTransactions: { $sum: 1 },
            netBalance: { $sum: { $subtract: ["$credit", "$debit"] } },
          },
        },
      ];

      const summaryResult = await Registry.aggregate(summaryPipeline);
      const summary = summaryResult[0] || {
        _id: filters.type,
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: 0,
        netBalance: 0,
      };

      return {
        registries,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        summary,
      };
    } catch (error) {
      throw error;
    }
  }

  // Get registries by cost center
  static async getRegistriesByCostCenter(page, limit, filters, sort) {
    try {
      const skip = (page - 1) * limit;
      const query = {
        costCenter: filters.costCenter,
        isActive: true,
      };

      // Apply additional filters
      if (filters.type) {
        query.type = filters.type;
      }

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.transactionDate = {};
        if (filters.startDate) {
          query.transactionDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.transactionDate.$lte = new Date(filters.endDate);
        }
      }

      // Sort configuration
      const sortConfig = {};
      sortConfig[sort.sortBy] = sort.sortOrder === "desc" ? -1 : 1;

      // Execute query
      const [registries, total] = await Promise.all([
        Registry.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .populate("costCenter", "code name")
          .sort(sortConfig)
          .skip(skip)
          .limit(limit),
        Registry.countDocuments(query),
      ]);

      // Calculate cost center specific summary
      const summaryPipeline = [
        { $match: query },
        {
          $group: {
            _id: "$costCenter",
            totalDebit: { $sum: "$debit" },
            totalCredit: { $sum: "$credit" },
            totalTransactions: { $sum: 1 },
            currentBalance: { $sum: { $subtract: ["$credit", "$debit"] } },
            typeBreakdown: {
              $push: {
                type: "$type",
                debit: "$debit",
                credit: "$credit",
              },
            },
          },
        },
      ];

      const summaryResult = await Registry.aggregate(summaryPipeline);
      const summary = summaryResult[0] || {
        _id: filters.costCenter,
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: 0,
        currentBalance: 0,
        typeBreakdown: [],
      };

      return {
        registries,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        summary,
      };
    } catch (error) {
      throw error;
    }
  }

  // Get registry statistics
  static async getRegistryStatistics(filters) {
    try {
      const query = { isActive: true };

      // Apply filters
      if (filters.type) {
        query.type = filters.type;
      }

      if (filters.costCenter) {
        query.costCenter = filters.costCenter;
      }

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.transactionDate = {};
        if (filters.startDate) {
          query.transactionDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.transactionDate.$lte = new Date(filters.endDate);
        }
      }

      // Comprehensive statistics pipeline
      const statisticsPipeline = [
        { $match: query },
        {
          $facet: {
            overall: [
              {
                $group: {
                  _id: null,
                  totalDebit: { $sum: "$debit" },
                  totalCredit: { $sum: "$credit" },
                  totalTransactions: { $sum: 1 },
                  avgTransactionValue: { $avg: "$value" },
                  netBalance: { $sum: { $subtract: ["$credit", "$debit"] } },
                },
              },
            ],
            byType: [
              {
                $group: {
                  _id: "$type",
                  totalDebit: { $sum: "$debit" },
                  totalCredit: { $sum: "$credit" },
                  totalTransactions: { $sum: 1 },
                  netBalance: { $sum: { $subtract: ["$credit", "$debit"] } },
                },
              },
              { $sort: { totalTransactions: -1 } },
            ],
            byCostCenter: [
              {
                $group: {
                  _id: "$costCenter",
                  totalDebit: { $sum: "$debit" },
                  totalCredit: { $sum: "$credit" },
                  totalTransactions: { $sum: 1 },
                  netBalance: { $sum: { $subtract: ["$credit", "$debit"] } },
                },
              },
              { $sort: { totalTransactions: -1 } },
            ],
            byStatus: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  totalValue: { $sum: "$value" },
                },
              },
            ],
            monthlyTrend: [
              {
                $group: {
                  _id: {
                    year: { $year: "$transactionDate" },
                    month: { $month: "$transactionDate" },
                  },
                  totalDebit: { $sum: "$debit" },
                  totalCredit: { $sum: "$credit" },
                  totalTransactions: { $sum: 1 },
                },
              },
              { $sort: { "_id.year": -1, "_id.month": -1 } },
              { $limit: 12 },
            ],
          },
        },
      ];

      const result = await Registry.aggregate(statisticsPipeline);

      return {
        overall: result[0].overall[0] || {
          totalDebit: 0,
          totalCredit: 0,
          totalTransactions: 0,
          avgTransactionValue: 0,
          netBalance: 0,
        },
        byType: result[0].byType,
        byCostCenter: result[0].byCostCenter,
        byStatus: result[0].byStatus,
        monthlyTrend: result[0].monthlyTrend,
      };
    } catch (error) {
      throw error;
    }
  }

  // Update registry status
  static async updateRegistryStatus(id, status, adminId) {
    try {
      const registry = await Registry.findOneAndUpdate(
        { _id: id, isActive: true },
        {
          status,
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("costCenter", "code name");

      return registry;
    } catch (error) {
      throw error;
    }
  }

  // Get balance for cost center (optionally filtered by type)
  static async getRegistryBalance(costCenter, type = null) {
    try {
      const query = {
        costCenter: costCenter,
        isActive: true,
      };

      if (type) {
        query.type = type;
      }

      // Get the latest running balance
      const latestTransaction = await Registry.findOne(query).sort({
        transactionDate: -1,
        createdAt: -1,
      });

      if (!latestTransaction) {
        return 0;
      }

      // If type is specified, calculate balance for that type only
      if (type) {
        const typeBalance = await Registry.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              balance: { $sum: { $subtract: ["$credit", "$debit"] } },
            },
          },
        ]);

        return typeBalance[0]?.balance || 0;
      }

      return latestTransaction.runningBalance;
    } catch (error) {
      throw error;
    }
  }

  // Getting stock balance

  static async getStockBalanceRegistries({
    page = 1,
    limit = 10,
    search = "",
  }) {
    try {
      const filter = {
        type: { $in: ["STOCK_BALANCE", "stock_balance"] },
        isActive: true,
      };

      if (search) {
        filter.$or = [
          { "costCenter.name": { $regex: search, $options: "i" } },
          { "costCenter.code": { $regex: search, $options: "i" } },
          // Add more fields as needed
        ];
      }

      const skip = (page - 1) * limit;

      // Count total items
      const totalItems = await Registry.countDocuments(filter);

      // Fetch paginated data
      const registries = await Registry.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        // .populate('costCenter', 'code name')
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit);

      // Example summary calculation (customize as needed)
      const summary = {
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: totalItems,
        avgValue: 0,
      };

      const totalPages = Math.ceil(totalItems / limit);

      return { registries, totalItems, totalPages, summary };
    } catch (error) {
      throw error;
    }
  }

  // getting premium discount registries

  static async getPremiumDiscountRegistries({
    page = 1,
    limit = 10,
    search = "",
  }) {
    try {
      const filter = {
        type: { $in: ["PREMIUM-DISCOUNT", "premium-discount"] },
        isActive: true,
      };

      if (search) {
        filter.$or = [
          { "costCenter.name": { $regex: search, $options: "i" } },
          { "costCenter.code": { $regex: search, $options: "i" } },
          // Add more fields as needed
        ];
      }

      const skip = (page - 1) * limit;

      // Count total items
      const totalItems = await Registry.countDocuments(filter);

      // Fetch paginated data
      const registries = await Registry.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("costCenter", "code name")
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit);

      // Example summary calculation (customize as needed)
      const summary = {
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: totalItems,
        avgValue: 0,
      };

      const totalPages = Math.ceil(totalItems / limit);

      return { registries, totalItems, totalPages, summary };
    } catch (error) {
      throw error;
    }
  }

  // getting all making charges

  static async getMakingChargesRegistries({
    page = 1,
    limit = 10,
    search = "",
  }) {
    try {
      const filter = {
        type: { $in: ["MAKING CHARGES", "making charges"] },
        isActive: true,
      };

      if (search) {
        filter.$or = [
          { costCenter: { $regex: search, $options: "i" } },
          // Add more fields as needed
        ];
      }

      const skip = (page - 1) * limit;

      // Count total items
      const totalItems = await Registry.countDocuments(filter);

      // Fetch paginated data
      const registries = await Registry.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        // .populate('costCenter', 'code name') // REMOVE this line
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit);

      // Example summary calculation (customize as needed)
      const summary = {
        totalDebit: 0,
        totalCredit: 0,
        totalTransactions: totalItems,
        avgValue: 0,
      };

      const totalPages = Math.ceil(totalItems / limit);

      return { registries, totalItems, totalPages, summary };
    } catch (error) {
      throw error;
    }
  }
  static async getOpeningBalanceByPartyId(partyId) {
    try {
      // Define transaction types
      const goldTypes = ["PARTY_GOLD_BALANCE"];
      const cashTypes = [
        "PARTY_CASH_BALANCE",
        "PARTY_MAKING_CHARGES",
        "PARTY_PREMIUM",
        "PARTY_DISCOUNT",
        "PARTY_VAT_AMOUNT",
        "OTHER-CHARGE",
      ];
  
      // Get today's start time (midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
  
      // Fetch all transactions before today (up to yesterday end of day)
      const previousTransactions = await Registry.find({
        party: partyId,
        isActive: true,
        transactionDate: { $lt: today }, // All transactions before today
      }).sort({ transactionDate: 1, createdAt: 1 }); // Sort chronologically
  
      // Initialize balances
      let cashBalance = 0;
      let goldBalance = 0;
  
      // Calculate running balance from all previous transactions
      previousTransactions.forEach((txn) => {
        const debit = txn.debit || 0;
        const credit = txn.credit || 0;
        const netAmount = credit - debit;
  
        if (goldTypes.includes(txn.type)) {
          goldBalance += netAmount;
        } else if (cashTypes.includes(txn.type)) {
          cashBalance += netAmount;
        }
      });
  
      return {
        success: true,
        openingBalance: {
          cash: cashBalance,
          gold: goldBalance,
          asOfDate: new Date(today.getTime() - 1), // Yesterday's date
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch opening balance: ${error.message}`);
    }
  }
  
  // get registry by party id

  static async getRegistriesByPartyId(partyId, page = 1, limit = 10) {
    try {
      const filter = { party: partyId, isActive: true };
      const skip = (page - 1) * limit;

      const openingBalanceResult = await this.getOpeningBalanceByPartyId(partyId);
      const openingBalance = openingBalanceResult.openingBalance;

      const totalItems = await Registry.countDocuments(filter);

      const registries = await Registry.find(filter)
        .populate("party", "name code")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(totalItems / limit);
      return { data: registries, openingBalance, totalItems, totalPages, currentPage: page };
    } catch (error) {
      throw new Error(`Failed to fetch registries: ${error.message}`);
    }
  }

  static async getPremiumAndDiscountRegistries({ page = 1, limit = 50 }) {
    try {
      // Case-insensitive match for "PREMIUM" or "DISCOUNT"
      const typeRegex = [/^premium$/i, /^discount$/i];

      const filters = {
        type: { $in: typeRegex },
        isActive: true,
      };

      const skip = (page - 1) * limit;

      const [registries, totalItems] = await Promise.all([
        Registry.find(filters)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ transactionDate: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Registry.countDocuments(filters),
      ]);

      const pagination = {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: Number(page),
        itemsPerPage: Number(limit),
      };

      return { registries, pagination, summary: null }; // Add summary if needed
    } catch (error) {
      throw error;
    }
  }
}

export default RegistryService;
