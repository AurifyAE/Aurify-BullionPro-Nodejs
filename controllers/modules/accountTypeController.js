import AccountTypeService from "../../services/modules/AccountTypeService.js";
import { generateUniqueAccountCode, validateAccountMode } from "../../utils/createAccountCode.js";
import { createAppError } from "../../utils/errorHandler.js";
import { deleteMultipleS3Files } from "../../utils/s3Utils.js"; // Ensure this import is added

// Create new trade debtor
export const createTradeDebtor = async (req, res, next) => {
  try {
    const {
      title,
      customerName,
      remarks,
      classification,
      shortName,
      parentGroup,
      isSupplier,
      favorite,
      acDefinition,
      limitsMargins,
      addresses,
      bankDetails,
      vatGstDetails,
      employees,
      kycDetails,
      accountType,
    } = req.body;

    console.log("req.body : ",req.body,);

    // ✅ Helper function to handle 'null' and 'undefined' strings
    const sanitizeString = (value, defaultValue = '') => {
      if (!value || value === 'null' || value === 'undefined') {
        return defaultValue;
      }
      return typeof value === 'string' ? value.trim() : value;
    };

    // ✅ NEW: Validate accountModeId is provided
    if (!accountType) {
      throw createAppError(
        'Account mode ID is required',
        400,
        'MISSING_ACCOUNT_MODE'
      );
    }

    // ✅ NEW: Validate account mode exists and is active
    await validateAccountMode(accountType);

    // ✅ NEW: Generate unique account code automatically
    const accountCode = await generateUniqueAccountCode(accountType);
    console.log('Generated account code:', accountCode);

    // Basic validation - required fields (removed accountCode from here)
    if (!customerName || !accountType) {
      throw createAppError(
        'Required fields missing: accountType, customerName',
        400,
        'REQUIRED_FIELDS_MISSING'
      );
    }

    // Parse JSON fields safely
    const parseJsonField = (field, fieldName) => {
      if (!field) return field;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch (parseError) {
          console.warn(`Failed to parse JSON field: ${fieldName}`, parseError);
          throw createAppError(
            `Invalid JSON format for ${fieldName}`,
            400,
            'INVALID_JSON_FORMAT'
          );
        }
      }
      return field;
    };

    // Validate acDefinition.currencies (required)
    let parsedAcDefinition = parseJsonField(acDefinition, 'acDefinition');
    if (
      !parsedAcDefinition ||
      !parsedAcDefinition.currencies ||
      !Array.isArray(parsedAcDefinition.currencies) ||
      parsedAcDefinition.currencies.length === 0
    ) {
      throw createAppError('At least one currency is required in acDefinition', 400, 'MISSING_CURRENCY');
    }

    // ✅ Validate USD & AED BEFORE processing currencies
    const incomingCurrencyCodes = parsedAcDefinition.currencies.map((c) => c.currency?.currencyCode);
    const missing = ['USD', 'AED'].filter((code) => !incomingCurrencyCodes.includes(code));
    if (missing.length > 0) {
      throw createAppError(
        `Required currencies missing: ${missing.join(', ')}. Both USD and AED must be included.`,
        400,
        'MISSING_REQUIRED_CURRENCIES'
      );
    }

    // Now process currencies (extract IDs)
    parsedAcDefinition.currencies = parsedAcDefinition.currencies.map((c) => {
      const currencyId = c.currency?._id || c.currency;
      if (!currencyId) {
        throw createAppError('Invalid currency reference', 400, 'INVALID_CURRENCY');
      }
      return {
        currency: currencyId,
        isDefault: !!c.isDefault,
        purchasePrice: parseFloat(c.purchasePrice) || 0,
        sellPrice: parseFloat(c.sellPrice) || 0,
        convertRate: parseFloat(c.convertRate) || 1,
      };
    });

    // ✅ Clean up branches if null/empty (prevent Branch model error)
    if (parsedAcDefinition.branches === null || 
        (Array.isArray(parsedAcDefinition.branches) && parsedAcDefinition.branches.length === 0)) {
      delete parsedAcDefinition.branches;
    }

    // ✅ Parse and validate limitsMargins
    let ParsedlimitsMargins = parseJsonField(limitsMargins, 'limitsMargins') || [];
    ParsedlimitsMargins = ParsedlimitsMargins.map((l) => ({
      limitType: l.limitType || 'Fixed',
      currency: l.currency?._id || l.currency,
      unfixGold: parseFloat(l.unfixGold) || 0,
      netAmount: parseFloat(l.netAmount) || 0,
      creditDaysAmt: parseInt(l.creditDaysAmt) || 0,
      creditDaysMtl: parseInt(l.creditDaysMtl) || 0,
      Margin: parseFloat(l.Margin),
      creditAmount: parseFloat(l.creditAmount) || 0,
      metalAmount: parseFloat(l.metalAmount) || 0,
    }));

    // Validate Margin
    if (ParsedlimitsMargins.some((l) => l.Margin === undefined || isNaN(l.Margin))) {
      throw createAppError('Margin is required and must be a valid number', 400, 'MISSING_MARGIN');
    }

    // Parse optional fields
    let parsedAddresses = parseJsonField(addresses, 'addresses') || [];
    let parsedEmployees = [];
    let parsedVatGstDetails = {};
    let parsedBankDetails = parseJsonField(bankDetails, 'bankDetails') || [];
    let parsedKycDetails = [];

    // Parse employees
    const employeeFieldPattern = /^employees\[(\d+)\]\[(\w+)\]$/;
    const employeeMap = {};
    if (employees && Array.isArray(employees)) {
      parsedEmployees = employees.map((emp, index) =>
        typeof emp === 'string'
          ? parseJsonField(emp, `employees[${index}]`)
          : emp
      );
    } else if (employees && typeof employees === 'string') {
      parsedEmployees = parseJsonField(employees, 'employees');
    } else {
      Object.keys(req.body).forEach((key) => {
        const match = key.match(employeeFieldPattern);
        if (match) {
          const index = parseInt(match[1]);
          const field = match[2];
          if (!employeeMap[index]) {
            employeeMap[index] = {};
          }
          employeeMap[index][field] = req.body[key];
        }
      });
      parsedEmployees = Object.values(employeeMap);
    }

    // Parse single vatGstDetails
    if (vatGstDetails) {
      parsedVatGstDetails = typeof vatGstDetails === 'string'
        ? parseJsonField(vatGstDetails, 'vatGstDetails')
        : vatGstDetails;
      const validStatuses = ['REGISTERED', 'UNREGISTERED', 'EXEMPTED'];
      if (!parsedVatGstDetails.vatStatus) {
        throw createAppError(
          'VAT status is required for vatGstDetails',
          400,
          'MISSING_VAT_STATUS'
        );
      }
      parsedVatGstDetails.vatStatus = validStatuses.includes(parsedVatGstDetails.vatStatus.toUpperCase())
        ? parsedVatGstDetails.vatStatus.toUpperCase()
        : 'UNREGISTERED';
      if (parsedVatGstDetails.vatStatus === 'REGISTERED' && !parsedVatGstDetails.vatNumber) {
        throw createAppError(
          'VAT number is required for REGISTERED status',
          400,
          'MISSING_VAT_NUMBER'
        );
      }
      parsedVatGstDetails.vatNumber = parsedVatGstDetails.vatNumber || '';
      parsedVatGstDetails.documents = parsedVatGstDetails.documents || [];
    }

    // Parse kycDetails
    const kycFieldPattern = /^kycDetails\[(\d+)\]\[(\w+)\]$/;
    const kycMap = {};
    if (kycDetails && Array.isArray(kycDetails)) {
      parsedKycDetails = kycDetails.map((kyc, index) =>
        typeof kyc === 'string'
          ? parseJsonField(kyc, `kycDetails[${index}]`)
          : kyc['']
          ? parseJsonField(kyc[''], `kycDetails[${index}]`)
          : kyc
      );
    } else if (kycDetails && typeof kycDetails === 'string') {
      parsedKycDetails = parseJsonField(kycDetails, 'kycDetails');
    } else {
      Object.keys(req.body).forEach((key) => {
        const match = key.match(kycFieldPattern);
        if (match) {
          const index = parseInt(match[1]);
          const field = match[2];
          if (!kycMap[index]) {
            kycMap[index] = {};
          }
          kycMap[index][field] = req.body[key];
        }
      });
      parsedKycDetails = Object.values(kycMap);
    }

    // Validate addresses
    if (parsedAddresses && Array.isArray(parsedAddresses) && parsedAddresses.length > 0) {
      for (const address of parsedAddresses) {
        if (
          address.email &&
          !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(address.email)
        ) {
          throw createAppError(
            'Invalid email format in address',
            400,
            'INVALID_EMAIL_FORMAT'
          );
        }
      }
    }

    // Handle employee documents
    if (parsedEmployees && Array.isArray(parsedEmployees) && parsedEmployees.length > 0) {
      for (let i = 0; i < parsedEmployees.length; i++) {
        const employee = parsedEmployees[i];
        if (
          employee.email &&
          !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(employee.email)
        ) {
          throw createAppError(
            'Invalid email format in employee',
            400,
            'INVALID_EMAIL_FORMAT'
          );
        }
        const employeeDocField = `employees[${i}][document]`;
        if (req.filesByField && req.filesByField[employeeDocField]) {
          const docFile = req.filesByField[employeeDocField][0];
          let fileType = null;
          if (docFile.mimetype.startsWith('image/')) {
            fileType = 'image';
          } else if (docFile.mimetype === 'application/pdf') {
            fileType = 'pdf';
          } else {
            throw createAppError(
              `Invalid file type for employee document: ${docFile.mimetype}`,
              400,
              'INVALID_FILE_TYPE'
            );
          }
          employee.document = {
            fileName: docFile.originalname,
            filePath: docFile.location || docFile.path,
            fileType: fileType,
            s3Key: docFile.key || null,
            uploadedAt: new Date(),
          };
        }
      }
    }

    // Handle VAT/GST documents
    if (req.filesByField && parsedVatGstDetails) {
      const vatDocField = `vatGstDetails[documents][0]`;
      if (req.filesByField[vatDocField]) {
        const vatDocuments = req.filesByField[vatDocField].map((file) => {
          let fileType = null;
          if (file.mimetype.startsWith('image/')) {
            fileType = 'image';
          } else if (file.mimetype === 'application/pdf') {
            fileType = 'pdf';
          } else {
            throw createAppError(
              `Invalid file type for VAT/GST document: ${file.mimetype}`,
              400,
              'INVALID_FILE_TYPE'
            );
          }
          return {
            fileName: file.originalname,
            filePath: file.location || file.path,
            fileType: fileType,
            s3Key: file.key || null,
            uploadedAt: new Date(),
          };
        });
        parsedVatGstDetails.documents = vatDocuments;
      }
    }

    // Handle KYC documents
    if (req.filesByField && parsedKycDetails.length > 0) {
      parsedKycDetails = parsedKycDetails.map((kyc, index) => {
        const kycDocField = `kycDetails[${index}][document]`;
        if (req.filesByField[kycDocField]) {
          const file = req.filesByField[kycDocField][0];
          let fileType = null;
          if (file.mimetype.startsWith('image/')) {
            fileType = 'image';
          } else if (file.mimetype === 'application/pdf') {
            fileType = 'pdf';
          } else {
            throw createAppError(
              `Invalid file type for KYC document at index ${index}: ${file.mimetype}`,
              400,
              'INVALID_FILE_TYPE'
            );
          }
          return {
            ...kyc,
            documents: [
              {
                fileName: file.originalname,
                filePath: file.location || file.path,
                fileType: fileType,
                s3Key: file.key || null,
                uploadedAt: new Date(),
              },
            ],
          };
        }
        return kyc;
      });
    }

    // Validate KYC details
    if (parsedKycDetails.length > 0) {
      for (const [index, kyc] of parsedKycDetails.entries()) {
        if (!kyc.documentType || !kyc.documentNumber) {
          throw createAppError(
            `KYC entry at index ${index} is missing documentType or documentNumber`,
            400,
            'MISSING_KYC_FIELDS'
          );
        }
        if (!kyc.documents || kyc.documents.length === 0) {
          throw createAppError(
            `KYC entry at index ${index} is missing a document`,
            400,
            'MISSING_KYC_DOCUMENT'
          );
        }
      }
    }

    // ✅ Build trade debtor data with generated account code
    const tradeDebtorData = {
      accountType: accountType.trim(),
      title: sanitizeString(title, 'N/A'),
      accountCode: accountCode, // ✅ Use generated code
      customerName: customerName.trim(),
      acDefinition: parsedAcDefinition,
      vatGstDetails: parsedVatGstDetails,
      createdBy: req.admin.id,
    };

    // Add optional fields with proper null/undefined handling using sanitizeString
    const sanitizedClassification = sanitizeString(classification, null);
    const sanitizedRemarks = sanitizeString(remarks, null);
    const sanitizedShortName = sanitizeString(shortName, null);
    const sanitizedParentGroup = sanitizeString(parentGroup, null);

    if (sanitizedClassification) tradeDebtorData.classification = sanitizedClassification;
    if (sanitizedRemarks) tradeDebtorData.remarks = sanitizedRemarks;
    if (sanitizedShortName) tradeDebtorData.shortName = sanitizedShortName;
    if (sanitizedParentGroup) tradeDebtorData.parentGroup = sanitizedParentGroup;
    
    if (isSupplier !== undefined)
      tradeDebtorData.isSupplier = isSupplier === 'true' || isSupplier === true;
    if (favorite !== undefined)
      tradeDebtorData.favorite = favorite === 'true' || favorite === true;
    if (ParsedlimitsMargins && ParsedlimitsMargins.length > 0)
      tradeDebtorData.limitsMargins = ParsedlimitsMargins;
    if (parsedAddresses && parsedAddresses.length > 0)
      tradeDebtorData.addresses = parsedAddresses;
    if (parsedEmployees && parsedEmployees.length > 0)
      tradeDebtorData.employees = parsedEmployees;
    if (parsedBankDetails && parsedBankDetails.length > 0)
      tradeDebtorData.bankDetails = parsedBankDetails;
    if (parsedKycDetails && parsedKycDetails.length > 0)
      tradeDebtorData.kycDetails = parsedKycDetails;

    // Initialize cash balances
    if (parsedAcDefinition.currencies && parsedAcDefinition.currencies.length > 0) {
      tradeDebtorData.balances = {
        goldBalance: {
          totalGrams: 0,
          totalValue: 0,
          lastUpdated: new Date(),
        },
        cashBalance: parsedAcDefinition.currencies.map((curr) => ({
          currency: curr.currency,
          amount: 0,
          isDefault: curr.isDefault || false,
          lastUpdated: new Date(),
        })),
        totalOutstanding: 0,
        lastBalanceUpdate: new Date(),
      };
    }

    const tradeDebtor = await AccountTypeService.createTradeDebtor(
      tradeDebtorData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: 'Trade debtor created successfully',
      data: tradeDebtor,
      accountCode: accountCode, // ✅ Return generated account code
      uploadedFiles: {
        total: req.filesInfo?.length || 0,
        vatGstDocuments: parsedVatGstDetails.documents?.length || 0,
        kycDocuments: parsedKycDetails.reduce(
          (sum, kyc) => sum + (kyc.documents?.length || 0),
          0
        ),
        employeeDocuments: parsedEmployees?.filter((emp) => emp.document).length || 0,
      },
    });
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      try {
        const s3Keys = req.files.map((file) => file.key).filter((key) => key);
        if (s3Keys.length > 0) {
          await deleteMultipleS3Files(s3Keys);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up files:', cleanupError);
      }
    }
    next(error);
  }
};

export const updateTradeDebtor = async (req, res, next) => {
  let uploadedFiles = [];
  try {
    const { id } = req.params;
    const { updatetype } = req.query;
    let updateData = { ...req.body };
    // console.log("update dataa.....",updateData)
    if (!id) {
      throw createAppError('Trade debtor ID is required', 400, 'MISSING_ID');
    }

    // Handle type update separately
    if (updatetype === 'true') {
      const updatedTradeDebtor = await AccountTypeService.updateTradeDebtor(
        id,
        updateData,
        req.admin.id
      );
      return res.status(200).json({ message: 'Type updated', data: updatedTradeDebtor });
    }

    // Keep track of uploaded files for cleanup on error
    if (req.files && req.files.length > 0) {
      uploadedFiles = req.files
        .map((file) => file.key || file.filename)
        .filter(Boolean);
    }

    // Helper function to process uploaded files
    const processUploadedFiles = (files) => {
      return files.map((file) => {
        let fileType = null;
        if (file.mimetype.startsWith('image/')) {
          fileType = 'image';
        } else if (file.mimetype === 'application/pdf') {
          fileType = 'pdf';
        } else {
          throw createAppError(
            `Invalid file type: ${file.mimetype}. Only image and PDF are allowed.`,
            400,
            'INVALID_FILE_TYPE'
          );
        }
        return {
          fileName: file.originalname,
          filePath: file.location || file.path,
          fileType: fileType,
          s3Key: file.key || null,
          uploadedAt: new Date(),
        };
      });
    };

    // Parse JSON fields safely
    const parseJsonField = (field, fieldName) => {
      if (!field) return field;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch (e) {
          console.warn(`Failed to parse JSON field: ${fieldName}`, e);
          throw createAppError(
            `Invalid JSON format for ${fieldName}`,
            400,
            'INVALID_JSON_FORMAT'
          );
        }
      }
      return field;
    };

    // Required fields validation
    if (!updateData.accountCode || !updateData.customerName) {
      throw createAppError(
        'Required fields missing: accountCode, customerName',
        400,
        'REQUIRED_FIELDS_MISSING'
      );
    }

    // Parse and validate acDefinition
    if (updateData.acDefinition) {
      updateData.acDefinition = parseJsonField(updateData.acDefinition, 'acDefinition');
      if (
        !updateData.acDefinition ||
        !updateData.acDefinition.currencies ||
        !Array.isArray(updateData.acDefinition.currencies) ||
        updateData.acDefinition.currencies.length === 0
      ) {
        throw createAppError(
          'At least one currency is required in acDefinition',
          400,
          'MISSING_CURRENCY'
        );
      }

      // ✅ FIX: Validate USD and AED BEFORE processing
      const incomingCurrencyCodes = updateData.acDefinition.currencies.map(
        (c) => c.currency?.currencyCode
      );
      const requiredCurrencies = ['USD', 'AED'];
      const missingCurrencies = requiredCurrencies.filter(
        (code) => !incomingCurrencyCodes.includes(code)
      );
      if (missingCurrencies.length > 0) {
        throw createAppError(
          `Required currencies missing: ${missingCurrencies.join(', ')}. USD and AED must be included.`,
          400,
          'MISSING_REQUIRED_CURRENCIES'
        );
      }

      // Now process currencies
      updateData.acDefinition.currencies = updateData.acDefinition.currencies.map((c) => {
        const currencyId = c.currency?._id || c.currency;
        if (!currencyId) {
          throw createAppError('Invalid currency reference', 400, 'INVALID_CURRENCY');
        }
        return {
          currency: currencyId,
          isDefault: !!c.isDefault,
          purchasePrice: parseFloat(c.purchasePrice) || 0,
          sellPrice: parseFloat(c.sellPrice) || 0,
          convertRate: parseFloat(c.convertRate) || 1,
        };
      });

      // ✅ Clean up branches if null/empty (prevent Branch model error)
      if (updateData.acDefinition.branches === null || 
          (Array.isArray(updateData.acDefinition.branches) && updateData.acDefinition.branches.length === 0)) {
        delete updateData.acDefinition.branches;
      }
    }

    // Parse optional JSON fields
    const jsonFields = ['addresses', 'employees', 'bankDetails', 'limitsMargins'];
    jsonFields.forEach((field) => {
      if (updateData[field]) {
        updateData[field] = parseJsonField(updateData[field], field);
        
        // ✅ Process limitsMargins properly
        if (field === 'limitsMargins' && Array.isArray(updateData[field])) {
          updateData[field] = updateData[field].map((l) => ({
            limitType: l.limitType || 'Fixed',
            currency: l.currency?._id || l.currency,
            unfixGold: parseFloat(l.unfixGold) || 0,
            netAmount: parseFloat(l.netAmount) || 0,
            creditDaysAmt: parseInt(l.creditDaysAmt) || 0,
            creditDaysMtl: parseInt(l.creditDaysMtl) || 0,
            Margin: parseFloat(l.Margin),
            creditAmount: parseFloat(l.creditAmount) || 0,
            metalAmount: parseFloat(l.metalAmount) || 0,
          }));

          // Validate Margin
          if (updateData[field].some((l) => l.Margin === undefined || isNaN(l.Margin))) {
            throw createAppError('Margin is required and must be a valid number', 400, 'MISSING_MARGIN');
          }
        }
      }
    });

    // Parse single vatGstDetails
    if (updateData.vatGstDetails) {
      updateData.vatGstDetails = typeof updateData.vatGstDetails === 'string'
        ? parseJsonField(updateData.vatGstDetails, 'vatGstDetails')
        : updateData.vatGstDetails;
      const validStatuses = ['REGISTERED', 'UNREGISTERED', 'EXEMPTED'];
      if (!updateData.vatGstDetails.vatStatus) {
        throw createAppError(
          'VAT status is required for vatGstDetails',
          400,
          'MISSING_VAT_STATUS'
        );
      }
      updateData.vatGstDetails.vatStatus = validStatuses.includes(updateData.vatGstDetails.vatStatus.toUpperCase())
        ? updateData.vatGstDetails.vatStatus.toUpperCase()
        : 'UNREGISTERED';
      if (updateData.vatGstDetails.vatStatus === 'REGISTERED' && !updateData.vatGstDetails.vatNumber) {
        throw createAppError(
          'VAT number is required for REGISTERED status',
          400,
          'MISSING_VAT_NUMBER'
        );
      }
      updateData.vatGstDetails.vatNumber = updateData.vatGstDetails.vatNumber || '';
      updateData.vatGstDetails.documents = updateData.vatGstDetails.documents || [];
    }

    // Handle VAT/GST documents
    if (req.filesByField && updateData.vatGstDetails) {
      const vatDocField = `vatGstDetails[documents][0]`;
      if (req.filesByField[vatDocField]) {
        const vatDocuments = processUploadedFiles(req.filesByField[vatDocField]);
        const replaceVatDocs = updateData.vatGstDetails._replaceDocuments === 'true' || updateData.vatGstDetails._replaceDocuments === true;
        updateData.vatGstDetails.documents = replaceVatDocs ? vatDocuments : [...(updateData.vatGstDetails.documents || []), ...vatDocuments];
        updateData.vatGstDetails._replaceDocuments = undefined;
      }
    }

    // Handle KYC documents
    if (updateData.kycDetails) {
      let parsedKycDetails = [];
      if (Array.isArray(updateData.kycDetails)) {
        parsedKycDetails = updateData.kycDetails.map((kyc, index) => {
          const parsedKyc = typeof kyc === 'string'
            ? parseJsonField(kyc, `kycDetails[${index}]`)
            : kyc['']
            ? parseJsonField(kyc[''], `kycDetails[${index}]`)
            : kyc;
          return {
            ...parsedKyc,
            documents: parsedKyc.documents || [],
          };
        });
      } else {
        const kycFieldPattern = /^kycDetails\[(\d+)\]\[(\w+)\]$/;
        const kycMap = {};
        Object.keys(req.body).forEach((key) => {
          const match = key.match(kycFieldPattern);
          if (match) {
            const index = parseInt(match[1]);
            const field = match[2];
            if (!kycMap[index]) {
              kycMap[index] = {};
            }
            kycMap[index][field] = req.body[key];
          }
        });
        parsedKycDetails = Object.values(kycMap);
      }

      // Process KYC documents with file uploads
      if (req.filesByField) {
        parsedKycDetails = parsedKycDetails.map((kyc, index) => {
          const kycDocField = `kycDetails[${index}][document]`;
          if (req.filesByField[kycDocField]) {
            const file = req.filesByField[kycDocField][0];
            let fileType = null;
            if (file.mimetype.startsWith('image/')) {
              fileType = 'image';
            } else if (file.mimetype === 'application/pdf') {
              fileType = 'pdf';
            } else {
              throw createAppError(
                `Invalid file type for KYC document at index ${index}: ${file.mimetype}`,
                400,
                'INVALID_FILE_TYPE'
              );
            }
            const replaceKycDocs = kyc._replaceDocuments === 'true' || kyc._replaceDocuments === true;
            return {
              ...kyc,
              documents: replaceKycDocs
                ? [{
                    fileName: file.originalname,
                    filePath: file.location || file.path,
                    fileType: fileType,
                    s3Key: file.key || null,
                    uploadedAt: new Date(),
                  }]
                : [
                    ...(kyc.documents || []),
                    {
                      fileName: file.originalname,
                      filePath: file.location || file.path,
                      fileType: fileType,
                      s3Key: file.key || null,
                      uploadedAt: new Date(),
                    },
                  ],
              _replaceDocuments: undefined,
            };
          }
          return kyc;
        });
      }

      // Validate KYC details
      updateData.kycDetails = parsedKycDetails.filter(
        (kyc) => kyc.documentType && kyc.documentNumber
      );
    }

    // Handle employees and their documents
    if (updateData.employees) {
      if (typeof updateData.employees === 'string') {
        updateData.employees = parseJsonField(updateData.employees, 'employees');
      } else if (!Array.isArray(updateData.employees)) {
        const employeeFieldPattern = /^employees\[(\d+)\]\[(\w+)\]$/;
        const employeeMap = {};
        Object.keys(req.body).forEach((key) => {
          const match = key.match(employeeFieldPattern);
          if (match) {
            const index = parseInt(match[1]);
            const field = match[2];
            if (!employeeMap[index]) {
              employeeMap[index] = {};
            }
            employeeMap[index][field] = req.body[key];
          }
        });
        updateData.employees = Object.values(employeeMap);
      }

      // Validate employee emails and process documents
      if (Array.isArray(updateData.employees) && updateData.employees.length > 0) {
        for (let i = 0; i < updateData.employees.length; i++) {
          const employee = updateData.employees[i];
          if (
            employee.email &&
            !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(employee.email)
          ) {
            throw createAppError(
              'Invalid email format in employee',
              400,
              'INVALID_EMAIL_FORMAT'
            );
          }

          const employeeDocField = `employees[${i}][document]`;
          if (req.filesByField && req.filesByField[employeeDocField]) {
            const docFile = req.filesByField[employeeDocField][0];
            let fileType = null;
            if (docFile.mimetype.startsWith('image/')) {
              fileType = 'image';
            } else if (docFile.mimetype === 'application/pdf') {
              fileType = 'pdf';
            } else {
              throw createAppError(
                `Invalid file type for employee document: ${docFile.mimetype}`,
                400,
                'INVALID_FILE_TYPE'
              );
            }
            employee.document = {
              fileName: docFile.originalname,
              filePath: docFile.location || docFile.path,
              fileType: fileType,
              s3Key: docFile.key || null,
              uploadedAt: new Date(),
            };
          }
        }
      }
    }

    // Trim string fields with null/undefined checks
    const stringFields = [
      'accountCode',
      'customerName',
      'title',
      'shortName',
      'parentGroup',
      'remarks',
    ];
    stringFields.forEach((field) => {
      if (updateData[field] && typeof updateData[field] === 'string' && updateData[field] !== 'null' && updateData[field] !== 'undefined') {
        updateData[field] =
          field === 'accountCode'
            ? updateData[field].trim().toUpperCase()
            : updateData[field].trim();
      } else if (updateData[field] === 'null' || updateData[field] === 'undefined') {
        updateData[field] = field === 'title' ? '' : null;
      }
    });

    // Convert boolean fields
    if (updateData.isSupplier !== undefined) {
      updateData.isSupplier = updateData.isSupplier === 'true' || updateData.isSupplier === true;
    }
    if (updateData.favorite !== undefined) {
      updateData.favorite = updateData.favorite === 'true' || updateData.favorite === true;
    }

    // Clean up client-side flags
    delete updateData.replaceVatDocuments;
    delete updateData.replaceKycDocuments;
    delete updateData.removeVatDocuments;
    delete updateData.removeKycDocuments;
    delete updateData.confirmPassword;

    // Call the service to update the trade debtor
    const updatedTradeDebtor = await AccountTypeService.updateTradeDebtor(
      id,
      updateData,
      req.admin.id
    );

    // Calculate uploaded files info
    const filesUploaded = {
      vatDocuments: updateData.vatGstDetails?.documents?.length || 0,
      kycDocuments: updateData.kycDetails?.reduce(
        (sum, kyc) => sum + (kyc.documents?.length || 0),
        0
      ) || 0,
      employeeDocuments: updateData.employees?.filter((emp) => emp.document).length || 0,
      generalDocuments:
        (req.filesByField?.['documents']?.length || 0) +
        (req.filesByField?.['files']?.length || 0) +
        (req.filesByField?.['file']?.length || 0),
      total: (req.files || []).length,
    };

    const response = {
      success: true,
      message: 'Trade debtor updated successfully',
      data: updatedTradeDebtor,
    };

    if (filesUploaded.total > 0) {
      response.filesUploaded = filesUploaded;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error updating trade debtor:', error);

    if (uploadedFiles.length > 0) {
      try {
        await deleteMultipleS3Files(uploadedFiles);
      } catch (cleanupError) {
        console.error('Error during file cleanup:', cleanupError);
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
      sortBy = "createdAt",
      sortOrder = "desc",
      accountType,
    } = req.query;
    console.log("req.query",req.query)
    const trimmedSortBy = sortBy.trim();
    const direction = sortOrder.trim() === "asc" ? 1 : -1;

    let sortArray = [];
    
    if (trimmedSortBy === "favorite") {
      sortArray.push(["favorite", direction]);
    } else {
      sortArray.push(["favorite", -1]);
      sortArray.push([trimmedSortBy, direction]);
    }

    // Handle accountType[] and accountType as array or string
    let accountTypeArray = [];
    if (Array.isArray(accountType)) {
      accountTypeArray = accountType;
    } else if (typeof accountType === 'string' && accountType) {
      accountTypeArray = [accountType];
    }
    // Handle accountType[] from query (e.g., accountType[]=RECEIVABLE&accountType[]=PARABLE)
    if (req.query['accountType[]']) {
      if (Array.isArray(req.query['accountType[]'])) {
        accountTypeArray = accountTypeArray.concat(req.query['accountType[]']);
      } else if (typeof req.query['accountType[]'] === 'string') {
        accountTypeArray.push(req.query['accountType[]']);
      }
    }
    // Remove duplicates
    accountTypeArray = [...new Set(accountTypeArray)];

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search: search.trim(),
      status: status.trim(),
      classification: classification.trim(),
      sort: sortArray,
      accountType: accountTypeArray.length > 0 ? accountTypeArray : undefined,
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



// Delete trade debtor (soft delete)
export const deleteTradeDebtor = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Trade debtor ID is required", 400, "MISSING_ID");
    }
    console.log(id,'---')
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
    console.log(id,'----')
    // console.log(`Processing hard delete request for trade debtor: ${id}`);

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

    // console.log(`Hard delete completed for trade debtor ${id}:`, {
    //   filesTotal: result.filesDeleted?.total || 0,
    //   filesDeleted: result.filesDeleted?.successful || 0,
    //   filesFailed: result.filesDeleted?.failed || 0,
    // });

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
