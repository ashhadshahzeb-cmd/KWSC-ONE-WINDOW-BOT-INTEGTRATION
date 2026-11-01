import { initGoogleAuth, createNewTrackingSheet, appendRecordToGoogleSheet } from './googleSheetsSync.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function runSetup() {
  console.log('\n======================================================');
  console.log('📊 KWSC File Tracking -> Google Sheets Auto-Sync Setup');
  console.log('======================================================\n');

  // Step 1: Check credentials
  const credsPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || path.resolve(__dirname, 'google-service-account.json');
  console.log(`Checking for Service Account JSON at:\n👉 ${credsPath}`);

  if (!fs.existsSync(credsPath)) {
    console.error('\n❌ Service Account file not found!');
    console.log('\n📝 How to get this file:');
    console.log('1. Go to Google Cloud Console (https://console.cloud.google.com)');
    console.log('2. Enable "Google Sheets API" and "Google Drive API"');
    console.log('3. Create a Service Account, download the JSON Key');
    console.log(`4. Save it as: "${credsPath}"\n`);
    process.exit(1);
  }

  const auth = initGoogleAuth();
  if (!auth.success) {
    console.error('❌ Google Auth Error:', auth.error);
    process.exit(1);
  }

  console.log(`✅ Authenticated with Google as: ${auth.clientEmail}`);

  // Step 2: Check if existing spreadsheet ID is provided or create new
  let spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (spreadsheetId) {
    console.log(`\n📄 Existing Spreadsheet ID provided in .env: ${spreadsheetId}`);
    console.log(`👉 https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } else {
    console.log('\n✨ No GOOGLE_SPREADSHEET_ID specified. Creating a new Google Sheet automatically...');
    try {
      const created = await createNewTrackingSheet('KWSC File Tracking - Live Entries');
      spreadsheetId = created.spreadsheetId;
      console.log(`\n🎉 New Google Sheet Created Successfully!`);
      console.log(`📌 Spreadsheet ID: ${spreadsheetId}`);
      console.log(`🔗 Spreadsheet URL: ${created.spreadsheetUrl}`);

      // Append to .env
      const envPath = path.resolve(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (!envContent.includes('GOOGLE_SPREADSHEET_ID=')) {
          envContent += `\nGOOGLE_SPREADSHEET_ID="${spreadsheetId}"\n`;
          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log(`💾 Saved GOOGLE_SPREADSHEET_ID to ${envPath}`);
        }
      }
    } catch (e) {
      console.error('❌ Failed to create Google Sheet:', e.message);
      process.exit(1);
    }
  }

  // Step 3: Insert a test record
  console.log('\n🧪 Testing live row insertion...');
  const testRecord = {
    cfo_diary_number: 'TEST-DIARY-001',
    receiving_number: 'REC-9999',
    tracking_id: 'TRK-TEST',
    employee_number: '023590-0',
    subject: 'System Test - Google Sheets Sync Verification',
    main_category: 'contractor',
    sub_category: 'General',
    received_from: 'Admin System',
    mark_to: 'cfo',
    amount: 125000,
    inward_date: new Date().toISOString().split('T')[0],
    status: 'Test Verified',
    remarks: 'Auto-sync connection test successful.'
  };

  const appendRes = await appendRecordToGoogleSheet(testRecord, spreadsheetId);
  if (appendRes.success) {
    console.log('✅ Test record appended to Google Sheet successfully!');
    console.log(`🔗 Open your sheet to see the data: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } else {
    console.error('❌ Failed to append test record:', appendRes.error);
  }

  console.log('\n======================================================');
  console.log('✨ Setup Complete! Live entries will now sync automatically.');
  console.log('======================================================\n');
}

runSetup().catch(console.error);
