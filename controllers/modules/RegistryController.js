import { createAppError } from "../../utils/errorHandler.js";
import RegistryService from "../../services/modules/RegistryService.js";
import Account from "../../models/modules/AccountType.js";
import Registry from "../../models/modules/Registry.js";

// Create new registry entry
export const createRegistry = async (req, res, next) => {
  try {
    const registryData = req.body;
    const adminId = req.user.id;

    const registry = await RegistryService.createRegistry(registryData, adminId);

    res.status(201).json({
      success: true,
      message: "Registry entry created successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};

// Get all registries with filters and search
export const getAllRegistries = async (req, res, next) => {
  try {
    let { page = 1, limit = 50, search, costCenter, status, startDate, endDate, sortBy = 'transactionDate', sortOrder = 'desc' } = req.query;

    let type = req.query.type || req.query['type[]']; 

    const filters = {};
    //  Handle multiple types
    if (type) {
      if (Array.isArray(type)) {
        filters.type = type;
      } else {
        filters.type = [type];
      }
    }

    if (costCenter) filters.costCenter = costCenter.toUpperCase();
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (search) filters.search = search;

    const result = await RegistryService.getAllRegistries(
      parseInt(page),
      parseInt(limit),
      filters,
      { sortBy, sortOrder }
    );

    res.status(200).json({
      success: true,
      message: "Registries retrieved successfully",
      data: result.registries,
      pagination: result.pagination,
      summary: result.summary
    });
  } catch (error) {
    console.error("Error in getAllRegistries controller:", error);
    next(error);
  }
};

// Get registry by ID
export const getRegistryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const registry = await RegistryService.getRegistryById(id);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry entry retrieved successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};

export const getRegistryAuditTrailById = async (req, res, next) => {
  try {
    const { metalTransactionId } = req.params;

    const registry = await RegistryService.generateVoucherByMetalTransaction(metalTransactionId);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry audit trail retrieved successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};

export const getRegistryHedgeAuditTrailById = async (req, res, next) => {
  try {
    const { metalTransactionId } = req.params;

    const registry = await RegistryService.generateHedgeVoucherByMetalTransaction(metalTransactionId);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry audit trail retrieved successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};

export const getRegistryFixingTransaction = async (req, res, next) => {
  try {
    const { fixingTransactionId } = req.params;

    const registry = await RegistryService.generateVoucherByTransactionFix(fixingTransactionId);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry audit trail retrieved successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};
// Update registry
export const updateRegistry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const adminId = req.user.id;

    const registry = await RegistryService.updateRegistry(id, updateData, adminId);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry entry updated successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};

// Soft delete registry
export const deleteRegistry = async (req, res, next) => {
  try {

    const { id } = req.params;

    const adminId = req.user.id;

    const registry = await RegistryService.deleteRegistry(id, adminId);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry entry deleted successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};



// Permanent delete registry
export const permanentDeleteRegistry = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await RegistryService.permanentDeleteRegistry(id);

    if (!result) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry entry permanently deleted",
    });
  } catch (error) {
    next(error);
  }
};

// Get registries by type
export const getRegistriesByType = async (req, res, next) => {
  try {
    const { type } = req.params;
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      costCenter,
      sortBy = 'transactionDate',
      sortOrder = 'desc'
    } = req.query;

    const filters = { type };
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (costCenter) filters.costCenter = costCenter.toUpperCase();

    const result = await RegistryService.getRegistriesByType(
      parseInt(page),
      parseInt(limit),
      filters,
      { sortBy, sortOrder }
    );

    res.status(200).json({
      success: true,
      message: `${type} registries retrieved successfully`,
      data: result.registries,
      pagination: result.pagination,
      summary: result.summary
    });
  } catch (error) {
    next(error);
  }
};

// Get registries by cost center
export const getRegistriesByCostCenter = async (req, res, next) => {
  try {
    const { costCenter } = req.params;
    const {
      page = 1,
      limit = 50,
      type,
      startDate,
      endDate,
      sortBy = 'transactionDate',
      sortOrder = 'desc'
    } = req.query;

    const filters = { costCenter: costCenter.toUpperCase() };
    if (type) filters.type = type;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await RegistryService.getRegistriesByCostCenter(
      parseInt(page),
      parseInt(limit),
      filters,
      { sortBy, sortOrder }
    );

    res.status(200).json({
      success: true,
      message: `Registries for cost center ${costCenter} retrieved successfully`,
      data: result.registries,
      pagination: result.pagination,
      summary: result.summary
    });
  } catch (error) {
    next(error);
  }
};

// Get registry statistics
export const getRegistryStatistics = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      type,
      costCenter
    } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (costCenter) filters.costCenter = costCenter.toUpperCase();
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const statistics = await RegistryService.getRegistryStatistics(filters);

    res.status(200).json({
      success: true,
      message: "Registry statistics retrieved successfully",
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
};

// Update registry status
export const updateRegistryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = req.user.id;

    const registry = await RegistryService.updateRegistryStatus(id, status, adminId);

    if (!registry) {
      throw createAppError("Registry entry not found", 404, "REGISTRY_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: "Registry status updated successfully",
      data: registry,
    });
  } catch (error) {
    next(error);
  }
};

// Get balance for cost center
export const getRegistryBalance = async (req, res, next) => {
  try {
    const { costCenter } = req.params;
    const { type } = req.query;

    const balance = await RegistryService.getRegistryBalance(costCenter.toUpperCase(), type);

    res.status(200).json({
      success: true,
      message: `Balance for cost center ${costCenter} retrieved successfully`,
      data: {
        costCenter: costCenter.toUpperCase(),
        type: type || 'all',
        balance: balance
      },
    });
  } catch (error) {
    next(error);
  }
};

// getting registry type is stock balance
export const getRegistryStockBalance = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    const { registries, totalItems, totalPages, summary } =
      await RegistryService.getStockBalanceRegistries({
        page: Number(page),
        limit: Number(limit),
        search,
      });

    res.status(200).json({
      success: true,
      message: `Stock balance retrieved successfully`,
      data: registries,
      summary,
      pagination: {
        totalItems,
        totalPages,
        currentPage: Number(page),
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// getting all premium discounts

export const getRegistryPremiumDiscount = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    const { registries, totalItems, totalPages, summary } =
      await RegistryService.getPremiumDiscountRegistries({
        page: Number(page),
        limit: Number(limit),
        search,
      });

    res.status(200).json({
      success: true,
      message: `Premium discount retrieved successfully`,
      data: registries,
      summary,
      pagination: {
        totalItems,
        totalPages,
        currentPage: Number(page),
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getMakingChargesRegistries = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    const { registries, totalItems, totalPages, summary } =
      await RegistryService.getMakingChargesRegistries({
        page: Number(page),
        limit: Number(limit),
        search,
      });

    res.status(200).json({
      success: true,
      message: `Making charges retrieved successfully`,
      data: registries,
      summary,
      pagination: {
        totalItems,
        totalPages,
        currentPage: Number(page),
        itemsPerPage: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// get registry by partyId 

export const getRegistriesByPartyId = async (req, res, next) => {
  try {
    const partyId = req.params.partyId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 5000000) || 5000000;

    if (!partyId) {
      return res.status(400).json({ success: false, message: 'Party ID is required' });
    }

    const result = await RegistryService.getRegistriesByPartyId(partyId, page, limit);

    res.status(200).json({
      success: true,
      message: `Registries for party ID ${partyId} retrieved successfully`,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching registries by party ID:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// Get registries by type "PREMIUM" or "DISCOUNT" (case-insensitive)
export const getPremiumOrDiscountRegistries = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await RegistryService.getPremiumAndDiscountRegistries({
      page: Number(page),
      limit: Number(limit),
    });
    res.status(200).json({
      success: true,
      message: "Premium and Discount registries retrieved successfully",
      data: result.registries,
      pagination: result.pagination,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
};


export const getStatementByParty = async (req, res) => {
  try {
    const { partyId } = req.params;
    const {
      page = 1,
      limit = 5000000,
      startDate,
      endDate,
      foreignCurrency,
      localCurrency,
      metalOnly,
    } = req.query;

    if (!partyId) {
      return res.status(400).json({ success: false, message: "Party ID is required" });
    }

    const account = await Account.findById(partyId).populate("acDefinition.currencies.currency");
    if (!account) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    // Build filter
    const filter = {
      party: partyId,
      isActive: true,
      type: {
        $in: [
          "PARTY_GOLD_BALANCE",
          "PARTY_CASH_BALANCE",
          "PARTY_MAKING_CHARGES",
          "PARTY_PREMIUM",
          "PARTY_DISCOUNT",
          "PARTY_VAT_AMOUNT",
          "OTHER-CHARGE",
          "MAKING_CHARGES",
          "VAT_AMOUNT",
        ],
      },
    };

    // Date range filter
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    // Fetch transactions
    const registries = await Registry.find(filter)
      .populate("createdBy", "name email")
      .populate("party", "customerName accountCode")
      .sort({ transactionDate: 1, createdAt: 1 }) // Chronological for running balance
      .skip(skip)
      .limit(parseInt(limit));

    const totalItems = await Registry.countDocuments(filter);

    // Calculate opening balance (before start date)
    const openingFilter = {
      party: partyId,
      isActive: true,
      type: { $in: filter.type.$in },
    };

    if (startDate) {
      openingFilter.transactionDate = { $lt: new Date(startDate) };
    }

    const openingTxns = await Registry.find(openingFilter)
      .sort({ transactionDate: 1, createdAt: 1 });

    let openingCash = 0;
    let openingGold = 0;

    openingTxns.forEach(t => {
      if (t.type === "PARTY_GOLD_BALANCE") {
        openingGold += (t.goldCredit || t.credit || 0) - (t.goldDebit || t.debit || 0);
      } else {
        openingCash += (t.credit || 0) - (t.debit || 0);
      }
    });

    // Process running balance
    let runningCash = openingCash;
    let runningGold = openingGold;

    const processedData = registries.map(t => {
      let cashDebit = 0, cashCredit = 0;
      let goldDebit = 0, goldCredit = 0;

      if (t.type === "PARTY_GOLD_BALANCE") {
        goldCredit = t.goldCredit || t.credit || 0;
        goldDebit = t.goldDebit || t.debit || 0;
        runningGold += goldCredit - goldDebit;
      } else {
        cashCredit = t.credit || 0;
        cashDebit = t.debit || 0;
        runningCash += cashCredit - cashDebit;
      }

      return {
        ...t.toObject(),
        _id: t._id,
        docDate: t.transactionDate.toLocaleDateString("en-GB"),
        formattedDate: t.formattedDate,
        cashDebit,
        cashCredit,
        goldDebit,
        goldCredit,
        cashBalance: runningCash,
        goldBalance: runningGold,
      };
    });

    // Apply metal-only filter on processed data
    let finalData = processedData;
    if (metalOnly === "true") {
      finalData = processedData.filter(t => t.goldDebit > 0 || t.goldCredit > 0);
    }

    // Currency conversion logic (frontend will use this rate)
    const currencies = account.acDefinition?.currencies || [];
    const defaultCur = currencies.find(c => c.isDefault) || currencies[0];
    const foreignCur = currencies.find(c => (c.currency?.currencyCode || c.currencyCode) === foreignCurrency) || defaultCur;
    const localCur = currencies.find(c => (c.currency?.currencyCode || c.currencyCode) === localCurrency) || defaultCur;

    const conversionRate = foreignCur && localCur
      ? (foreignCur.currency?.conversionRate || foreignCur.conversionRate || 1) /
        (localCur.convertRate || 1)
      : 1;

    res.status(200).json({
      success: true,
      message: "Statement fetched successfully",
      data: finalData,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: parseInt(page),
        hasNext: parseInt(page) * limit < totalItems,
        hasPrev: page > 1,
      },
      summary: {
        opening: { cash: openingCash, gold: openingGold },
        closing: {
          cash: runningCash,
          gold: runningGold,
        },
      },
      currency: {
        foreign: foreignCurrency || "USD",
        local: localCurrency || "AED",
        rate: conversionRate.toFixed(6),
      },
    });
  } catch (error) {
    console.error("Error in getStatementByParty:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};