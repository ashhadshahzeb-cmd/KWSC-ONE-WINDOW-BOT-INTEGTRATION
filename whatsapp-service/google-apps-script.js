// =====================================================================
// KWSC File Tracking - Google Apps Script (Auto Append Rows)
// =====================================================================
// Instructions:
// 1. In your Google Sheet, click: Extensions > Apps Script
// 2. Delete any code in the editor and paste this entire code
// 3. Click "Deploy" > "New deployment"
// 4. Select type: "Web app"
// 5. Execute as: "Me"
// 6. Who has access: "Anyone" (important so webhook can post)
// 7. Click "Deploy" and copy the "Web app URL"
// 8. Put that URL in whatsapp-service/.env as:
//    GOOGLE_SHEET_WEBHOOK_URL="https://script.google.com/macros/s/..."
// =====================================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Create header row if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
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
      ]);
      sheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    
    var row = data.row || [
      new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
      data.record.cfo_diary_number || '',
      data.record.receiving_number || '',
      data.record.tracking_id || '',
      data.record.employee_number || '',
      data.record.subject || '',
      data.record.main_category || '',
      data.record.sub_category || '',
      data.record.received_from || data.record.handover_person_name || '',
      data.record.mark_to || '',
      data.record.amount || '',
      data.record.inward_date || '',
      data.record.status || 'Active',
      data.record.remarks || '',
      data.record.id || ''
    ];
    
    sheet.appendRow(row);
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Row added' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
