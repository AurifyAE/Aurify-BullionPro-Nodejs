import AccountMode from "../../models/modules/AccountMode.js";
import AccountType from "../../models/modules/AccountType.js";
import { createAppError } from "../../utils/errorHandler.js";

export class AccountModeService {
  // CREATE
  static async createAccountMode(accountModeData, adminId) {
    try {
      const { name, prefix } = accountModeData;

      // Validate required fields
      if (!name?.trim()) {
        throw createAppError("Account mode name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      if (!prefix?.trim()) {
        throw createAppError("Prefix is required", 400, "REQUIRED_FIELD_MISSING");
      }

      // Validate prefix format (1-5 characters, alphanumeric)
      const prefixTrimmed = prefix.trim().toUpperCase();
      if (prefixTrimmed.length > 5) {
        throw createAppError("Prefix cannot exceed 5 characters", 400, "INVALID_PREFIX_LENGTH");
      }

      if (!/^[A-Z0-9]{1,5}$/.test(prefixTrimmed)) {
        throw createAppError("Prefix must contain only uppercase letters and numbers", 400, "INVALID_PREFIX_FORMAT");
      }

      // Check duplicate name
      const nameExists = await AccountMode.isNameExists(name.trim());
      if (nameExists) {
        throw createAppError(`Account mode with name '${name}' already exists`, 409, "DUPLICATE_NAME");
      }

      // Check duplicate prefix
      const prefixExists = await AccountMode.isPrefixExists(prefixTrimmed);
      if (prefixExists) {
        throw createAppError(`Prefix '${prefixTrimmed}' is already in use`, 409, "DUPLICATE_PREFIX");
      }

      const accountMode = new AccountMode({
        name: name.trim(),
        prefix: prefixTrimmed,
        createdBy: adminId,
      });

      await accountMode.save();

      return await AccountMode.findById(accountMode._id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  // READ ALL
  static async getAllAccountModes(page = 1, limit = 10, search = "") {
    try {
      const skip = (page - 1) * limit;
      const query = { status: true }; // Only active

      if (search) {
        query.$or = [
          { name: new RegExp(search, "i") },
          { prefix: new RegExp(search, "i") },
        ];
      }

      const [accountModes, total] = await Promise.all([
        AccountMode.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        AccountMode.countDocuments(query),
      ]);

      return {
        accountModes,
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
  static async getAccountModeById(id) {
    try {
      const accountMode = await AccountMode.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!accountMode) {
        throw createAppError("Account mode not found", 404, "NOT_FOUND");
      }

      if (!accountMode.status) {
        throw createAppError("Account mode is inactive", 410, "INACTIVE");
      }

      return accountMode;
    } catch (error) {
      throw error;
    }
  }

  // UPDATE
  static async updateAccountMode(id, updateData, adminId) {
    try {
      const accountMode = await AccountMode.findById(id);
      if (!accountMode) {
        throw createAppError("Account mode not found", 404, "NOT_FOUND");
      }

      const { name, prefix } = updateData;

      // Validate and check duplicate name
      if (name && name.trim() !== accountMode.name) {
        const nameExists = await AccountMode.isNameExists(name.trim(), id);
        if (nameExists) {
          throw createAppError(`Account mode with name '${name}' already exists`, 409, "DUPLICATE_NAME");
        }
      }

      // Validate and check duplicate prefix
      if (prefix) {
        const prefixTrimmed = prefix.trim().toUpperCase();
        
        // Validate prefix format
        if (prefixTrimmed.length > 5) {
          throw createAppError("Prefix cannot exceed 5 characters", 400, "INVALID_PREFIX_LENGTH");
        }

        if (!/^[A-Z0-9]{1,5}$/.test(prefixTrimmed)) {
          throw createAppError("Prefix must contain only uppercase letters and numbers", 400, "INVALID_PREFIX_FORMAT");
        }

        if (prefixTrimmed !== accountMode.prefix) {
          const prefixExists = await AccountMode.isPrefixExists(prefixTrimmed, id);
          if (prefixExists) {
            throw createAppError(`Prefix '${prefixTrimmed}' is already in use`, 409, "DUPLICATE_PREFIX");
          }
        }
      }

      const updatedAccountMode = await AccountMode.findByIdAndUpdate(
        id,
        {
          ...(name && { name: name.trim() }),
          ...(prefix && { prefix: prefix.trim().toUpperCase() }),
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedAccountMode;
    } catch (error) {
      throw error;
    }
  }

  // DELETE (Hard Delete)
  static async deleteAccountMode(id) {
    try {
      const accountMode = await AccountMode.findById(id);
      if (!accountMode) {
        throw createAppError("Account mode not found", 404, "NOT_FOUND");
      }
      const accountUsingMode = await AccountType.findOne({ accountType: id });

      if (accountUsingMode) {
        throw createAppError(
          "Cannot delete this Account Mode because it is linked with existing accounts",
          400,
          "MODE_IN_USE"
        );
      }
      await AccountMode.deleteOne({ _id: id });
      return { message: "Account mode deleted successfully" };
    } catch (error) {
      throw error;
    }
  }
}

export default AccountModeService;