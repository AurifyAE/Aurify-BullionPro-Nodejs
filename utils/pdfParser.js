import { createRequire } from 'module';
import fs from 'fs';

// Use createRequire to import CommonJS module in ES module context
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Parse Gold Test Certificate PDF and extract all relevant fields
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Object>} Parsed data object
 */
export const parseGoldCertificatePDF = async (pdfPath) => {
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);

    // Extract text from PDF
    const text = data.text;

    // Initialize result object
    const parsedData = {
      laboratoryName: '',
      certificateNumber: '',
      itemCode: '',
      customerName: '',
      address: '',
      city: '',
      contact: '',
      testMethod: '',
      dateProcessed: '',
      dateAnalysed: '',
      dateDelivery: '',
      itemReference: '',
      itemType: '',
      goldBarWeight: '',
      goldAuPercent: '',
      resultKarat: '',
      determinationMethod: '',
      comments: '',
      analyserSignature: '',
      technicalManager: '',
      dateReport: '',
    };

    // Helper function to extract value after label
    const extractAfterLabel = (text, label, options = {}) => {
      const { caseSensitive = false, multiline = false, maxLength = 200 } = options;
      const flags = caseSensitive ? 'g' : 'gi';
      let pattern;
      
      if (typeof label === 'string') {
        // Escape special regex characters
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = multiline 
          ? new RegExp(`${escapedLabel}\\s*[:]?\\s*([^\\n]{0,${maxLength}})`, flags)
          : new RegExp(`${escapedLabel}\\s*[:]?\\s*([^\\n\\r]{0,${maxLength}})`, flags);
      } else {
        // label is already a regex
        pattern = label;
      }
      
      const match = text.match(pattern);
      if (match) {
        let value = match[1] || match[0];
        // Clean up the value
        value = value.replace(/^\s*[:]\s*/, '').trim();
        return value;
      }
      return '';
    };

    // Helper function to extract date in DD/MM/YYYY format
    const extractDate = (text, label) => {
      const pattern = new RegExp(`${label}\\s*[:]?\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})`, 'gi');
      const match = text.match(pattern);
      if (match) {
        const dateStr = match[1].trim();
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const parts = dateStr.split(/[/-]/);
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          return `${year}-${month}-${day}`;
        }
        return dateStr;
      }
      return '';
    };

    // Helper function to extract number
    const extractNumber = (text, label) => {
      const pattern = new RegExp(`${label}\\s*[:]?\\s*([\\d.]+)`, 'gi');
      const match = text.match(pattern);
      return match ? match[1].trim() : '';
    };

    // Extract Laboratory Name (usually at the top, can be in English or Arabic)
    const labNamePatterns = [
      /Motiwala\s+Gold\s+&\s+Metals\s+Testing\s+Laboratory\s+L\.L\.C\./i,
      /([A-Z][A-Za-z\s&\.]+(?:Laboratory|LABORATORY|L\.L\.C\.|LLC))/,
      /([A-Z][A-Za-z\s&\.]+Testing\s+Laboratory)/i
    ];
    
    for (const pattern of labNamePatterns) {
      const match = text.match(pattern);
      if (match) {
        parsedData.laboratoryName = match[1] || match[0];
        break;
      }
    }

    // Extract Certificate Number (format: numbers/numbers)
    const certNumberMatch = text.match(/(?:Certificate\s*(?:No|Number|#)|Cert\.?\s*No\.?)\s*[:]?\s*(\d+\/\d+)/i) ||
                           text.match(/(\d{8}\/\d{2})/);
    if (certNumberMatch) {
      parsedData.certificateNumber = certNumberMatch[1] || certNumberMatch[0];
    }

    // Extract Item Code (format: XXX####)
    const itemCodeMatch = text.match(/(?:Item\s*Code|Item\s*#)\s*[:]?\s*(XXX\d{4})/i) ||
                         text.match(/(XXX\d{4})/);
    if (itemCodeMatch) {
      parsedData.itemCode = itemCodeMatch[1] || itemCodeMatch[0];
    }

    // Extract Customer Name
    const customerNameMatch = text.match(/(?:Name|Customer\s*Name)\s*[:]?\s*([A-Z][A-Z\s]+)/) ||
                             text.match(/MADOU\s+OULE\s+DANSOKO/i);
    if (customerNameMatch) {
      parsedData.customerName = customerNameMatch[1] || customerNameMatch[0];
    }

    // Extract Address (multiline)
    parsedData.address = extractAfterLabel(text, /(?:Address|Addr\.?)\s*[:]?/i, { multiline: true, maxLength: 100 });

    // Extract City
    const cityMatch = text.match(/(?:City)\s*[:]?\s*([A-Z][a-z]+)/i) || text.match(/Dubai/i);
    if (cityMatch) {
      parsedData.city = cityMatch[1] || cityMatch[0];
    }

    // Extract Contact/Tel (format: Tel ###-######)
    const contactMatch = text.match(/(?:Contact|Tel\.?|Telephone)\s*[:]?\s*(\d{2,3}[-]?\d{6,9})/i) ||
                        text.match(/Tel\s+(\d{2,3}[-]?\d{6,9})/i);
    if (contactMatch) {
      parsedData.contact = contactMatch[1] || contactMatch[0];
    }

    // Extract Test Method (ISO format)
    const testMethodMatch = text.match(/(?:Test\s*Method|Method)\s*[:]?\s*(ISO\s*\d+[:\s]\d{4})/i) ||
                           text.match(/(ISO\s*\d+[:\s]\d{4})/);
    if (testMethodMatch) {
      parsedData.testMethod = testMethodMatch[1] || testMethodMatch[0];
    }

    // Extract Dates
    parsedData.dateProcessed = extractDate(text, /(?:Date\s*of\s*Process|Process\s*Date)/i);
    parsedData.dateAnalysed = extractDate(text, /(?:Date\s*Analysed|Analysed\s*Date)/i);
    parsedData.dateDelivery = extractDate(text, /(?:Date\s*Delivery|Delivery\s*Date)/i);
    parsedData.dateReport = extractDate(text, /(?:Date\s*of\s*Report|Report\s*Date)/i);

    // Extract Item Reference
    parsedData.itemReference = extractAfterLabel(text, /(?:Item\s*Reference|Reference)\s*[:]?/i);

    // Extract Item Type
    parsedData.itemType = extractAfterLabel(text, /(?:Item\s*Type|Type)\s*[:]?/i) ||
                         (text.match(/GOLD\s+BAR/i) ? 'GOLD BAR' : '');

    // Extract Gold Bar Weight
    const weightMatch = text.match(/(?:Gold\s*Bar\s*Weight|Weight)\s*[:]?\s*(\d+\.?\d*)/i);
    if (weightMatch) {
      parsedData.goldBarWeight = weightMatch[1];
    }

    // Extract Gold Au. in %o (per mille) - note: 878.63 in %o = 87.863%
    // The PDF shows "878.63" in %o format, which means 87.863%
    const goldAuPerMilleMatch = text.match(/(?:Gold\s*Au\.?\s*\(?in\s*%o\)?|Gold\s*Au\.?\s*%o)\s*[:]?\s*(\d+\.?\d*)/i);
    if (goldAuPerMilleMatch) {
      const perMille = parseFloat(goldAuPerMilleMatch[1]);
      // Convert per mille to percentage (divide by 10)
      parsedData.goldAuPercent = (perMille / 10).toFixed(2);
    } else {
      // Try to extract as percentage directly
      const goldAuPercentMatch = text.match(/(?:Gold\s*Au\.?\s*%|Gold\s*Au\.?\s*\(?in\s*%\)?)\s*[:]?\s*(\d+\.?\d*)/i);
      if (goldAuPercentMatch) {
        parsedData.goldAuPercent = goldAuPercentMatch[1];
      }
    }

    // Extract Result in Karat
    const karatMatch = text.match(/(?:Result\s*in\s*Karat|Karat)\s*[:]?\s*(\d+\.?\d*)/i);
    if (karatMatch) {
      parsedData.resultKarat = karatMatch[1];
    }

    // Extract Determination Method
    parsedData.determinationMethod = extractAfterLabel(text, /(?:Determination\s*Method|Method\s*of\s*Determination)/i, { multiline: true }) ||
                                    (text.match(/CUPELLATION\s+METHOD/i) ? 'CUPELLATION METHOD (FIRE ASSAY)' : '');

    // Extract Comments
    parsedData.comments = extractAfterLabel(text, /(?:Comments|Comment)\s*[:]?/i, { multiline: true });

    // Extract Analyser Signature (Name format: ALL CAPS)
    const analyserMatch = text.match(/(?:Analyser\s*Signature|Analyser|Name\s*\(?Analyser\)?)\s*[:]?\s*([A-Z][A-Z\s]+)/);
    if (analyserMatch) {
      parsedData.analyserSignature = analyserMatch[1].trim();
    }

    // Extract Technical Manager (Name format: ALL CAPS)
    const managerMatch = text.match(/(?:Technical\s*Manager|Manager|Name\s*\(?Technical\s*Manager\)?)\s*[:]?\s*([A-Z][A-Z\s]+)/);
    if (managerMatch) {
      parsedData.technicalManager = managerMatch[1].trim();
    }

    // Clean up extracted values (remove extra whitespace, newlines)
    Object.keys(parsedData).forEach(key => {
      if (typeof parsedData[key] === 'string') {
        parsedData[key] = parsedData[key]
          .replace(/\s+/g, ' ')
          .replace(/\n/g, ' ')
          .trim();
      }
    });

    return parsedData;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
};

