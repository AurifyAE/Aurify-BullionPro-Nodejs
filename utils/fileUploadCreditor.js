import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import dotenv from "dotenv";
import ffmpeg from 'fluent-ffmpeg';
dotenv.config();

// Initialize the S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Process image using Sharp
const processImage = async (buffer) => {
  return sharp(buffer)
    .resize({ width: 800 })
    .toFormat('webp', { quality: 50 })
    .toBuffer();
};

// Process video using ffmpeg
const processVideo = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .size('?x720')
      .videoBitrate('1000k')
      .fps(30)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
};

// Determine file type and extension
const getFileTypeAndExt = (file) => {
  const mimeType = file.mimetype.split('/')[0];
  const extension = file.originalname.split('.').pop().toLowerCase();
  return { mimeType, extension };
};

// Enhanced file filter function
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
  const allowedVideoTypes = ['mp4', 'mov', 'avi', 'mkv'];
  const allowedDocumentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
  
  const { mimeType, extension } = getFileTypeAndExt(file);

  if ((mimeType === 'image' && allowedImageTypes.includes(extension)) ||
      (mimeType === 'video' && allowedVideoTypes.includes(extension)) ||
      (mimeType === 'application' && allowedDocumentTypes.includes(extension)) ||
      (extension === 'pdf') ||
      (extension === 'txt' && mimeType === 'text')) {
    return cb(null, true);
  }
  cb(new Error('Error: Only images (jpeg, jpg, png, gif, webp), videos (mp4, mov, avi, mkv), and documents (pdf, doc, docx, xls, xlsx, txt) are allowed!'));
};

// Generate output filename with folder organization
const generateOutputFilename = (file) => {
  const { mimeType, extension } = getFileTypeAndExt(file);
  const timestamp = Date.now().toString();
  const basename = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
  
  let folder = '';
  let filename = '';
  
  if (mimeType === 'image') {
    folder = 'images/';
    filename = `${timestamp}-${basename}.webp`;
  } else if (mimeType === 'video') {
    folder = 'videos/';
    filename = `${timestamp}-${basename}.mp4`;
  } else {
    folder = 'documents/';
    filename = `${timestamp}-${basename}.${extension}`;
  }
  
  return { folder, filename, fullPath: folder + filename };
};

// S3 storage configuration
const s3Storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET,
  metadata: (req, file, cb) => {
    cb(null, { 
      fieldName: file.fieldname,
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
      fileType: getFileTypeAndExt(file).mimeType
    });
  },
  key: (req, file, cb) => {
    const { fullPath } = generateOutputFilename(file);
    cb(null, fullPath);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

// Local storage configuration
const createLocalStorage = () => {
  const baseDir = path.join(process.cwd(), 'public', 'uploads');
  const dirs = ['images', 'videos', 'documents'];
  
  dirs.forEach(dir => {
    const fullPath = path.join(baseDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  return multer.diskStorage({
    destination: (req, file, cb) => {
      const { folder } = generateOutputFilename(file);
      const destPath = path.join(baseDir, folder);
      cb(null, destPath);
    },
    filename: (req, file, cb) => {
      const { filename } = generateOutputFilename(file);
      cb(null, filename);
    }
  });
};

// Process file based on type
const processFile = async (file) => {
  const { mimeType } = getFileTypeAndExt(file);
  
  if (mimeType === 'image') {
    const buffer = await fs.promises.readFile(file.path);
    const processedBuffer = await processImage(buffer);
    await fs.promises.writeFile(file.path, processedBuffer);
  } else if (mimeType === 'video') {
    const tempPath = `${file.path}.temp`;
    await fs.promises.rename(file.path, tempPath);
    await processVideo(tempPath, file.path);
    await fs.promises.unlink(tempPath);
  }
  // Documents are not processed, just stored as-is
};

// NEW: Multi-field upload handler for Trade Creditors
export const tradeCreditorUploadHandler = (options = {}) => {
  const {
    useLocalStorage = false,
    maxFileSize = 50 * 1024 * 1024 // 50MB default
  } = options;

  // Create upload instance based on storage type
  const uploadInstance = useLocalStorage 
    ? multer({
        storage: createLocalStorage(),
        limits: { fileSize: maxFileSize },
        fileFilter: fileFilter
      })
    : multer({
        storage: s3Storage,
        limits: { fileSize: maxFileSize },
        fileFilter: fileFilter
      });

  // Define all possible field configurations
  const fieldsConfig = [
    { name: 'vatGstDetails.documents', maxCount: 10 },
    { name: 'kycDetails.documents', maxCount: 10 },
    { name: 'documents', maxCount: 20 },
    { name: 'files', maxCount: 20 },
    { name: 'file', maxCount: 20 }
  ];

  // Return middleware function
  return (req, res, next) => {
    const uploadMiddleware = uploadInstance.fields(fieldsConfig);

    uploadMiddleware(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return next(err);
      }

      // Flatten all files into a single array for easier processing
      const allFiles = [];
      const filesByField = {};

      if (req.files) {
        Object.keys(req.files).forEach(fieldName => {
          const files = req.files[fieldName];
          filesByField[fieldName] = files;
          
          files.forEach(file => {
            allFiles.push({
              ...file,
              fieldName, // Add field name for identification
              category: getFileCategoryFromFieldName(fieldName)
            });
          });
        });
      }

      // Process files if using local storage
      if (useLocalStorage && allFiles.length > 0) {
        try {
          for (const file of allFiles) {
            await processFile(file);
          }
        } catch (error) {
          console.error('File processing error:', error);
          return next(error);
        }
      }

      // Add processed file info to request
      req.files = allFiles; // Flattened array
      req.filesByField = filesByField; // Organized by field name
      req.filesInfo = allFiles.map(file => ({
        type: getFileTypeAndExt(file).mimeType,
        originalName: file.originalname,
        filename: useLocalStorage ? file.filename : file.key,
        path: useLocalStorage ? file.path : file.location,
        size: file.size,
        fieldName: file.fieldName,
        category: file.category
      }));

      console.log('Files processed:', {
        totalFiles: allFiles.length,
        fieldNames: Object.keys(filesByField),
        categories: [...new Set(allFiles.map(f => f.category))]
      });

      next();
    });
  };
};

// Helper function to categorize files based on field name
const getFileCategoryFromFieldName = (fieldName) => {
  if (fieldName.includes('vat') || fieldName.includes('Vat')) return 'vat';
  if (fieldName.includes('kyc') || fieldName.includes('Kyc')) return 'kyc';
  return 'general';
};

// Universal upload handler - handles any file type dynamically (keeping for backward compatibility)
export const uploadHandler = (options = {}) => {
  const {
    fieldName = 'file',
    maxCount = 1,
    useLocalStorage = false,
    maxFileSize = 50 * 1024 * 1024 // 50MB default
  } = options;

  // Create upload instance based on storage type
  const uploadInstance = useLocalStorage 
    ? multer({
        storage: createLocalStorage(),
        limits: { fileSize: maxFileSize },
        fileFilter: fileFilter
      })
    : multer({
        storage: s3Storage,
        limits: { fileSize: maxFileSize },
        fileFilter: fileFilter
      });

  // Return middleware function
  return (req, res, next) => {
    const uploadMiddleware = maxCount === 1 
      ? uploadInstance.single(fieldName)
      : uploadInstance.array(fieldName, maxCount);

    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      // Handle single file
      if (req.file && useLocalStorage) {
        try {
          await processFile(req.file);
          // Add file info to request for easy access
          req.fileInfo = {
            type: getFileTypeAndExt(req.file).mimeType,
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
          };
        } catch (error) {
          return next(error);
        }
      }

      // Handle multiple files
      if (req.files && req.files.length > 0 && useLocalStorage) {
        try {
          req.filesInfo = [];
          for (const file of req.files) {
            await processFile(file);
            req.filesInfo.push({
              type: getFileTypeAndExt(file).mimeType,
              originalName: file.originalname,
              filename: file.filename,
              path: file.path,
              size: file.size
            });
          }
        } catch (error) {
          return next(error);
        }
      }

      // For S3 uploads, add file info
      if (req.file && !useLocalStorage) {
        req.fileInfo = {
          type: getFileTypeAndExt(req.file).mimeType,
          originalName: req.file.originalname,
          filename: req.file.key,
          location: req.file.location,
          size: req.file.size
        };
      }

      if (req.files && req.files.length > 0 && !useLocalStorage) {
        req.filesInfo = req.files.map(file => ({
          type: getFileTypeAndExt(file).mimeType,
          originalName: file.originalname,
          filename: file.key,
          location: file.location,
          size: file.size
        }));
      }

      next();
    });
  };
};

// Convenience exports for backward compatibility
export const uploadSingle = (fieldName, useLocalStorage = false) => {
  return uploadHandler({ fieldName, maxCount: 1, useLocalStorage });
};

export const uploadMultiple = (fieldName, maxCount, useLocalStorage = false) => {
  return uploadHandler({ fieldName, maxCount, useLocalStorage });
};