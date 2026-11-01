import { recordToSheetRow } from './googleSheetsSync.js';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !SPREADSHEET_ID) {
  console.error('❌ Missing configuration in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncAll() {
  console.log('\n======================================================');
  console.log('🔄 Bulk Syncing Remaining Records to Google Sheets');
  console.log('======================================================\n');

  // Initialize Google Sheets API
  const credsPath = path.resolve(__dirname, 'google-service-account.json');
  const auth = new google.auth.GoogleAuth({
    keyFile: credsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Step 1: Read all existing Record IDs from Column O in Google Sheet
  console.log('🔍 Reading existing records from Google Sheet to prevent duplicates...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'O:O'
  });

  const existingIds = new Set();
  if (res.data.values) {
    res.data.values.forEach(row => {
      if (row[0] && row[0] !== 'Record ID') {
        existingIds.add(row[0].trim());
      }
    });
  }
  console.log(`✅ Found ${existingIds.size.toLocaleString()} records already in Google Sheet.`);

  // Step 2: Total count in Supabase
  const { count: totalCount } = await supabase
    .from('file_tracking_records')
    .select('*', { count: 'exact', head: true });

  console.log(`📦 Total in Database: ${totalCount.toLocaleString()}`);
  const remaining = totalCount - existingIds.size;
  console.log(`🎯 Remaining to sync: ${remaining.toLocaleString()}\n`);

  if (remaining <= 0) {
    console.log('🎉 All records are already synced to Google Sheets!');
    return;
  }

  // Step 3: Fetch in pages of 1,000 using light queries
  const PAGE_SIZE = 1000;
  let offset = 0;
  let newSynced = 0;
  const startTime = Date.now();

  while (offset < totalCount) {
    const { data: records, error } = await supabase
      .from('file_tracking_records')
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.warn(`⚠️ Fetch issue at offset ${offset}: ${error.message}. Retrying with smaller slice...`);
      // Retry with 300
      const { data: retryRecs, error: retryErr } = await supabase
        .from('file_tracking_records')
        .select('*')
        .range(offset, offset + 300 - 1);

      if (retryErr) {
        console.error(`❌ Could not fetch offset ${offset}:`, retryErr.message);
        offset += 300;
        continue;
      }
      offset += 300;
      processRecords(retryRecs);
      continue;
    }

    offset += PAGE_SIZE;
    if (!records || records.length === 0) break;

    await processRecords(records);

    const totalInSheet = existingIds.size;
    const percent = Math.min(100, Math.round((totalInSheet / totalCount) * 100));
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r📊 Total In Sheet: ${totalInSheet.toLocaleString()} / ${totalCount.toLocaleString()} (${percent}%) | Synced this run: +${newSynced.toLocaleString()} | Time: ${elapsedSec}s`);
  }

  async function processRecords(recs) {
    // Only take records that are NOT already in the sheet
    const toInsert = [];
    for (const r of recs) {
      if (r.id && !existingIds.has(r.id)) {
        toInsert.push(recordToSheetRow(r));
        existingIds.add(r.id);
      }
    }

    if (toInsert.length === 0) return;

    // Append in chunks of 500
    const CHUNK = 500;
    for (let c = 0; c < toInsert.length; c += CHUNK) {
      const slice = toInsert.slice(c, c + CHUNK);
      let attempts = 0;
      let ok = false;
      while (attempts < 3 && !ok) {
        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:O',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: slice }
          });
          ok = true;
          newSynced += slice.length;
        } catch (e) {
          attempts++;
          await new Promise(res => setTimeout(res, 2000 * attempts));
        }
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n🎉 Sync Finished!`);
  console.log(`✅ Total Records in Google Sheet: ${existingIds.size.toLocaleString()}`);
  console.log(`⚡ Session Time: ${totalTime} seconds`);
  console.log(`🔗 Open Sheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}\n`);
}

syncAll().catch(console.error);
