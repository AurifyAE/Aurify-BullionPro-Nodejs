import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

// Load environment variables if not already loaded
dotenv.config();

// Initialize S3 client with better error handling
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Validate S3 configuration
const validateS3Config = () => {
  const required = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required S3 environment variables: ${missing.join(', ')}`);
  }
};

export const deleteS3File = async (key) => {
  try {
    if (!key) {
      throw new Error("S3 key is required for deletion");
    }

    // Validate S3 configuration
    validateS3Config();

    console.log(`Attempting to delete S3 file: ${key}`);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });

    const result = await s3Client.send(deleteCommand);
    
    console.log(`Successfully deleted S3 file: ${key}`);
    
    return {
      success: true,
      message: `File deleted successfully: ${key}`,
      key: key,
      result,
    };
  } catch (error) {
    console.error(`Error deleting file from S3 (${key}):`, error);
    return {
      success: false,
      message: `Failed to delete file: ${error.message}`,
      key: key,
      error: error.message,
    };
  }
};

// More efficient batch deletion using DeleteObjectsCommand
export const deleteMultipleS3Files = async (keys) => {
  try {
    if (!Array.isArray(keys) || keys.length === 0) {
      console.log("No S3 keys provided for deletion");
      return {
        success: true,
        message: "No files to delete",
        successful: [],
        failed: [],
      };
    }

    // Filter out empty/null keys
    const validKeys = keys.filter(key => key && typeof key === 'string' && key.trim());
    
    if (validKeys.length === 0) {
      console.log("No valid S3 keys found for deletion");
      return {
        success: true,
        message: "No valid files to delete",
        successful: [],
        failed: [],
      };
    }

    // Validate S3 configuration
    validateS3Config();

    console.log(`Attempting to delete ${validKeys.length} S3 files:`, validKeys);

    // AWS S3 allows max 1000 objects per batch delete request
    const batchSize = 1000;
    const batches = [];
    
    for (let i = 0; i < validKeys.length; i += batchSize) {
      batches.push(validKeys.slice(i, i + batchSize));
    }

    const allResults = [];
    
    for (const batch of batches) {
      try {
        // Use batch delete for better performance
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: false, // Get detailed results
          },
        });

        const result = await s3Client.send(deleteCommand);
        
        // Process successful deletions
        if (result.Deleted) {
          result.Deleted.forEach(deleted => {
            allResults.push({
              success: true,
              key: deleted.Key,
              message: `Successfully deleted: ${deleted.Key}`,
            });
          });
        }

        // Process failed deletions
        if (result.Errors) {
          result.Errors.forEach(error => {
            allResults.push({
              success: false,
              key: error.Key,
              message: `Failed to delete: ${error.Message}`,
              code: error.Code,
            });
          });
        }

      } catch (batchError) {
        console.error(`Error in batch deletion:`, batchError);
        
        // If batch delete fails, try individual deletions
        const individualResults = await Promise.allSettled(
          batch.map(key => deleteS3File(key))
        );

        individualResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allResults.push(result.value);
          } else {
            allResults.push({
              success: false,
              key: batch[index],
              message: `Failed to delete: ${result.reason?.message || 'Unknown error'}`,
              error: result.reason?.message,
            });
          }
        });
      }
    }

    const successful = allResults.filter(result => result.success);
    const failed = allResults.filter(result => !result.success);

    console.log(`S3 Deletion Summary: ${successful.length} successful, ${failed.length} failed`);
    
    if (failed.length > 0) {
      console.error('Failed deletions:', failed);
    }

    return {
      success: failed.length === 0,
      message: `Processed ${validKeys.length} files: ${successful.length} deleted, ${failed.length} failed`,
      total: validKeys.length,
      successful,
      failed,
    };
    
  } catch (error) {
    console.error(`Error in bulk S3 deletion:`, error);
    return {
      success: false,
      message: `Failed to process deletion request: ${error.message}`,
      error: error.message,
      total: Array.isArray(keys) ? keys.length : 0,
      successful: [],
      failed: keys ? keys.map(key => ({
        success: false,
        key,
        message: `Failed to delete: ${error.message}`,
        error: error.message,
      })) : [],
    };
  }
};

// Test S3 connection
export const testS3Connection = async () => {
  try {
    validateS3Config();
    
    // Try to list objects (this will fail if credentials are wrong)
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET,
      MaxKeys: 1,
    });
    
    await s3Client.send(command);
    return { success: true, message: "S3 connection successful" };
  } catch (error) {
    return { success: false, message: `S3 connection failed: ${error.message}` };
  }
};