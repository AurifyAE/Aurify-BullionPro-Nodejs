import AccountTypeService from "../../services/modules/AccountTypeService.js";
import { createAppError } from "../../utils/errorHandler.js";

// Create new trade debtor
export const createTradeDebtor = async (req, res, next) => {
  try {
    console.log("Request body:", req.body);
    console.log("Files info:", req.filesInfo);
    console.log("Files by field:", req.filesByField);

    const {
      title,
      accountCode,
      customerName,
      remarks,
      classification,
      acDefinition,
      limitsMargins,
      addresses,
      employees,
      vatGstDetails,
      bankDetails,
      kycDetails,
    } = req.body;
    let accountType = "DEBTOR"


    // Basic validation - only required fields
    if (!accountCode || !customerName || !title || !accountType) {
      throw createAppError(
        "Required fields missing: accountType, title, accountCode, customerName",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    // check the password and confirm password match
    if (req.body.password !== req.body.confirmPassword) {
      throw createAppError(
        "Password and Confirm Password do not match",
        400,
        "PASSWORD_MISMATCH"
      );
    }

    // Validate acDefinition.currencies (required)
    let parsedAcDefinition;
    try {
      parsedAcDefinition =
        typeof acDefinition === "string"
          ? JSON.parse(acDefinition)
          : acDefinition;
    } catch (parseError) {
      throw createAppError(
        "Invalid JSON format for acDefinition",
        400,
        "INVALID_JSON_FORMAT"
      );
    }

    if (
      !parsedAcDefinition ||
      !parsedAcDefinition.currencies ||
      !Array.isArray(parsedAcDefinition.currencies) ||
      parsedAcDefinition.currencies.length === 0
    ) {
      throw createAppError(
        "At least one currency is required in acDefinition",
        400,
        "MISSING_CURRENCY"
      );
    }

    // Validate shortMargin if limitsMargins provided
    let parsedLimitsMargins;
    try {
      parsedLimitsMargins =
        typeof limitsMargins === "string"
          ? JSON.parse(limitsMargins)
          : limitsMargins;
    } catch (parseError) {
      throw createAppError(
        "Invalid JSON format for limitsMargins",
        400,
        "INVALID_JSON_FORMAT"
      );
    }

    if (
      parsedLimitsMargins &&
      Array.isArray(parsedLimitsMargins) &&
      parsedLimitsMargins.length > 0
    ) {
      for (const limit of parsedLimitsMargins) {
        if (limit.shortMargin === undefined || limit.shortMargin === null) {
          throw createAppError(
            "shortMargin is required in limitsMargins",
            400,
            "MISSING_SHORT_MARGIN"
          );
        }
      }
    }

    // Parse optional JSON strings
    let parsedAddresses,
      parsedEmployees,
      parsedVatGstDetails,
      parsedBankDetails,
      parsedKycDetails;

    try {
      parsedAddresses = addresses
        ? typeof addresses === "string"
          ? JSON.parse(addresses)
          : addresses
        : [];
      parsedEmployees = employees
        ? typeof employees === "string"
          ? JSON.parse(employees)
          : employees
        : [];
      parsedVatGstDetails = vatGstDetails
        ? typeof vatGstDetails === "string"
          ? JSON.parse(vatGstDetails)
          : vatGstDetails
        : null;
      parsedBankDetails = bankDetails
        ? typeof bankDetails === "string"
          ? JSON.parse(bankDetails)
          : bankDetails
        : [];
      parsedKycDetails = kycDetails
        ? typeof kycDetails === "string"
          ? JSON.parse(kycDetails)
          : kycDetails
        : [];
    } catch (parseError) {
      throw createAppError(
        "Invalid JSON format in optional data",
        400,
        "INVALID_JSON_FORMAT"
      );
    }

    // FIXED: Normalize VAT status to match schema enum values
    if (parsedVatGstDetails && parsedVatGstDetails.vatStatus) {
      const vatStatusMap = {
        'registered': 'REGISTERED',
        'unregistered': 'UNREGISTERED',
        'exempted': 'EXEMPTED'
      };

      const normalizedStatus = vatStatusMap[parsedVatGstDetails.vatStatus.toLowerCase()];
      if (normalizedStatus) {
        parsedVatGstDetails.vatStatus = normalizedStatus;
      } else {
        // If invalid status provided, set to null to use schema default
        parsedVatGstDetails.vatStatus = null;
      }
    }

    // Optional validation for addresses (if provided)
    if (
      parsedAddresses &&
      Array.isArray(parsedAddresses) &&
      parsedAddresses.length > 0
    ) {
      for (const address of parsedAddresses) {
        // Only validate if specific fields are provided (since they're optional in schema)
        if (
          address.email &&
          !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(address.email)
        ) {
          throw createAppError(
            "Invalid email format in address",
            400,
            "INVALID_EMAIL_FORMAT"
          );
        }
      }
    }

    // Optional validation for employees (if provided)
    if (
      parsedEmployees &&
      Array.isArray(parsedEmployees) &&
      parsedEmployees.length > 0
    ) {
      for (const employee of parsedEmployees) {
        if (
          employee.email &&
          !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(employee.email)
        ) {
          throw createAppError(
            "Invalid email format in employee",
            400,
            "INVALID_EMAIL_FORMAT"
          );
        }
      }
    }

    // Handle file uploads
    let processedVatGstDetails = parsedVatGstDetails;
    let processedKycDetails = parsedKycDetails || [];

    // Handle VAT/GST documents
    if (req.filesByField && req.filesByField["vatGstDetails.documents"]) {
      if (!processedVatGstDetails) {
        processedVatGstDetails = {};
      }
      if (!processedVatGstDetails.documents) {
        processedVatGstDetails.documents = [];
      }
      processedVatGstDetails.documents.push(
        ...req.filesByField["vatGstDetails.documents"].map((file) => ({
          fileName: file.originalname,
          filePath: file.location || file.path,
          fileType: file.mimetype,
          s3Key: file.key || null,
          uploadedAt: new Date(),
        }))
      );
    }

    // Handle KYC documents
    if (req.filesByField && req.filesByField["kycDetails.documents"]) {
      const kycDocuments = req.filesByField["kycDetails.documents"].map(
        (file) => ({
          fileName: file.originalname,
          filePath: file.location || file.path,
          fileType: file.mimetype,
          s3Key: file.key || null,
          uploadedAt: new Date(),
        })
      );

      if (processedKycDetails.length > 0) {
        processedKycDetails[0].documents = kycDocuments;
      } else {
        processedKycDetails.push({
          documentType: "General",
          documents: kycDocuments,
        });
      }
    }

    // Build the trade debtor data - only include provided fields
    const tradeDebtorData = {
      accountType: accountType.trim(),
      title: title.trim(),
      accountCode: accountCode.trim().toUpperCase(),
      customerName: customerName.trim(),
      acDefinition: parsedAcDefinition,
    };

    // Add optional fields only if provided and not empty
    if (classification) tradeDebtorData.classification = classification.trim();
    if (remarks) tradeDebtorData.remarks = remarks.trim();
    if (parsedLimitsMargins && parsedLimitsMargins.length > 0)
      tradeDebtorData.limitsMargins = parsedLimitsMargins;
    if (parsedAddresses && parsedAddresses.length > 0)
      tradeDebtorData.addresses = parsedAddresses;
    if (parsedEmployees && parsedEmployees.length > 0)
      tradeDebtorData.employees = parsedEmployees;

    // FIXED: Only add vatGstDetails if it has meaningful data
    if (
      processedVatGstDetails &&
      (processedVatGstDetails.vatStatus ||
        processedVatGstDetails.vatNumber ||
        (processedVatGstDetails.documents &&
          processedVatGstDetails.documents.length > 0))
    ) {
      tradeDebtorData.vatGstDetails = processedVatGstDetails;
    }

    if (parsedBankDetails && parsedBankDetails.length > 0)
      tradeDebtorData.bankDetails = parsedBankDetails;

    // FIXED: Only add kycDetails if array has meaningful data
    if (processedKycDetails && processedKycDetails.length > 0) {
      // Filter out empty KYC records
      const validKycDetails = processedKycDetails.filter(
        (kyc) =>
          kyc.documentType ||
          kyc.documentNumber ||
          kyc.issueDate ||
          kyc.expiryDate ||
          (kyc.documents && kyc.documents.length > 0)
      );

      if (validKycDetails.length > 0) {
        tradeDebtorData.kycDetails = validKycDetails;
      }
    }

    if( req.body.password && req.body.password.trim() !== "" ) {
      tradeDebtorData.password = req.body.password.trim();
    }
    


    const tradeDebtor = await AccountTypeService.createTradeDebtor(
      tradeDebtorData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: "Trade debtor created successfully",
      data: tradeDebtor,
      uploadedFiles: {
        total: req.filesInfo?.length || 0,
        vatGstDocuments: processedVatGstDetails?.documents?.length || 0,
        kycDocuments: req.filesByField?.["kycDetails.documents"]?.length || 0,
      },
    });
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      try {
        const { deleteMultipleS3Files } = await import(
          "../../utils/s3Utils.js"
        );
        const s3Keys = req.files.map((file) => file.key).filter((key) => key);
        if (s3Keys.length > 0) {
          await deleteMultipleS3Files(s3Keys);
        }
      } catch (cleanupError) {
        console.error("Error cleaning up files:", cleanupError);
      }
    }
    next(error);
  }
};

// Get all trade debtors
export const getAllTradeDebtors = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = "",
      status = "",
      classification = "",
      sortBy = "createdAt", // Assuming this is the date field; if it's 'createdBy' (user ID), change to that
      sortOrder = "desc",
    } = req.query;

    const trimmedSortBy = sortBy.trim();
    const direction = sortOrder.trim() === "asc" ? 1 : -1;

    let sortArray = [];
    
    if (trimmedSortBy === "favorite") {
      sortArray.push(["favorite", direction]);
    } else {
      sortArray.push(["favorite", -1]);
      sortArray.push([trimmedSortBy, direction]);
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search: search.trim(),
      status: status.trim(),
      classification: classification.trim(),
      sort: sortArray, // Send sort as array for explicit order
    };

    const result = await AccountTypeService.getAllTradeDebtors(options);

    res.status(200).json({
      success: true,
      message: "Trade debtors fetched successfully",
      data: result.tradeDebtors,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get trade debtor by ID
export const getTradeDebtorById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Trade debtor ID is required", 400, "MISSING_ID");
    }

    const tradeDebtor = await AccountTypeService.getTradeDebtorById(id);

    res.status(200).json({
      success: true,
      message: "Trade debtor fetched successfully",
      data: tradeDebtor,
    });
  } catch (error) {
    next(error);
  }
};

// Update trade debtor
export const updateTradeDebtor = async (req, res, next) => {

  let uploadedFiles = [];

  try {
    const { id } = req.params;
    let updateData = { ...req.body };
    const { updatetype } = req.query;
    // for updating type
    if (updatetype === "true") {
      const updatedTradeDebtor = await AccountTypeService.updateTradeDebtor(
        id,
        updateData,
        req.admin.id
      );
      return res.status(200).json({ message: "Type updated", data: updatedTradeDebtor });
    }

    if (!id) {
      throw createAppError("Trade debtor ID is required", 400, "MISSING_ID");
    }


    // Keep track of uploaded files for cleanup on error
    if (req.files && req.files.length > 0) {
      uploadedFiles = req.files
        .map((file) => file.key || file.filename)
        .filter(Boolean);
    }

    // Helper function to process uploaded files
    const processUploadedFiles = (files) => {
      return files.map((file) => ({
        fileName: file.originalname,
        filePath: file.location || file.path,
        fileType: file.mimetype,
        s3Key: file.key || null,
        uploadedAt: new Date(),
      }));
    };

    // Parse JSON strings if they come as strings (common with FormData)
    const parseJsonField = (field) => {
      if (typeof field === "string") {
        try {
          return JSON.parse(field);
        } catch (e) {
          console.warn(`Failed to parse JSON field: ${field}`);
          return field;
        }
      }
      return field;
    };

    // Handle file uploads and document management
    if (req.filesByField && Object.keys(req.filesByField).length > 0) {
      // Process VAT documents
      if (req.filesByField["vatGstDetails.documents"]) {
        const vatDocuments = processUploadedFiles(
          req.filesByField["vatGstDetails.documents"]
        );
        let processedVatGstDetails =
          parseJsonField(updateData.vatGstDetails) || {};

        // Check if we should replace existing documents or append
        const replaceVatDocs =
          updateData.replaceVatDocuments === "true" ||
          updateData.replaceVatDocuments === true;

        if (replaceVatDocs) {
          // Replace all existing VAT documents
          processedVatGstDetails.documents = vatDocuments;
          updateData._replaceVatDocuments = true;
          console.log(
            `Replacing VAT documents with ${vatDocuments.length} new files`
          );
        } else {
          // Append to existing documents
          processedVatGstDetails.documents = vatDocuments; // New documents only
          console.log(`Adding ${vatDocuments.length} new VAT documents`);
        }

        updateData.vatGstDetails = processedVatGstDetails;
      }

      // Handle VAT document removal
      if (updateData.removeVatDocuments) {
        const documentsToRemove = Array.isArray(updateData.removeVatDocuments)
          ? updateData.removeVatDocuments
          : [updateData.removeVatDocuments];
        updateData._removeVatDocuments = documentsToRemove;
        console.log(`Removing VAT documents:`, documentsToRemove);
      }

      // Process KYC documents
      if (req.filesByField["kycDetails.documents"]) {
        const kycDocuments = processUploadedFiles(
          req.filesByField["kycDetails.documents"]
        );
        let processedKycDetails = parseJsonField(updateData.kycDetails) || [];

        const replaceKycDocs =
          updateData.replaceKycDocuments === "true" ||
          updateData.replaceKycDocuments === true;

        // Ensure processedKycDetails is an array
        if (!Array.isArray(processedKycDetails)) {
          processedKycDetails = [];
        }

        // Get or create the first KYC entry
        if (processedKycDetails.length === 0) {
          processedKycDetails.push({});
        }

        if (replaceKycDocs) {
          // Replace documents in first KYC entry
          processedKycDetails[0].documents = kycDocuments;
          processedKycDetails[0]._replaceDocuments = true;
          console.log(
            `Replacing KYC documents with ${kycDocuments.length} new files`
          );
        } else {
          // Add new documents (will be merged with existing in service)
          processedKycDetails[0].documents = kycDocuments;
          console.log(`Adding ${kycDocuments.length} new KYC documents`);
        }

        updateData.kycDetails = processedKycDetails;
      }

      // Handle KYC document removal
      if (updateData.removeKycDocuments) {
        const documentsToRemove = Array.isArray(updateData.removeKycDocuments)
          ? updateData.removeKycDocuments
          : [updateData.removeKycDocuments];

        if (!updateData.kycDetails) {
          updateData.kycDetails = [{}];
        } else if (!Array.isArray(updateData.kycDetails)) {
          updateData.kycDetails = [updateData.kycDetails];
        }

        if (updateData.kycDetails.length === 0) {
          updateData.kycDetails.push({});
        }

        updateData.kycDetails[0]._removeDocuments = documentsToRemove;
        console.log(`Removing KYC documents:`, documentsToRemove);
      }

      // Process general documents (add to VAT documents)
      const generalDocuments = [];
      ["documents", "files", "file"].forEach((fieldName) => {
        if (req.filesByField[fieldName]) {
          generalDocuments.push(
            ...processUploadedFiles(req.filesByField[fieldName])
          );
        }
      });

      if (generalDocuments.length > 0) {
        if (!updateData.vatGstDetails) {
          updateData.vatGstDetails = {};
        }
        const vatGstDetails = parseJsonField(updateData.vatGstDetails);
        vatGstDetails.documents = [
          ...(vatGstDetails.documents || []),
          ...generalDocuments,
        ];
        updateData.vatGstDetails = vatGstDetails;
        console.log(
          `Added ${generalDocuments.length} general documents to VAT section`
        );
      }
    }

    // Parse JSON fields that might come as strings
    const jsonFields = [
      "addresses",
      "employees",
      "acDefinition",
      "limitsMargins",
      "bankDetails",
      "kycDetails",
      "vatGstDetails",
    ];

    jsonFields.forEach((field) => {
      if (updateData[field]) {
        updateData[field] = parseJsonField(updateData[field]);
      }
    });

    // Trim string fields if they exist
    const stringFields = [
      "accountCode",
      "customerName",
      "title",
      "shortName",
      "parentGroup",
      "remarks",
    ];
    stringFields.forEach((field) => {
      if (updateData[field] && typeof updateData[field] === "string") {
        updateData[field] =
          field === "accountCode"
            ? updateData[field].trim().toUpperCase()
            : updateData[field].trim();
      }
    });

    // Validate addresses if provided
    // if (updateData.addresses && Array.isArray(updateData.addresses)) {
    //   for (const address of updateData.addresses) {
    //     if (
    //       !address.streetAddress ||
    //       !address.city ||
    //       !address.country ||
    //       !address.zipCode
    //     ) {
    //       throw createAppError(
    //         "Address must include streetAddress, city, country, and zipCode",
    //         400,
    //         "INVALID_ADDRESS_DATA"
    //       );
    //     }
    //   }
    // }

    // Validate employees if provided
    // if (updateData.employees && Array.isArray(updateData.employees)) {
    //   for (const employee of updateData.employees) {
    //     if (
    //       !employee.name ||
    //       !employee.designation ||
    //       !employee.email ||
    //       !employee.mobile
    //     ) {
    //       throw createAppError(
    //         "Employee must include name, designation, email, and mobile",
    //         400,
    //         "INVALID_EMPLOYEE_DATA"
    //       );
    //     }
    //   }
    // }

    // Clean up client-side flags
    delete updateData.replaceVatDocuments;
    delete updateData.replaceKycDocuments;
    delete updateData.removeVatDocuments;
    delete updateData.removeKycDocuments;

    // Call the service to update the trade debtor
    const updatedTradeDebtor = await AccountTypeService.updateTradeDebtor(
      id,
      updateData,
      req.admin.id
    );

    // Calculate uploaded files info
    const filesUploaded = {
      vatDocuments: req.filesByField?.["vatGstDetails.documents"]?.length || 0,
      kycDocuments: req.filesByField?.["kycDetails.documents"]?.length || 0,
      generalDocuments:
        (req.filesByField?.["documents"]?.length || 0) +
        (req.filesByField?.["files"]?.length || 0) +
        (req.filesByField?.["file"]?.length || 0),
      total: (req.files || []).length,
    };

    const response = {
      success: true,
      message: "Trade debtor updated successfully",
      data: updatedTradeDebtor,
    };

    // Add file upload info if files were uploaded
    if (filesUploaded.total > 0) {
      response.filesUploaded = filesUploaded;
    }

    // Add file management info if files were deleted
    if (updatedTradeDebtor._filesManagement?.filesDeleted > 0) {
      response.filesManagement = {
        oldFilesDeleted: updatedTradeDebtor._filesManagement.filesDeleted,
        filesFailedToDelete:
          updatedTradeDebtor._filesManagement.filesFailedToDelete || 0,
        message: `${updatedTradeDebtor._filesManagement.filesDeleted} old files were removed from S3`,
      };

      if (updatedTradeDebtor._filesManagement.filesFailedToDelete > 0) {
        response.filesManagement.warning = `${updatedTradeDebtor._filesManagement.filesFailedToDelete} files could not be deleted from S3`;
      }
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Error updating trade debtor:", error);

    // Clean up uploaded files if error occurs and we have files to clean up
    if (uploadedFiles.length > 0) {
      console.log(
        `Cleaning up ${uploadedFiles.length} uploaded files due to error`
      );
      try {
        const cleanupResult = await deleteMultipleS3Files(uploadedFiles);
        if (cleanupResult.successful?.length > 0) {
          console.log(
            `Successfully cleaned up ${cleanupResult.successful.length} uploaded files`
          );
        }
        if (cleanupResult.failed?.length > 0) {
          console.warn(
            `Failed to clean up ${cleanupResult.failed.length} files:`,
            cleanupResult.failed
          );
        }
      } catch (cleanupError) {
        console.error("Error during file cleanup:", cleanupError);
      }
    }

    next(error);
  }
};

// Delete trade debtor (soft delete)
export const deleteTradeDebtor = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Trade debtor ID is required", 400, "MISSING_ID");
    }

    const deletedTradeDebtor = await AccountTypeService.deleteTradeDebtor(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Trade debtor deleted successfully",
      data: deletedTradeDebtor,
    });
  } catch (error) {
    next(error);
  }
};

// Hard delete trade debtor
export const hardDeleteTradeDebtor = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Trade debtor ID is required", 400, "MISSING_ID");
    }

    console.log(`Processing hard delete request for trade debtor: ${id}`);

    const result = await AccountTypeService.hardDeleteTradeDebtor(id);

    const response = {
      success: true,
      message: result.message,
      filesDeleted: {
        total: result.filesDeleted?.total || 0,
        successful: result.filesDeleted?.successful || 0,
        failed: result.filesDeleted?.failed || 0,
      },
    };

    // Add detailed info if there were files involved
    if (result.filesDeleted?.total > 0) {
      response.filesDeleted.details = {
        successfulKeys: result.filesDeleted.successfulKeys || [],
        failedKeys: result.filesDeleted.failedKeys || [],
      };

      if (result.filesDeleted.failed > 0) {
        response.warning = `${result.filesDeleted.failed} files could not be deleted from S3`;
        if (result.filesDeleted.errors) {
          response.s3Errors = result.filesDeleted.errors;
        }
      }
    }

    console.log(`Hard delete completed for trade debtor ${id}:`, {
      filesTotal: result.filesDeleted?.total || 0,
      filesDeleted: result.filesDeleted?.successful || 0,
      filesFailed: result.filesDeleted?.failed || 0,
    });

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in hard delete:", error);
    next(error);
  }
};

// Toggle status
export const toggleTradeDebtorStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Trade debtor ID is required", 400, "MISSING_ID");
    }

    const updatedTradeDebtor = await AccountTypeService.toggleStatus(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Trade debtor status updated successfully",
      data: updatedTradeDebtor,
    });
  } catch (error) {
    next(error);
  }
};

// Get active debtors list
export const getActiveDebtorsList = async (req, res, next) => {
  try {
    const debtors = await AccountTypeService.getActiveDebtorsList();

    res.status(200).json({
      success: true,
      message: "Active debtors list fetched successfully",
      data: debtors,
    });
  } catch (error) {
    next(error);
  }
};

// Search debtors
export const searchDebtors = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      throw createAppError(
        "Search term must be at least 2 characters long",
        400,
        "INVALID_SEARCH_TERM"
      );
    }

    const debtors = await AccountTypeService.searchDebtors(q.trim());

    res.status(200).json({
      success: true,
      message: "Search results fetched successfully",
      data: debtors,
    });
  } catch (error) {
    next(error);
  }
};

// Get debtor statistics
export const getDebtorStatistics = async (req, res, next) => {
  try {
    const statistics = await AccountTypeService.getDebtorStatistics();

    res.status(200).json({
      success: true,
      message: "Debtor statistics fetched successfully",
      data: statistics,
    });
  } catch (error) {
    next(error);
  }
};

// Bulk operations

// Bulk status update
export const bulkUpdateStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createAppError("IDs array is required", 400, "MISSING_IDS");
    }

    if (!status || !["active", "inactive", "suspended"].includes(status)) {
      throw createAppError(
        "Valid status is required (active, inactive, suspended)",
        400,
        "INVALID_STATUS"
      );
    }

    const results = [];
    for (const id of ids) {
      try {
        const updatedDebtor = await AccountTypeService.updateTradeDebtor(
          id,
          { status, isActive: status === "active" },
          req.admin.id
        );
        results.push({ id, success: true, data: updatedDebtor });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: "Bulk status update completed",
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

// Bulk delete
export const bulkDeleteDebtors = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createAppError("IDs array is required", 400, "MISSING_IDS");
    }

    const results = [];
    for (const id of ids) {
      try {
        const deletedDebtor = await AccountTypeService.deleteTradeDebtor(
          id,
          req.admin.id
        );
        results.push({ id, success: true, data: deletedDebtor });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: "Bulk delete completed",
      data: results,
    });
  } catch (error) {
    next(error);
  }
};
