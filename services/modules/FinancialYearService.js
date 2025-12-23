
import FinancialYear from "../../models/modules/FinancialYearMaster.js";
import { createAppError } from "../../utils/errorHandler.js";

// Helper function to normalize date to UTC midnight (start of day)
// This ensures dates are compared correctly regardless of timezone
const normalizeDateToUTC = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  
  // Extract date components (year, month, day) and create UTC date at midnight
  // This ensures the date represents the same calendar day regardless of timezone
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

export class FinancialYearService {
  // CREATE
  static async createFinancialYear(financialYearData, adminId) {
    try {
      const { code, startDate, endDate, voucherReset } = financialYearData;

      // Validation
      if (!code?.trim()) {
        throw createAppError(
          "Financial year code is required",
          400,
          "REQUIRED_FIELD_MISSING"
        );
      }

      if (!startDate || !endDate) {
        throw createAppError(
          "Start date and end date are required",
          400,
          "REQUIRED_FIELD_MISSING"
        );
      }

      // Convert to Date objects and normalize to UTC midnight
      const start = normalizeDateToUTC(startDate);
      const end = normalizeDateToUTC(endDate);

      // Validate dates
      if (!start || !end) {
        throw createAppError("Invalid date format", 400, "INVALID_DATE");
      }

      // Compare normalized dates (both at UTC midnight)
      if (start >= end) {
        throw createAppError(
          "Start date must be before end date",
          400,
          "INVALID_DATE_RANGE"
        );
      }

      // Check duplicate code
      const codeExists = await FinancialYear.isCodeExists(code.trim());
      if (codeExists) {
        throw createAppError(
          `Financial year with code '${code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      // Check date overlap
      const overlap = await FinancialYear.hasDateOverlap(start, end);
      if (overlap) {
        throw createAppError(
          `Date range overlaps with existing financial year: ${overlap.code}`,
          409,
          "DATE_OVERLAP"
        );
      }

      const financialYear = new FinancialYear({
        code: code.trim().toUpperCase(),
        startDate: start,
        endDate: end,
        voucherReset: voucherReset || false,
        createdBy: adminId,
      });

      await financialYear.save();

      return await FinancialYear.findById(financialYear._id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  // READ ALL
  static async getAllFinancialYears(page = 1, limit = 10, search = "") {
    try {
      const skip = (page - 1) * limit;
      const query = { status: true }; // Only active

      if (search) {
        query.$or = [{ code: new RegExp(search, "i") }];
      }

      const [financialYears, total] = await Promise.all([
        FinancialYear.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ startDate: -1 }) // Sort by most recent first
          .skip(skip)
          .limit(limit),
        FinancialYear.countDocuments(query),
      ]);

      return {
        financialYears,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // READ BY ID
  static async getFinancialYearById(id) {
    try {
      const financialYear = await FinancialYear.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!financialYear) {
        throw createAppError("Financial year not found", 404, "NOT_FOUND");
      }

      if (!financialYear.status) {
        throw createAppError("Financial year is inactive", 410, "INACTIVE");
      }

      return financialYear;
    } catch (error) {
      throw error;
    }
  }

  // GET CURRENT FINANCIAL YEAR
  static async getCurrentFinancialYear() {
    try {
      const financialYear = await FinancialYear.getCurrentFinancialYear();

      if (!financialYear) {
        throw createAppError(
          "No active financial year found for current date",
          404,
          "NOT_FOUND"
        );
      }

      return financialYear;
    } catch (error) {
      throw error;
    }
  }

  // UPDATE
  static async updateFinancialYear(id, updateData, adminId) {
    try {
      const financialYear = await FinancialYear.findById(id);
      if (!financialYear) {
        throw createAppError("Financial year not found", 404, "NOT_FOUND");
      }

      const { code, startDate, endDate, voucherReset } = updateData;

      // Check duplicate code if changed
      if (code && code.trim().toUpperCase() !== financialYear.code) {
        const codeExists = await FinancialYear.isCodeExists(code.trim(), id);
        if (codeExists) {
          throw createAppError(
            `Financial year with code '${code}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      // Validate and check date overlap if dates changed
      // Normalize all dates to UTC midnight for consistent comparison
      let start = normalizeDateToUTC(financialYear.startDate);
      let end = normalizeDateToUTC(financialYear.endDate);

      if (startDate) start = normalizeDateToUTC(startDate);
      if (endDate) end = normalizeDateToUTC(endDate);

      // Validate normalized dates
      if (!start || !end) {
        throw createAppError("Invalid date format", 400, "INVALID_DATE");
      }

      // Compare normalized dates (both at UTC midnight)
      if (start >= end) {
        throw createAppError(
          "Start date must be before end date",
          400,
          "INVALID_DATE_RANGE"
        );
      }

      // Check date overlap only if dates changed
      if (startDate || endDate) {
        const overlap = await FinancialYear.hasDateOverlap(start, end, id);
        if (overlap) {
          throw createAppError(
            `Date range overlaps with existing financial year: ${overlap.code}`,
            409,
            "DATE_OVERLAP"
          );
        }
      }

      const updatedFinancialYear = await FinancialYear.findByIdAndUpdate(
        id,
        {
          ...(code && { code: code.trim().toUpperCase() }),
          ...(startDate && { startDate: start }),
          ...(endDate && { endDate: end }),
          ...(voucherReset !== undefined && { voucherReset }),
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedFinancialYear;
    } catch (error) {
      throw error;
    }
  }

  // DELETE (Hard Delete)
  static async deleteFinancialYear(id) {
    try {
      const financialYear = await FinancialYear.findById(id);
      if (!financialYear) {
        throw createAppError("Financial year not found", 404, "NOT_FOUND");
      }

      // Check if this is the current financial year
      if (financialYear.isCurrent()) {
        throw createAppError(
          "Cannot delete the current active financial year",
          400,
          "CANNOT_DELETE_CURRENT"
        );
      }

      // TODO: Add check for related records (vouchers, transactions, etc.)
      // Example:
      // const hasVouchers = await Voucher.exists({ financialYearId: id });
      // if (hasVouchers) {
      //   throw createAppError(
      //     "Cannot delete financial year with existing vouchers",
      //     400,
      //     "HAS_DEPENDENCIES"
      //   );
      // }

      await FinancialYear.deleteOne({ _id: id });
      return { message: "Financial year deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // SOFT DELETE (Set status to false)
  static async softDeleteFinancialYear(id, adminId) {
    try {
      const financialYear = await FinancialYear.findById(id);
      if (!financialYear) {
        throw createAppError("Financial year not found", 404, "NOT_FOUND");
      }

      if (financialYear.isCurrent()) {
        throw createAppError(
          "Cannot deactivate the current active financial year",
          400,
          "CANNOT_DELETE_CURRENT"
        );
      }

      const updated = await FinancialYear.findByIdAndUpdate(
        id,
        {
          status: false,
          updatedBy: adminId,
        },
        { new: true }
      );

      return {
        message: "Financial year deactivated successfully",
        data: updated,
      };
    } catch (error) {
      throw error;
    }
  }
}

export default FinancialYearService;