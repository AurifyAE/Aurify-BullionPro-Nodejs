import CurrencyMaster from "../../models/modules/CurrencyMaster.js";
import { createAppError } from "../../utils/errorHandler.js";

class CurrencyMasterService {
  // Create new currency
  static async createCurrency(currencyData, adminId) {
    try {
      // Check if currency code already exists
      const existingCurrency = await CurrencyMaster.isCodeExists(currencyData.currencyCode);
      if (existingCurrency) {
        throw createAppError(
          `Currency code '${currencyData.currencyCode}' already exists`,
          409,
          "DUPLICATE_CURRENCY_CODE"
        );
      }

      // Validate rate range
      if (currencyData.maxRate <= currencyData.minRate) {
        throw createAppError(
          "Maximum rate must be greater than minimum rate",
          400,
          "INVALID_RATE_RANGE"
        );
      }

      // Validate conversion rate is within min-max range
      if (currencyData.conversionRate < currencyData.minRate || 
          currencyData.conversionRate > currencyData.maxRate) {
        throw createAppError(
          "Conversion rate must be within minimum and maximum rate range",
          400,
          "CONVERSION_RATE_OUT_OF_RANGE"
        );
      }

      const newCurrency = new CurrencyMaster({
        ...currencyData,
        createdBy: adminId
      });

      const savedCurrency = await newCurrency.save();
      return await CurrencyMaster.findById(savedCurrency._id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Currency code must be unique",
          409,
          "DUPLICATE_CURRENCY_CODE"
        );
      }
      throw error;
    }
  }

  // Get all currencies with pagination and filters
  static async getAllCurrencies(filters = {}, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc') {
    try {
      const skip = (page - 1) * limit;
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Build query filters
      const query = {};
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }
      if (filters.currencyCode) {
        query.currencyCode = { $regex: filters.currencyCode, $options: 'i' };
      }
      if (filters.description) {
        query.description = { $regex: filters.description, $options: 'i' };
      }

      const [currencies, total] = await Promise.all([
        CurrencyMaster.find(query)
          .populate('createdBy', 'name email')
          .populate('updatedBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(limit),
        CurrencyMaster.countDocuments(query)
      ]);

      return {
        currencies,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Get currency by ID
  static async getCurrencyById(currencyId) {
    try {
      const currency = await CurrencyMaster.findById(currencyId)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');

      if (!currency) {
        throw createAppError(
          "Currency not found",
          404,
          "CURRENCY_NOT_FOUND"
        );
      }

      return currency;
    } catch (error) {
      throw error;
    }
  }

  // Update currency
  static async updateCurrency(currencyId, updateData, adminId) {
    try {
      const existingCurrency = await CurrencyMaster.findById(currencyId);
      if (!existingCurrency) {
        throw createAppError(
          "Currency not found",
          404,
          "CURRENCY_NOT_FOUND"
        );
      }

      // Check if currency code already exists (excluding current currency)
      if (updateData.currencyCode) {
        const codeExists = await CurrencyMaster.isCodeExists(updateData.currencyCode, currencyId);
        if (codeExists) {
          throw createAppError(
            `Currency code '${updateData.currencyCode}' already exists`,
            409,
            "DUPLICATE_CURRENCY_CODE"
          );
        }
      }

      // Validate rate range if rates are being updated
      const newMinRate = updateData.minRate !== undefined ? updateData.minRate : existingCurrency.minRate;
      const newMaxRate = updateData.maxRate !== undefined ? updateData.maxRate : existingCurrency.maxRate;
      const newConversionRate = updateData.conversionRate !== undefined ? updateData.conversionRate : existingCurrency.conversionRate;

      if (newMaxRate <= newMinRate) {
        throw createAppError(
          "Maximum rate must be greater than minimum rate",
          400,
          "INVALID_RATE_RANGE"
        );
      }

      // Validate conversion rate is within min-max range
      if (newConversionRate < newMinRate || newConversionRate > newMaxRate) {
        throw createAppError(
          "Conversion rate must be within minimum and maximum rate range",
          400,
          "CONVERSION_RATE_OUT_OF_RANGE"
        );
      }

      const updatedCurrency = await CurrencyMaster.findByIdAndUpdate(
        currencyId,
        {
          ...updateData,
          updatedBy: adminId
        },
        {
          new: true,
          runValidators: true
        }
      ).populate('createdBy', 'name email')
       .populate('updatedBy', 'name email');

      return updatedCurrency;
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Currency code must be unique",
          409,
          "DUPLICATE_CURRENCY_CODE"
        );
      }
      throw error;
    }
  }

  // Delete currency (soft delete)
  static async deleteCurrency(currencyId, adminId) {
    try {
      const currency = await CurrencyMaster.findById(currencyId);
      if (!currency) {
        throw createAppError(
          "Currency not found",
          404,
          "CURRENCY_NOT_FOUND"
        );
      }

      const deletedCurrency = await CurrencyMaster.findByIdAndUpdate(
        currencyId,
        {
          status: 'inactive',
          isActive: false,
          updatedBy: adminId
        },
        { new: true }
      ).populate('createdBy', 'name email')
       .populate('updatedBy', 'name email');

      return deletedCurrency;
    } catch (error) {
      throw error;
    }
  }

  // Permanently delete currency
  static async permanentDeleteCurrency(currencyId) {
    try {
      const currency = await CurrencyMaster.findById(currencyId);
      if (!currency) {
        throw createAppError(
          "Currency not found",
          404,
          "CURRENCY_NOT_FOUND"
        );
      }

      await CurrencyMaster.findByIdAndDelete(currencyId);
      return { message: "Currency permanently deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get active currencies only
  static async getActiveCurrencies() {
    try {
      const currencies = await CurrencyMaster.find({
        status: 'active',
        isActive: true
      }).populate('createdBy', 'name email')
        .sort({ currencyCode: 1 });

      return currencies;
    } catch (error) {
      throw error;
    }
  }

  // Get currency by code
  static async getCurrencyByCode(currencyCode) {
    try {
      const currency = await CurrencyMaster.findOne({
        currencyCode: currencyCode.toUpperCase()
      }).populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');

      if (!currency) {
        throw createAppError(
          "Currency not found",
          404,
          "CURRENCY_NOT_FOUND"
        );
      }

      return currency;
    } catch (error) {
      throw error;
    }
  }
}

export default CurrencyMasterService;