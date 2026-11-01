import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration & Defaults
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CREDS_PATH = path.resolve(__dirname, 'google-service-account.json');
let cachedSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || null;
let sheetsClient = null;
let driveClient = null;

export const SHEET_HEADERS = [
  'Timestamp (PKT)',
  'CFO Diary No',
  'Receiving No',
  'Tracking ID',
  'Employee No',
  'Subject',
  'Main Category',
  'Sub Category',
  'Received From / Handover',
  'Current Section (Mark To)',
  'Amount (PKR)',
  'Inward Date',
  'Status',
  'Remarks',
  'Record ID'
];

/**
 * Format date in Pakistan Standard Time (PKT)
 */
function getPktDateTime(dateVal = null) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Convert a file_tracking_records row into a Google Sheets row array
 */
export function recordToSheetRow(record) {
  return [
    getPktDateTime(record.created_at || record.inward_date),
    record.cfo_diary_number || '',
    record.receiving_number || '',
    record.tracking_id || '',
    record.employee_number || '',
    record.subject || '',
    record.main_category || '',
    record.sub_category || '',
    record.received_from || record.handover_person_name || '',
    record.mark_to || '',
    record.amount ? Number(record.amount) : '',
    record.inward_date || '',
    record.outward_date ? `Outwarded (${record.outward_date})` : (record.status || 'Active'),
    record.remarks || '',
    record.id || ''
  ];
}

/**
 * Initialize Google Sheets & Drive API Clients using Service Account JSON
 */
export function initGoogleAuth() {
  const credsPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || DEFAULT_CREDS_PATH;

  if (!fs.existsSync(credsPath)) {
    return {
      success: false,
      error: `Service account credentials not found at: ${credsPath}`
    };
  }

  try {
    const credsRaw = fs.readFileSync(credsPath, 'utf8');
    const credentials = JSON.parse(credsRaw);

    const auth = new google.auth.GoogleAuth({
      keyFile: credsPath,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    driveClient = google.drive({ version: 'v3', auth });

    console.log(`📊 Google Sheets API initialized successfully with client email: ${credentials.client_email}`);
    return { success: true, clientEmail: credentials.client_email };
  } catch (err) {
    console.error('❌ Failed to initialize Google Auth:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Automatically create a new Google Sheet if none is configured
 */
export async function createNewTrackingSheet(title = 'KWSC File Tracking Records (Auto-Sync)') {
  if (!sheetsClient || !driveClient) {
    const authRes = initGoogleAuth();
    if (!authRes.success) throw new Error(authRes.error);
  }

  try {
    const resource = {
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: 'File Entries',
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    };

    const spreadsheet = await sheetsClient.spreadsheets.create({
      resource,
      fields: 'spreadsheetId,spreadsheetUrl',
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    const spreadsheetUrl = spreadsheet.data.spreadsheetUrl;

    console.log(`✅ New Google Sheet created! URL: ${spreadsheetUrl}`);

    // Insert Header Row
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `'File Entries'!A1:O1`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [SHEET_HEADERS]
      }
    });

    // Make the sheet accessible so you can open and edit it directly
    try {
      if (driveClient) {
        await driveClient.permissions.create({
          fileId: spreadsheetId,
          requestBody: {
            role: 'writer',
            type: 'anyone',
          },
        });
        console.log(`🔓 Google Sheet permissions updated: Anyone with the link can view/edit.`);
      }
    } catch (permErr) {
      console.warn('⚠️ Note: Could not set link permission automatically. You can share with your Google account.');
    }

    cachedSpreadsheetId = spreadsheetId;
    return { spreadsheetId, spreadsheetUrl };
  } catch (err) {
    console.error('❌ Error creating Google Spreadsheet:', err.message);
    throw err;
  }
}

/**
 * Append a newly registered file record to Google Sheets
 */
export async function appendRecordToGoogleSheet(record, customSpreadsheetId = null) {
  const spreadsheetId = customSpreadsheetId || cachedSpreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;

  // Webhook fallback (Alternative: Google Apps Script Webhook)
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (webhookUrl && !spreadsheetId && !fs.existsSync(DEFAULT_CREDS_PATH)) {
    try {
      const rowData = recordToSheetRow(record);
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'INSERT', record, row: rowData })
      });
      console.log(`📊 Record forwarded to Google Sheet Webhook: ${record.cfo_diary_number || record.receiving_number}`);
      return { success: true, method: 'webhook' };
    } catch (whErr) {
      console.warn('⚠️ Webhook sync failed:', whErr.message);
    }
  }

  if (!sheetsClient) {
    const authRes = initGoogleAuth();
    if (!authRes.success) {
      return { success: false, error: authRes.error };
    }
  }

  if (!spreadsheetId) {
    return {
      success: false,
      error: 'No GOOGLE_SPREADSHEET_ID set and auto-create not triggered yet.'
    };
  }

  try {
    const rowValues = recordToSheetRow(record);

    const response = await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `'File Entries'!A:O`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [rowValues]
      }
    });

    console.log(`📊 Google Sheet row appended for: ${record.cfo_diary_number || record.receiving_number} (Updated Range: ${response.data.updates?.updatedRange})`);
    return { success: true, updatedRange: response.data.updates?.updatedRange };
  } catch (err) {
    // If 'File Entries' tab doesn't exist, try default sheet
    if (err.message && err.message.includes('File Entries')) {
      try {
        const response = await sheetsClient.spreadsheets.values.append({
          spreadsheetId,
          range: `A:O`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: [recordToSheetRow(record)]
          }
        });
        console.log(`📊 Google Sheet row appended to default tab: ${record.cfo_diary_number || record.receiving_number}`);
        return { success: true };
      } catch (innerErr) {
        console.error('❌ Google Sheet append error (default tab):', innerErr.message);
        return { success: false, error: innerErr.message };
      }
    }
    console.error('❌ Failed to append record to Google Sheet:', err.message);
    return { success: false, error: err.message };
  }
}
