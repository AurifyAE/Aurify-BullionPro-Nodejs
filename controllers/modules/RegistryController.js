import { createAppError } from "../../utils/errorHandler.js";
import RegistryService from "../../services/modules/RegistryService.js";

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