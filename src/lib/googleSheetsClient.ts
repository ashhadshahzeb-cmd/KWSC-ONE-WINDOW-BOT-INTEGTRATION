/**
 * Direct Frontend -> Google Sheets Sync Client
 * Sends newly created/updated file entries directly to Google Sheets via Apps Script Webhook.
 * Runs 100% in the user's browser with ZERO backend or WhatsApp service dependency.
 */

// Default Webhook URL (can be overridden via VITE_GOOGLE_SHEET_WEBHOOK_URL in .env)
const DEFAULT_WEBHOOK_URL = import.meta.env.VITE_GOOGLE_SHEET_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbxW0yBwsLJvm10uw0PdSApxqxRptHcCoXUy7eQXbZQFYeKw4AfAbBeyaMptPRY7q9em/exec';

export async function syncToGoogleSheetDirectly(record: any): Promise<boolean> {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;

  if (!webhookUrl) {
    // If webhook is not configured yet, silently pass
    return false;
  }

  try {
    const payload = {
      action: 'INSERT',
      timestamp: new Date().toISOString(),
      record: {
        cfo_diary_number: record.cfo_diary_number || '',
        receiving_number: record.receiving_number || '',
        tracking_id: record.tracking_id || '',
        employee_number: record.employee_number || '',
        subject: record.subject || '',
        main_category: record.main_category || '',
        sub_category: record.sub_category || '',
        received_from: record.received_from || record.handover_person_name || '',
        mark_to: record.mark_to || '',
        amount: record.amount ? Number(record.amount) : '',
        inward_date: record.inward_date || '',
        status: record.outward_date ? `Outwarded (${record.outward_date})` : (record.status || 'Active'),
        remarks: record.remarks || '',
        id: record.id || ''
      }
    };

    // Use mode: 'no-cors' so browser security never blocks Google Apps Script redirect
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return true;
  } catch (err) {
    console.warn('[GoogleSheets Direct] Sync warning:', err);
    return false;
  }
}
