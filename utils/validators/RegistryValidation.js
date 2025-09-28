import { body, param, query, validationResult } from 'express-validator';
import { createAppError } from '../errorHandler.js';
import mongoose from 'mongoose';

// Validation result handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    throw createAppError(errorMessages.join(', '), 400, 'VALIDATION_ERROR');
  }
  next();
};

// Validate ObjectId
export const validateObjectId = (field) => [
  param(field)
    .isMongoId()
    .withMessage(`${field} must be a valid MongoDB ObjectId`),
  handleValidationErrors
];

// Validate pagination parameters
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// Validate date range
export const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((endDate, { req }) => {
      if (req.query.startDate && endDate) {
        const start = new Date(req.query.startDate);
        const end = new Date(endDate);
        if (end <= start) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),
  handleValidationErrors
];

// Validate registry creation
export const validateRegistryCreate = [
  body('costCenter')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Cost center must be 1-20 characters long'),
  
  body('type')
    .notEmpty()
    .withMessage('Transaction type is required')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Type must be 1-50 characters long'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Description must be 1-500 characters long'),
  
  body('value')
    .notEmpty()
    .withMessage('Transaction value is required')
    .isNumeric()
    .withMessage('Value must be a number')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Value cannot be negative');
      }
      return true;
    }),
  
  body('debit')
    .optional()
    .isNumeric()
    .withMessage('Debit must be a number')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Debit cannot be negative');
      }
      return true;
    }),
  
  body('credit')
    .optional()
    .isNumeric()
    .withMessage('Credit must be a number')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Credit cannot be negative');
      }
      return true;
    })
    .custom((credit, { req }) => {
      const debit = req.body.debit || 0;
      if (debit > 0 && credit > 0) {
        throw new Error('Transaction cannot have both debit and credit amounts');
      }
      return true;
    }),
  
  body('transactionDate')
    .optional()
    .isISO8601()
    .withMessage('Transaction date must be a valid ISO 8601 date'),
  
  body('reference')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference cannot exceed 100 characters'),
  
  body('status')
    .optional()
    .isIn(['pending', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, completed, cancelled'),
  
  handleValidationErrors
];

// Validate registry update
export const validateRegistryUpdate = [
  body('costCenter')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Cost center must be 1-20 characters long'),
  
  body('type')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Type must be 1-50 characters long'),
  
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Description must be 1-500 characters long'),
  
  body('value')
    .optional()
    .isNumeric()
    .withMessage('Value must be a number')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Value cannot be negative');
      }
      return true;
    }),
  
  body('debit')
    .optional()
    .isNumeric()
    .withMessage('Debit must be a number')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Debit cannot be negative');
      }
      return true;
    }),
  
  body('credit')
    .optional()
    .isNumeric()
    .withMessage('Credit must be a number')
    .custom((value) => {
      if (value < 0) {
        throw new Error('Credit cannot be negative');
      }
      return true;
    })
    .custom((credit, { req }) => {
      const debit = req.body.debit || 0;
      if (debit > 0 && credit > 0) {
        throw new Error('Transaction cannot have both debit and credit amounts');
      }
      return true;
    }),
  
  body('transactionDate')
    .optional()
    .isISO8601()
    .withMessage('Transaction date must be a valid ISO 8601 date'),
  
  body('reference')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference cannot exceed 100 characters'),
  
  body('status')
    .optional()
    .isIn(['pending', 'completed', 'cancelled'])
    .withMessage('Status must be one of: pending, completed, cancelled'),
  
  handleValidationErrors
];

// Validate required fields
export const validateRequiredFields = (fields) => [
  ...fields.map(field => 
    body(field)
      .notEmpty()
      .withMessage(`${field} is required`)
  ),
  handleValidationErrors
];

// Validate enum values
export const validateEnum = (field, allowedValues) => [
  body(field)
    .isIn(allowedValues)
    .withMessage(`${field} must be one of: ${allowedValues.join(', ')}`),
  handleValidationErrors
];

// Validate search parameters
export const validateSearch = [
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be 1-100 characters long'),
  
  query('type')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Type filter must be 1-50 characters long'),
  
  query('costCenter')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Cost center filter must be 1-20 characters long'),
  
  query('status')
    .optional()
    .isIn(['pending', 'completed', 'cancelled'])
    .withMessage('Status filter must be one of: pending, completed, cancelled'),
  
  query('sortBy')
    .optional()
    .isIn(['transactionDate', 'transactionId', 'type', 'value', 'debit', 'credit', 'createdAt'])
    .withMessage('Sort by must be one of: transactionDate, transactionId, type, value, debit, credit, createdAt'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),
  
  handleValidationErrors
];