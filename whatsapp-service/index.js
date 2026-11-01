import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http'; // Render Web Service Port Binding
import { appendRecordToGoogleSheet } from './googleSheetsSync.js';

dotenv.config();

// Dummy server for Render & UptimeRobot
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('WhatsApp Bot is running!');
}).listen(PORT, () => console.log(`🌐 Dummy Web Server running on port ${PORT}`));

// ─── Helper: Convert base64 data URI to MessageMedia via temp file ───────────
async function base64ToMedia(dataUri) {
    const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
    if (!match) throw new Error('Invalid base64 data URI');
    const [, mime, b64] = match;
    const ext = mime.split('/')[1]?.split('+')[0] || 'jpg';
    const tmpFile = path.join(os.tmpdir(), `kwsc_doc_${Date.now()}.${ext}`);
    fs.writeFileSync(tmpFile, Buffer.from(b64, 'base64'));
    const media = MessageMedia.fromFilePath(tmpFile);
    // cleanup after 30 seconds
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch (_) {} }, 30000);
    return media;
}


// ─────────────────────────────────────────────────────────────────────────────
// Configuration & Constants
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// In-Memory Dynamic Configurations (Synced with Supabase app_config)
let activeTargetNumbers = (process.env.TARGET_PHONE_NUMBERS || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);

let activeAllowedSections = ['cia', 'budget', 'establishment'];
let activeAllowedCategories = ['contractor', 'pol', 'pol_bills', 'employee'];
let activeDelayedThresholdDays = parseInt(process.env.DELAYED_THRESHOLD_DAYS || '3', 10);
const CRON_DIGEST_SCHEDULE = process.env.CRON_DIGEST_SCHEDULE || '0 17 * * *'; // Default: 5:00 PM PKT

// ─────────────────────────────────────────────────────────────────────────────
// 0. Supabase Dynamic Config & Status Sync
// ─────────────────────────────────────────────────────────────────────────────
async function loadDynamicConfigFromSupabase() {
    try {
        const { data, error } = await supabase
            .from('app_config')
            .select('*')
            .eq('config_type', 'whatsapp_setting');

        if (error) throw error;

        if (data && data.length > 0) {
            data.forEach(item => {
                try {
                    if (item.config_key === 'target_numbers' && item.config_label) {
                        const parsed = JSON.parse(item.config_label);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            const filtered = parsed.filter(n => n.enabled !== false).map(n => n.number);
                            if (filtered.length > 0) {
                                activeTargetNumbers = filtered;
                                console.log(`📱 Dynamic Target Numbers Synced (${activeTargetNumbers.length}):`, activeTargetNumbers);
                            }
                        }
                    } else if (item.config_key === 'allowed_sections' && item.config_label) {
                        activeAllowedSections = JSON.parse(item.config_label);
                        console.log(`🏢 Dynamic Allowed Sections Synced:`, activeAllowedSections);
                    } else if (item.config_key === 'allowed_categories' && item.config_label) {
                        activeAllowedCategories = JSON.parse(item.config_label);
                        console.log(`📂 Dynamic Allowed Categories Synced:`, activeAllowedCategories);
                    } else if (item.config_key === 'delayed_threshold_days' && item.config_label) {
                        activeDelayedThresholdDays = parseInt(item.config_label, 10) || 3;
                    }
                } catch (e) {
                    console.error('Error parsing config item:', item.config_key, e);
                }
            });
        }
    } catch (err) {
        console.warn('⚠️ Could not load dynamic config from DB, using defaults:', err.message);
    }
}

async function updateBotStatus(status, extra = {}) {
    try {
        const payload = {
            status,
            last_seen: new Date().toISOString(),
            ...extra
        };

        const { data: existing } = await supabase
            .from('app_config')
            .select('id')
            .eq('config_type', 'whatsapp_setting')
            .eq('config_key', 'bot_status')
            .maybeSingle();

        if (existing) {
            await supabase
                .from('app_config')
                .update({ config_label: JSON.stringify(payload) })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('app_config')
                .insert({
                    config_type: 'whatsapp_setting',
                    config_key: 'bot_status',
                    config_label: JSON.stringify(payload),
                    is_active: true,
                    sort_order: 0
                });
        }
    } catch (err) {
        console.warn('Error reporting bot status:', err.message);
    }
}

async function logWhatsAppEvent(type, phone, senderName, message, actionType = 'WHATSAPP_BROADCAST') {
    try {
        await supabase.from('activity_log').insert({
            user_role: type === 'INCOMING' ? 'whatsapp_user' : 'whatsapp_bot',
            user_name: senderName || 'WhatsApp Bot',
            action: actionType,
            subject: message.substring(0, 100),
            details: {
                type,
                recipient: phone,
                message: message.substring(0, 500),
                status: 'DELIVERED',
                timestamp: new Date().toISOString()
            }
        });
    } catch (e) {
        // Silent fail for logger
    }
}

// Guard flags to prevent duplicate subscriptions/cron on repeated 'ready' events
let isSubscribed = false;
let isCronStarted = false;

// Cache to prevent duplicate notifications for same event in a short window (10 seconds)
const recentNotificationsCache = new Map();
function isDuplicateNotification(key) {
    const now = Date.now();
    const lastTime = recentNotificationsCache.get(key);
    if (lastTime && (now - lastTime) < 10000) {
        return true;
    }
    recentNotificationsCache.set(key, now);
    // Cleanup old entries
    if (recentNotificationsCache.size > 200) {
        for (const [k, v] of recentNotificationsCache.entries()) {
            if (now - v > 30000) recentNotificationsCache.delete(k);
        }
    }
    return false;
}

// Helper: Format Dates in PKT (Asia/Karachi)
function getPktDateString(date = new Date()) {
    const d = new Date(date);
    return new Intl.DateTimeFormat('en-PK', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d).split('/').reverse().join('-'); // YYYY-MM-DD
}

function getPktDateTimeFormatted(date = new Date()) {
    return new Date(date).toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function getPktDateFormatted(date = new Date()) {
    return new Date(date).toLocaleDateString('en-PK', {
        timeZone: 'Asia/Karachi',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Client Initialization
// ─────────────────────────────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023404884-alpha.html'
    },
    puppeteer: {
        executablePath: os.platform() === 'win32' 
            ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 
            : '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    }
});

client.on('qr', (qr) => {
    console.log('\n📲 SCAN THIS QR CODE WITH YOUR DEDICATED WHATSAPP ACCOUNT:');
    qrcode.generate(qr, { small: true });
    updateBotStatus('qr_ready', { qr_code: qr });
});

client.on('ready', async () => {
    console.log('\n✅ WhatsApp Bot is Ready and Connected!');
    console.log(`🤖 Interactive Chatbot & Realtime Listeners are Active.`);
    
    await loadDynamicConfigFromSupabase();
    await updateBotStatus('connected', {
        phone_number: client.info?.wid?.user || 'Connected',
        phone_name: client.info?.pushname || 'KWSC Bot Service'
    });

    // Guard: only subscribe once (prevents crash if 'ready' fires multiple times)
    if (!isSubscribed) {
        isSubscribed = true;
        subscribeToDatabase();
        subscribeToSecurityAlerts();
    }

    // Guard: only start cron jobs once
    if (!isCronStarted) {
        isCronStarted = true;
        startCronJobs();
    }

    // Heartbeat every 30s
    setInterval(() => {
        updateBotStatus('connected', {
            phone_number: client.info?.wid?.user || 'Connected',
            phone_name: client.info?.pushname || 'KWSC Bot Service'
        });
    }, 30000);
});

client.on('auth_failure', msg => {
    console.error('❌ Authentication failure:', msg);
    updateBotStatus('disconnected', { error: msg });
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp was disconnected:', reason);
    updateBotStatus('disconnected', { reason });
});

// ─────────────────────────────────────────────────────────────────────────────
// 0.5 Incoming Call Handler — "Call for Update" Feature
// Jab koi bot number pe call karega → auto-reject + latest file updates bhejega
// ─────────────────────────────────────────────────────────────────────────────
const callCooldownMap = new Map(); // Prevent spam: 1 call-update per 2 minutes per number

client.on('call', async (call) => {
    try {
        const callerJid = call.from; // e.g. "923372106557@c.us"
        const callerNumber = callerJid.replace('@c.us', '');
        const isVideoCall = call.isVideo || false;

        console.log(`📞 Incoming ${isVideoCall ? 'Video' : 'Voice'} Call from: ${callerNumber}`);

        // 1. Auto-reject the call (bot can't answer voice/video calls)
        try {
            await call.reject();
            console.log(`📞 Call auto-rejected for ${callerNumber}`);
        } catch (rejectErr) {
            console.warn('⚠️ Could not auto-reject call:', rejectErr.message);
        }

        // 2. Cooldown check — prevent spam (2 minutes between call-updates per number)
        const now = Date.now();
        const lastCallTime = callCooldownMap.get(callerNumber);
        if (lastCallTime && (now - lastCallTime) < 120000) {
            console.log(`⏩ Cooldown active for ${callerNumber}, skipping call-update.`);
            return;
        }
        callCooldownMap.set(callerNumber, now);

        // Cleanup old cooldown entries
        if (callCooldownMap.size > 100) {
            for (const [k, v] of callCooldownMap.entries()) {
                if (now - v > 300000) callCooldownMap.delete(k);
            }
        }

        // 3. Check if caller is a registered/known number
        const isKnownCaller = activeTargetNumbers.some(tn => {
            const cleanTn = tn.replace('@c.us', '');
            return cleanTn === callerNumber;
        });

        if (!isKnownCaller) {
            // Unknown caller — send polite rejection message
            try {
                await client.sendMessage(callerJid,
                    `📞 *KWSC File Tracking Bot*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `Yeh number sirf authorized officials ke liye hai.\n` +
                    `Bot voice/video calls support nahi karta.\n\n` +
                    `_Agar aap registered hain to WhatsApp message bhejein:_\n` +
                    `Type *HELP* for available commands.`
                );
            } catch (_) {}
            console.log(`📞 Unknown caller ${callerNumber} — polite rejection sent.`);
            return;
        }

        // 4. Known caller — Build comprehensive file update message
        console.log(`📞 Known caller ${callerNumber} — preparing live file update...`);

        // Fetch today's metrics
        const todayPkt = getPktDateString();
        const todayStartIso = `${todayPkt}T00:00:00+05:00`;
        const todayEndIso = `${todayPkt}T23:59:59+05:00`;

        // Today's Inward Count
        const { count: todayInward } = await supabase
            .from('file_tracking_records')
            .select('id', { count: 'exact', head: true })
            .or(`inward_date.eq.${todayPkt},and(created_at.gte.${todayStartIso},created_at.lte.${todayEndIso})`);

        // Today's Forwarded Count (from activity_log)
        const { count: todayForwarded } = await supabase
            .from('activity_log')
            .select('id', { count: 'exact', head: true })
            .eq('action', 'FORWARD')
            .gte('created_at', todayStartIso)
            .lte('created_at', todayEndIso);

        // Today's Disposed/Outwarded Count
        const { count: todayDisposed } = await supabase
            .from('file_tracking_records')
            .select('id', { count: 'exact', head: true })
            .eq('outward_date', todayPkt);

        // Total Active Pending Files
        const { data: activeFiles, count: totalPending } = await supabase
            .from('file_tracking_records')
            .select('id, mark_to, inward_date, created_at', { count: 'exact' })
            .is('outward_date', null);

        // Delayed files count (> threshold days)
        const today = new Date();
        let delayedCount = 0;
        const sectionCounts = {};
        (activeFiles || []).forEach(f => {
            const fileDate = new Date(f.inward_date || f.created_at);
            const diffDays = Math.floor((today - fileDate) / (1000 * 60 * 60 * 24));
            if (diffDays >= activeDelayedThresholdDays) delayedCount++;
            const sec = f.mark_to || 'Unassigned';
            sectionCounts[sec] = (sectionCounts[sec] || 0) + 1;
        });

        // Recent 5 file movements (latest activity)
        const { data: recentActivity } = await supabase
            .from('file_tracking_records')
            .select('cfo_diary_number, receiving_number, subject, mark_to, main_category, amount, created_at, inward_date')
            .order('created_at', { ascending: false })
            .limit(5);

        // Top 5 sections with most pending files
        const topSections = Object.entries(sectionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sec, count]) => `  • *${sec}:* ${count} file(s)`)
            .join('\n');

        // Build the response message
        let callUpdateMsg =
            `📞 *Call Received — Live File Update*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `_Aapki call detect hui. Yeh raha aapka latest update:_\n\n` +
            `📅 *Date:* ${getPktDateFormatted()} (${getPktDateTimeFormatted()})\n\n` +
            `📊 *Aaj Ka Summary:*\n` +
            `  📥 Inwarded: *${todayInward || 0}*\n` +
            `  📤 Forwarded: *${todayForwarded || 0}*\n` +
            `  ✅ Disposed: *${todayDisposed || 0}*\n\n` +
            `⏳ *Total Active Pending:* ${totalPending || 0}\n` +
            `⚠️ *Delayed Files (>${activeDelayedThresholdDays} days):* ${delayedCount}\n\n`;

        // Add top sections
        if (topSections) {
            callUpdateMsg +=
                `🏢 *Section-wise Pending:*\n` +
                topSections + `\n\n`;
        }

        // Add recent 5 files
        if (recentActivity && recentActivity.length > 0) {
            callUpdateMsg += `📁 *Latest 5 File Movements:*\n`;
            recentActivity.forEach((f, idx) => {
                const diary = f.cfo_diary_number || f.receiving_number || 'N/A';
                const subject = f.subject ? (f.subject.length > 40 ? f.subject.substring(0, 37) + '...' : f.subject) : 'No subject';
                const section = f.mark_to || 'Unassigned';
                const amountStr = f.amount && Number(f.amount) > 0 ? ` | Rs.${Number(f.amount).toLocaleString('en-PK')}` : '';
                callUpdateMsg += `${idx + 1}. *${diary}* → ${section}\n   📝 ${subject}${amountStr}\n`;
            });
            callUpdateMsg += `\n`;
        }

        callUpdateMsg +=
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💡 _Mazeed details ke liye commands use karein:_\n` +
            `• *STATUS <Diary No>* — File ki detail\n` +
            `• *PENDING* — Delayed files list\n` +
            `• *SUMMARY* — Full day report\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `_🏛️ KWSC One Window File Tracking System_`;

        // 5. Send the update message
        await client.sendMessage(callerJid, callUpdateMsg);
        console.log(`✅ Call-triggered file update sent to ${callerNumber}`);

        // 6. Log the call event
        await logWhatsAppEvent('INCOMING', callerNumber, `Call from ${callerNumber}`, 'Voice Call → Auto File Update Sent', 'WHATSAPP_QUERY');

    } catch (err) {
        console.error('❌ Error handling incoming call:', err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Interactive Two-Way Query Chatbot
// ─────────────────────────────────────────────────────────────────────────────
client.on('message', async (msg) => {
    try {
        // Ignore status updates or broadcast messages
        if (msg.from === 'status@broadcast') return;

        const body = (msg.body || '').trim();
        if (!body) return;

        // ── SECURITY FILTER: Only process messages from registered target numbers ──
        // Sirf wahi numbers respond karein ge jo Admin Panel mein add hain
        const senderJid = msg.from; // e.g. "923372106557@c.us"
        const isKnownNumber = activeTargetNumbers.some(tn => {
            // Compare with or without @c.us suffix
            const cleanTn = tn.replace('@c.us', '');
            const cleanSender = senderJid.replace('@c.us', '');
            return cleanTn === cleanSender;
        });

        if (!isKnownNumber) {
            // Silently ignore messages from unknown/spam numbers — no log, no reply
            return;
        }

        console.log(`📩 Incoming message from ${msg.from}: "${body}"`);
        await logWhatsAppEvent('INCOMING', msg.from, msg.from, body, 'WHATSAPP_QUERY');

        const cleanText = body.replace(/^[!/#.]/, '').trim();
        const upperText = cleanText.toUpperCase();
        const words = cleanText.split(/\s+/);
        const command = words[0].toUpperCase();
        const queryParam = words.slice(1).join(' ').trim();

        // 1. HELP / MENU COMMAND
        if (['HELP', 'MENU', 'START', 'HI', 'HELLO', 'SALAM'].includes(upperText)) {
            const helpMsg =
                `🤖 *KWSC File Tracking WhatsApp Bot*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Aap ye commands use kar sakte hain:\n\n` +
                `🔍 *1. STATUS <Diary/Receiving No>*\n` +
                `_File ki current location, history aur status check karein._\n` +
                `_Example:_ \`STATUS CFO-4521\` ya \`STATUS 1089\`\n\n` +
                `👤 *2. EMP <Employee Number>*\n` +
                `_Employee number se file dhoondein._\n` +
                `_Example:_ \`EMP 023590-0\` ya \`EMP 023590\`\n\n` +
                `📝 *3. SEARCH <Subject or Name>*\n` +
                `_Subject ya kisi shakhs ke naam se file dhoondein._\n` +
                `_Example:_ \`SEARCH Shoaib Akhtar\` ya \`SEARCH Fixation\`\n\n` +
                `📊 *4. SUMMARY <Date / Range>*\n` +
                `• \`SUMMARY\` (Aaj ki live summary)\n` +
                `• \`SUMMARY YESTERDAY\` (Kal ki summary)\n` +
                `• \`SUMMARY 2026-09-23\` (Kisi khaas tareekh ki)\n` +
                `• \`SUMMARY 7 DAYS\` (Pichle 7 din ki)\n\n` +
                `📋 *5. BILLS <Category>*\n` +
                `_Example:_ \`POL BILLS\`, \`MEDICAL BILLS\`, \`CONTRACTOR BILLS\`\n\n` +
                `⏳ *6. PENDING* (ya *DELAYED*)\n` +
                `_${activeDelayedThresholdDays} din se zyada ruki hui delayed files ki list._\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🏛️ *KWSC One Window System*`;
            await msg.reply(helpMsg);
            return;
        }

        // 2. EMP / EMPLOYEE NUMBER SEARCH COMMAND
        if (['EMP', 'EMPLOYEE', 'EMPID', 'EMP#', 'EMPLOYEENO'].includes(command)) {
            if (!queryParam) {
                await msg.reply(`⚠️ Baraye meharbani Employee number likhein.\n_Example:_ \`EMP 023590-0\``);
                return;
            }
            await handleStatusQuery(msg, queryParam, 'emp');
            return;
        }

        // 3. SEARCH / SUBJECT / FIND / NAME COMMAND
        if (['SEARCH', 'FIND', 'SUBJECT', 'NAME'].includes(command)) {
            if (!queryParam) {
                await msg.reply(`⚠️ Baraye meharbani search keyword ya subject likhein.\n_Example:_ \`SEARCH Shoaib Akhtar\` ya \`SUBJECT Fixation\``);
                return;
            }
            await handleStatusQuery(msg, queryParam, 'subject');
            return;
        }

        // 4. STATUS / TRACK / CHECK COMMAND (Or directly entering Diary/Receiving/Emp Number)
        const isStatusCmd = ['STATUS', 'TRACK', 'CHECK'].includes(command);
        const looksLikeDiaryOrRec = /^((CFO|CF0)[\s\-_]?[0-9]+|[0-9]{2,8}|KWSC[\s\-_]?[0-9A-Z]+|\b02\d{4}-?\d?\b)$/i.test(cleanText);

        if (isStatusCmd || looksLikeDiaryOrRec) {
            const searchQuery = isStatusCmd ? queryParam : cleanText;
            if (!searchQuery) {
                await msg.reply(`⚠️ Baraye meharbani Diary No, Receiving No ya Employee No likhein.\n_Example:_ \`STATUS CFO-4521\` ya \`EMP 023590-0\``);
                return;
            }

            await handleStatusQuery(msg, searchQuery, 'all');
            return;
        }

        // 5. SUMMARY COMMAND (Supports TODAY, YESTERDAY, 7 DAYS, or Specific Date)
        if (upperText.startsWith('SUMMARY') || ['TODAY', 'REPORT', 'DIGEST', 'STATS', 'YESTERDAY', 'KAL'].includes(upperText)) {
            let summaryArg = '';
            if (upperText.startsWith('SUMMARY')) {
                summaryArg = cleanText.substring(7).trim();
            } else if (['YESTERDAY', 'KAL'].includes(upperText)) {
                summaryArg = 'YESTERDAY';
            } else if (['TODAY', 'REPORT', 'DIGEST', 'STATS'].includes(upperText)) {
                summaryArg = 'TODAY';
            }
            await handleSummaryQuery(msg, summaryArg);
            return;
        }

        // 6. PENDING / DELAYED FILES COMMAND
        if (['PENDING', 'DELAYED', 'STUCK', 'OVERDUE'].includes(upperText)) {
            await handlePendingQuery(msg);
            return;
        }

        // 7. CATEGORY BILLS QUERY (e.g. "POL BILLS TODAY", "MEDICAL BILLS", "CONTRACTOR BILLS")
        const billsMatch = upperText.match(/^(POL|MEDICAL|CONTRACTOR|CONTINGENCY|CONTINGENCIES)\s*(BILLS?)?\s*(TODAY|AAJ|COUNT)?$/);
        if (billsMatch || upperText === 'BILLS') {
            const category = billsMatch ? billsMatch[1] : null;
            await handleBillsQuery(msg, category);
            return;
        }

    } catch (err) {
        console.error('❌ Error handling incoming message:', err);
    }
});

// Handler for STATUS / SEARCH / EMP query
async function handleStatusQuery(msg, rawQuery, searchType = 'all') {
    // Sanitize query: Replace CF0 with CFO typo fix
    const safeQuery = rawQuery.replace(/cf0/gi, 'CFO').trim();

    console.log(`🔍 Searching DB (Type: ${searchType}) for: "${safeQuery}"`);

    let queryBuilder = supabase.from('file_tracking_records').select('*');

    if (searchType === 'emp') {
        queryBuilder = queryBuilder.or(`employee_number.ilike.%${safeQuery}%,subject.ilike.%${safeQuery}%`);
    } else if (searchType === 'subject') {
        queryBuilder = queryBuilder.or(`subject.ilike.%${safeQuery}%,received_from.ilike.%${safeQuery}%,handover_person_name.ilike.%${safeQuery}%,remarks.ilike.%${safeQuery}%`);
    } else {
        queryBuilder = queryBuilder.or(`cfo_diary_number.ilike.%${safeQuery}%,receiving_number.ilike.%${safeQuery}%,tracking_id.ilike.%${safeQuery}%,subject.ilike.%${safeQuery}%,employee_number.ilike.%${safeQuery}%,received_from.ilike.%${safeQuery}%,handover_person_name.ilike.%${safeQuery}%`);
    }

    const { data: records, error } = await queryBuilder
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Database query error:', error);
        await msg.reply(`❌ Database query mein masla aaya. Baraye meharbani dobara koshish karein.`);
        return;
    }

    if (!records || records.length === 0) {
        await msg.reply(
            `❌ *Koi record nahi mila!*\n` +
            `Query: "${rawQuery}"\n\n` +
            `_Aap aise search kar sakte hain:_\n` +
            `• Diary/Rec No: \`STATUS CFO-4521\` ya \`STATUS 1089\`\n` +
            `• Employee No: \`EMP 023590-0\`\n` +
            `• Subject/Name: \`SEARCH Shoaib Akhtar\``
        );
        return;
    }

    // CASE 1: Exactly 1 record found -> Show rich full file details card
    if (records.length === 1) {
        const data = records[0];
        const historyList = Array.isArray(data.history) ? data.history : [];
        let historyText = '';
        if (historyList.length > 0) {
            const recentMoves = historyList.slice(-3).reverse();
            historyText = '\n\n🕒 *Recent Movements:*\n' + recentMoves.map((h, i) => {
                const dateStr = h.date ? getPktDateFormatted(h.date) : 'N/A';
                const actionStr = h.action || (h.mark_to ? `Marked to ${h.mark_to}` : 'Updated');
                const remarksStr = h.remarks ? ` - _${h.remarks}_` : '';
                return `${i + 1}. ${dateStr}: ${actionStr}${remarksStr}`;
            }).join('\n');
        }

        const inwardDateStr = data.inward_date ? getPktDateFormatted(data.inward_date) : (data.created_at ? getPktDateFormatted(data.created_at) : 'N/A');
        const amountStr = data.amount && Number(data.amount) > 0 ? `\n💰 *Amount:* Rs. ${Number(data.amount).toLocaleString('en-PK')}` : '';
        const empNumStr = data.employee_number ? `\n👤 *Employee No:* ${data.employee_number}` : '';
        const catStr = data.main_category ? `\n📂 *Category:* ${data.main_category}${data.sub_category ? ` (${data.sub_category})` : ''}` : '';

        const statusBadge = data.outward_date 
            ? `✅ Disposed / Outwarded (${getPktDateFormatted(data.outward_date)})` 
            : `⏳ In Process (${data.mark_to || 'Active'})`;

        const reply =
            `📁 *File Tracking Details*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 *CFO Diary No:* ${data.cfo_diary_number || 'N/A'}\n` +
            `📌 *Receiving No:* ${data.receiving_number || 'N/A'}\n` +
            `🆔 *Tracking ID:* ${data.tracking_id || 'N/A'}` +
            empNumStr +
            `\n📝 *Subject:* ${data.subject || 'N/A'}` +
            catStr +
            `\n👤 *Received From:* ${data.received_from || data.handover_person_name || 'N/A'}\n` +
            `🏢 *Current Section:* ${data.mark_to || 'N/A'}\n` +
            `📅 *Inward Date:* ${inwardDateStr}\n` +
            `⚙️ *Status:* ${statusBadge}` +
            amountStr +
            historyText + `\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🕐 _Queried on ${getPktDateTimeFormatted()}_`;

        const fileImageUrl = data.file_image || (historyList.length > 0 && historyList[historyList.length - 1]?.file_image) || null;

        if (fileImageUrl && (fileImageUrl.startsWith('http') || fileImageUrl.startsWith('data:image'))) {
            try {
                let media;
                if (fileImageUrl.startsWith('data:')) {
                    media = await base64ToMedia(fileImageUrl);
                } else {
                    media = await MessageMedia.fromUrl(fileImageUrl, { unsafeMime: true });
                }
                console.log('🖼️ Sending document image to requester...');
                await msg.reply(reply);
                await client.sendMessage(msg.from, media);
                return;
            } catch (mediaErr) {
                console.warn('⚠️ Could not send image for STATUS query:', mediaErr.message);
            }
        }

        await msg.reply(reply);
        return;
    }

    // CASE 2: Multiple records found (2 to 10) -> Show interactive search results list
    let listReply =
        `🔍 *Search Results for: "${rawQuery}"*\n` +
        `📊 *Total Found:* ${records.length} file(s)\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n`;

    records.forEach((r, idx) => {
        const diary = r.cfo_diary_number || r.receiving_number || 'N/A';
        const recNo = r.receiving_number ? ` | ${r.receiving_number}` : '';
        const section = r.mark_to || 'Unassigned';
        const dateStr = r.inward_date ? getPktDateFormatted(r.inward_date) : (r.created_at ? getPktDateFormatted(r.created_at) : 'N/A');
        const statusStr = r.outward_date ? '✅ Disposed' : '⏳ In Process';
        const amountStr = r.amount && Number(r.amount) > 0 ? ` | Rs.${Number(r.amount).toLocaleString('en-PK')}` : '';
        const subject = r.subject ? (r.subject.length > 55 ? r.subject.substring(0, 52) + '...' : r.subject) : 'No subject';

        listReply +=
            `*${idx + 1}. ${diary}*${recNo}\n` +
            `   📝 ${subject}\n` +
            `   🏢 ${section} | 📅 ${dateStr} | ${statusStr}${amountStr}\n\n`;
    });

    listReply +=
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_💡 Kisi file ki full detail dekhne ke liye reply karein:_\n` +
        `\`STATUS <Diary No>\` (e.g. \`STATUS ${records[0].cfo_diary_number || records[0].receiving_number}\`)`;

    await msg.reply(listReply);
}

// Handler for SUMMARY query (Supports TODAY, YESTERDAY, specific date e.g. 2026-09-23, or 7 DAYS)
async function handleSummaryQuery(msg, rawArg = '') {
    const cleanArg = (rawArg || '').trim().toUpperCase();
    let dateOptions = { mode: 'single', targetDate: getPktDateString(), title: 'Live Summary Report' };

    if (['YESTERDAY', 'KAL'].includes(cleanArg)) {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const yestStr = getPktDateString(yest);
        dateOptions = { mode: 'single', targetDate: yestStr, title: `Summary Report (Yesterday – ${getPktDateFormatted(yestStr)})` };
    } else if (['7 DAYS', '7DAYS', 'WEEK', 'LAST 7 DAYS', 'HAFTA'].includes(cleanArg)) {
        const today = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        dateOptions = {
            mode: 'range',
            startDate: getPktDateString(start),
            endDate: getPktDateString(today),
            title: `Summary Report (Last 7 Days: ${getPktDateFormatted(start)} – ${getPktDateFormatted(today)})`
        };
    } else if (['30 DAYS', '30DAYS', 'MONTH', 'LAST 30 DAYS', 'MAHINA'].includes(cleanArg)) {
        const today = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        dateOptions = {
            mode: 'range',
            startDate: getPktDateString(start),
            endDate: getPktDateString(today),
            title: `Summary Report (Last 30 Days: ${getPktDateFormatted(start)} – ${getPktDateFormatted(today)})`
        };
    } else if (cleanArg && cleanArg !== 'TODAY' && cleanArg !== 'AAJ') {
        // Try parsing custom date like 2026-09-23 or 23-09-2026 or 23/09/2026
        let parsedDate = null;
        const dmyMatch = cleanArg.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        const ymdMatch = cleanArg.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

        if (dmyMatch) {
            const [_, day, month, year] = dmyMatch;
            parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else if (ymdMatch) {
            const [_, year, month, day] = ymdMatch;
            parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        if (parsedDate && !isNaN(new Date(parsedDate).getTime())) {
            dateOptions = {
                mode: 'single',
                targetDate: parsedDate,
                title: `Summary Report (${getPktDateFormatted(parsedDate)})`
            };
        } else {
            await msg.reply(
                `⚠️ Date format samajh nahi aaya: "${rawArg}"\n\n` +
                `*Aap aise pooch sakte hain:*\n` +
                `• \`SUMMARY\` (Aaj ki summary)\n` +
                `• \`SUMMARY YESTERDAY\` (Kal ki summary)\n` +
                `• \`SUMMARY 2026-09-23\` ya \`SUMMARY 23-09-2026\`\n` +
                `• \`SUMMARY 7 DAYS\` (Pichle 7 din)\n` +
                `• \`SUMMARY 30 DAYS\` (Pichle 30 din)`
            );
            return;
        }
    }

    const summary = await calculateSummaryMetrics(dateOptions);
    const digestText = formatDailyDigestMessage(summary, dateOptions.title);
    await msg.reply(digestText);
}

// Handler for PENDING query
async function handlePendingQuery(msg) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - activeDelayedThresholdDays);
    const thresholdIso = thresholdDate.toISOString().split('T')[0];

    const { data: delayedFiles, error } = await supabase
        .from('file_tracking_records')
        .select('cfo_diary_number, receiving_number, subject, mark_to, inward_date, created_at')
        .is('outward_date', null)
        .or(`inward_date.lte.${thresholdIso},created_at.lte.${thresholdDate.toISOString()}`)
        .order('inward_date', { ascending: true })
        .limit(10);

    if (error) {
        console.error('Pending query error:', error);
        await msg.reply('❌ Error fetching pending files data.');
        return;
    }

    if (!delayedFiles || delayedFiles.length === 0) {
        await msg.reply(
            `✅ *All Clear!*\n` +
            `Koi aisi file nahi jo ${activeDelayedThresholdDays} din se zyada ruki hui ho.`
        );
        return;
    }

    let listText = `⏳ *Delayed Files Alert (> ${activeDelayedThresholdDays} Days)*\n━━━━━━━━━━━━━━━━━━━━\n`;
    const today = new Date();

    delayedFiles.forEach((f, idx) => {
        const fileDate = new Date(f.inward_date || f.created_at);
        const diffDays = Math.max(1, Math.floor((today - fileDate) / (1000 * 60 * 60 * 24)));
        const diary = f.cfo_diary_number || f.receiving_number || 'N/A';
        const section = f.mark_to || 'Unassigned';
        const subject = f.subject ? (f.subject.length > 40 ? f.subject.substring(0, 37) + '...' : f.subject) : 'No subject';

        listText += `${idx + 1}. *${diary}* (${section}) - *${diffDays} days old*\n   📝 ${subject}\n\n`;
    });

    listText += `━━━━━━━━━━━━━━━━━━━━\n_Tip: Type *STATUS <Diary No>* for full details._`;
    await msg.reply(listText);
}
// Handler for BILLS query (e.g. "POL BILLS TODAY", "MEDICAL BILLS", "CONTRACTOR BILLS")
async function handleBillsQuery(msg, category) {
    const todayPkt = getPktDateString(); // YYYY-MM-DD
    const todayStartIso = `${todayPkt}T00:00:00+05:00`;

    // Category → main_category key in file_tracking_records & dedicated billing table name
    const categoryMap = {
        'POL':           { trackingKey: 'pol_bills',    billingTable: 'pol_billings',         label: 'POL Bills (Fuel/Oil)' },
        'MEDICAL':       { trackingKey: 'medical',      billingTable: 'medical_billings',     label: 'Medical Bills' },
        'CONTRACTOR':    { trackingKey: 'contractor',   billingTable: 'contractor_billings',  label: 'Contractor Bills' },
        'CONTINGENCY':   { trackingKey: 'contingencies', billingTable: 'contingency_billings', label: 'Contingency Bills' },
        'CONTINGENCIES': { trackingKey: 'contingencies', billingTable: 'contingency_billings', label: 'Contingency Bills' },
    };

    // If no specific category, show summary of all
    if (!category) {
        let summaryText = `📋 *Bills Summary – ${getPktDateFormatted()}*\n━━━━━━━━━━━━━━━━━━━━\n`;
        for (const [key, cfg] of Object.entries(categoryMap)) {
            if (key === 'CONTINGENCIES') continue; // skip duplicate
            const { count } = await supabase
                .from('file_tracking_records')
                .select('id', { count: 'exact', head: true })
                .ilike('main_category', `%${cfg.trackingKey}%`)
                .or(`inward_date.eq.${todayPkt},created_at.gte.${todayStartIso}`);
            summaryText += `• *${cfg.label}:* ${count || 0} files today\n`;
        }
        summaryText += `━━━━━━━━━━━━━━━━━━━━\n_Tip: Type *POL BILLS* ya *MEDICAL BILLS* for details._`;
        await msg.reply(summaryText);
        return;
    }

    const cfg = categoryMap[category];
    if (!cfg) {
        await msg.reply(`❌ Unknown category: ${category}\nTry: *POL BILLS*, *MEDICAL BILLS*, *CONTRACTOR BILLS*, *CONTINGENCY BILLS*`);
        return;
    }

    console.log(`📊 Bills query for: ${category} (tracking key: ${cfg.trackingKey})`);

    // 1. Count from file_tracking_records for today
    const { count: trackingTodayCount } = await supabase
        .from('file_tracking_records')
        .select('id', { count: 'exact', head: true })
        .ilike('main_category', `%${cfg.trackingKey}%`)
        .or(`inward_date.eq.${todayPkt},created_at.gte.${todayStartIso}`);

    // 2. Total active (not outwarded) in this category
    const { count: totalActiveCount } = await supabase
        .from('file_tracking_records')
        .select('id', { count: 'exact', head: true })
        .ilike('main_category', `%${cfg.trackingKey}%`)
        .is('outward_date', null);

    // 3. Recent 5 files in this category (for detail list)
    const { data: recentFiles } = await supabase
        .from('file_tracking_records')
        .select('cfo_diary_number, receiving_number, subject, mark_to, amount, status, inward_date, created_at')
        .ilike('main_category', `%${cfg.trackingKey}%`)
        .or(`inward_date.eq.${todayPkt},created_at.gte.${todayStartIso}`)
        .order('created_at', { ascending: false })
        .limit(5);

    // 4. Count from dedicated billing table for today
    let billingCount = 0;
    try {
        const { count } = await supabase
            .from(cfg.billingTable)
            .select('id', { count: 'exact', head: true })
            .gte('created_at', todayStartIso);
        billingCount = count || 0;
    } catch (e) {
        // Table might not exist – that's fine
    }

    // Build reply
    let reply =
        `📋 *${cfg.label} – Aaj ki Report*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 *Date:* ${getPktDateFormatted()}\n\n` +
        `📥 *Aaj ke Files (File Tracking):* ${trackingTodayCount || 0}\n` +
        `📊 *Total Active/Pending:* ${totalActiveCount || 0}\n`;

    if (billingCount > 0) {
        reply += `🧾 *Billing Records Today:* ${billingCount}\n`;
    }

    if (recentFiles && recentFiles.length > 0) {
        reply += `\n📝 *Aaj ki Recent Files:*\n`;
        recentFiles.forEach((f, idx) => {
            const diary = f.cfo_diary_number || f.receiving_number || 'N/A';
            const subject = f.subject ? (f.subject.length > 35 ? f.subject.substring(0, 32) + '...' : f.subject) : 'No subject';
            const section = f.mark_to || 'Unassigned';
            const amountStr = f.amount && Number(f.amount) > 0 ? ` | Rs.${Number(f.amount).toLocaleString('en-PK')}` : '';
            reply += `${idx + 1}. *${diary}* → ${section}\n   📝 ${subject}${amountStr}\n`;
        });
    } else {
        reply += `\n_Aaj is category mein koi naya file register nahi hua._\n`;
    }

    reply += `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `_Tip: *STATUS \u003cDiary No\u003e* for full file details._`;

    await msg.reply(reply);
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 2. Metrics Calculation & Summary Formatter
// ─────────────────────────────────────────────────────────────────────────────
async function calculateSummaryMetrics(options = { mode: 'single', targetDate: getPktDateString() }) {
    const isRange = options.mode === 'range';
    const targetDate = options.targetDate || getPktDateString();
    const startDate = isRange ? options.startDate : targetDate;
    const endDate = isRange ? options.endDate : targetDate;

    const startIso = `${startDate}T00:00:00+05:00`;
    const endIso = `${endDate}T23:59:59+05:00`;

    // 1. Inwarded in period
    let inwardQuery = supabase
        .from('file_tracking_records')
        .select('id', { count: 'exact', head: true });

    if (isRange) {
        inwardQuery = inwardQuery
            .gte('inward_date', startDate)
            .lte('inward_date', endDate);
    } else {
        inwardQuery = inwardQuery
            .or(`inward_date.eq.${targetDate},and(created_at.gte.${startIso},created_at.lte.${endIso})`);
    }
    const { count: inwardCount } = await inwardQuery;

    // 2. Forwarded in period (from activity_log)
    const { count: forwardedCount } = await supabase
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'FORWARD')
        .gte('created_at', startIso)
        .lte('created_at', endIso);

    // 3. Disposed / Completed in period
    let disposedQuery = supabase
        .from('file_tracking_records')
        .select('id', { count: 'exact', head: true });

    if (isRange) {
        disposedQuery = disposedQuery
            .gte('outward_date', startDate)
            .lte('outward_date', endDate);
    } else {
        disposedQuery = disposedQuery.eq('outward_date', targetDate);
    }
    const { count: disposedCount } = await disposedQuery;

    // 4. Total Active Pending Files
    const { data: activeFiles, count: totalPendingCount } = await supabase
        .from('file_tracking_records')
        .select('id, mark_to, inward_date, created_at', { count: 'exact' })
        .is('outward_date', null);

    // 5. Calculate Delayed Files (> DELAYED_THRESHOLD_DAYS) & Section Breakdown
    const today = new Date();
    let delayedCount = 0;
    const sectionCounts = {};

    (activeFiles || []).forEach(f => {
        const fileDate = new Date(f.inward_date || f.created_at);
        const diffDays = Math.floor((today - fileDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= activeDelayedThresholdDays) {
            delayedCount++;
        }
        const sec = f.mark_to || 'Unassigned';
        sectionCounts[sec] = (sectionCounts[sec] || 0) + 1;
    });

    const dateDisplay = isRange 
        ? `${getPktDateFormatted(startDate)} tak ${getPktDateFormatted(endDate)}`
        : getPktDateFormatted(targetDate);

    return {
        isRange,
        dateDisplay,
        targetDate,
        inwardCount: inwardCount || 0,
        forwardedCount: forwardedCount || 0,
        disposedCount: disposedCount || 0,
        totalPendingCount: totalPendingCount || 0,
        delayedCount,
        sectionCounts
    };
}

function formatDailyDigestMessage(summary, headerTitle = 'Daily Evening Digest') {
    const topSections = Object.entries(summary.sectionCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([sec, count]) => `• *${sec}:* ${count} file(s)`)
        .join('\n');

    const periodLabel = summary.isRange ? 'Is Arsay Mein' : 'Is Din';

    return (
        `⏰ *KWSC File Tracking — ${headerTitle}*\n` +
        `📅 *Tareekh / Period:* ${summary.dateDisplay}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📥 *Inwarded (${periodLabel}):* ${summary.inwardCount}\n` +
        `📤 *Forwarded (${periodLabel}):* ${summary.forwardedCount}\n` +
        `✅ *Disposed / Outwarded (${periodLabel}):* ${summary.disposedCount}\n` +
        `⏳ *Total Active Pending Files:* ${summary.totalPendingCount}\n` +
        `⚠️ *Delayed Files (> ${activeDelayedThresholdDays} Days):* ${summary.delayedCount}\n\n` +
        `🏢 *Top Sections (Current Pending):*\n` +
        (topSections || '• All clear / No pending files') + `\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_🏛️ Automated Briefing — KWSC One Window System_\n` +
        `_Reply *STATUS <Diary No>* or *PENDING* for details._`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Alert WhatsApp Notifier
// Supabase activity_log realtime subscribe karta hai SECURITY_ALERT actions ke liye
// ─────────────────────────────────────────────────────────────────────────────
function subscribeToSecurityAlerts() {
    console.log('🛡️ Subscribing to Security Alerts channel...');

    supabase
        .channel('security_alerts_whatsapp')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'activity_log',
                filter: "action=eq.SECURITY_ALERT"
            },
            async (payload) => {
                try {
                    const log = payload.new;
                    const details = log.details || {};
                    const severity = details.severity || 'HIGH';
                    const alertType = details.alert_type || 'UNKNOWN';
                    const description = details.description || log.subject || 'Security event detected';
                    const ip = details.ip || 'unknown';
                    const timestamp = getPktDateTimeFormatted(new Date(log.created_at));

                    const severityEmoji = severity === 'CRITICAL' ? '🔴' : '🟡';
                    
                    const alertMsg =
                        `${severityEmoji} *KWSC SECURITY ALERT*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `⚠️ *Alert Type:* ${alertType}\n` +
                        `👤 *User:* ${log.user_name} (${log.user_role})\n` +
                        `📋 *Details:* ${description}\n` +
                        `🌐 *IP Address:* ${ip}\n` +
                        `🕐 *Time (PKT):* ${timestamp}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `_🏛️ KWSC One Window Security Monitor_`;

                    // Send to all active target numbers
                    for (const phone of activeTargetNumbers) {
                        try {
                            const jid = phone.includes('@c.us') ? phone : `${phone}@c.us`;
                            await client.sendMessage(jid, alertMsg);
                            console.log(`🛡️ Security alert sent to ${phone}`);
                        } catch (sendErr) {
                            console.warn(`⚠️ Could not send security alert to ${phone}:`, sendErr.message);
                        }
                    }

                    // Also log to activity_log
                    await logWhatsAppEvent(
                        'OUTGOING',
                        activeTargetNumbers.join(','),
                        'Security Monitor Bot',
                        alertMsg.substring(0, 200),
                        'WHATSAPP_BROADCAST'
                    );

                } catch (err) {
                    console.error('❌ Error sending security alert via WhatsApp:', err);
                }
            }
        )
        .subscribe((status) => {
            console.log(`🛡️ Security Alerts subscription status: ${status}`);
        });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Automated Daily Cron Job (5:00 PM PKT)
// ─────────────────────────────────────────────────────────────────────────────
function startCronJobs() {
    console.log(`⏰ Scheduling Daily Evening Digest with cron: "${CRON_DIGEST_SCHEDULE}" (PKT)`);

    cron.schedule(CRON_DIGEST_SCHEDULE, async () => {
        console.log('🔔 Triggering Scheduled Daily Evening Digest...');
        try {
            const summary = await calculateSummaryMetrics();
            const digestMsg = formatDailyDigestMessage(summary, 'Daily Evening Digest');
            await broadcastToAllTargets(digestMsg);
            console.log('✅ Daily Evening Digest successfully broadcasted.');
        } catch (cronErr) {
            console.error('❌ Error executing daily digest cron:', cronErr);
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Karachi'
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Filters Configuration (Sections & Categories)
// ─────────────────────────────────────────────────────────────────────────────
function isRecordEligibleForNotification(record) {
    if (!record) return false;

    const sec = (record.mark_to || '').toLowerCase().trim();
    const cat = (record.main_category || '').toLowerCase().trim();

    // Section match (using dynamic activeAllowedSections)
    const isSectionAllowed = activeAllowedSections.length === 0 || activeAllowedSections.some(s => sec === s.toLowerCase() || sec.includes(s.toLowerCase()));

    // Category match (using dynamic activeAllowedCategories)
    const isCategoryAllowed = activeAllowedCategories.length === 0 || activeAllowedCategories.some(c => cat === c.toLowerCase() || cat.includes(c.toLowerCase()));

    return isSectionAllowed && isCategoryAllowed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Realtime Database Listeners (Live Event Notifications & Web Config Sync)
// ─────────────────────────────────────────────────────────────────────────────
function subscribeToDatabase() {
    console.log('⚡ Listening for live Supabase events on: file_tracking_records, activity_log & app_config...');
    console.log(`🎯 Active WhatsApp Filters: Sections [${activeAllowedSections.join(', ').toUpperCase()}] & Categories [${activeAllowedCategories.join(', ').toUpperCase()}]`);

    // ─── Listen: app_config (Realtime Config Updates from Admin Web Panel) ───
    supabase
        .channel('whatsapp-service-app-config-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, async (payload) => {
            const row = payload.new;
            if (!row || row.config_type !== 'whatsapp_setting') return;

            console.log('🔄 Web Portal Admin Config Change Detected:', row.config_key);

            if (row.config_key === 'bot_command' && row.config_label) {
                try {
                    const cmd = JSON.parse(row.config_label);
                    if (cmd && cmd.type === 'SEND_TEST' && cmd.message) {
                        console.log('📤 Executing Web-Triggered Test Message:', cmd.targetNumber || 'All Targets');
                        if (cmd.targetNumber) {
                            await client.sendMessage(cmd.targetNumber, `🔔 *KWSC Test Alert*\n━━━━━━━━━━━━━━━━━━━━\n${cmd.message}\n\n_Delivered via WhatsApp Bot_`);
                            await logWhatsAppEvent('OUTGOING', cmd.targetNumber, 'Admin Test', cmd.message, 'WHATSAPP_BROADCAST');
                        } else {
                            await broadcastToAllTargets(`🔔 *KWSC Test Alert*\n━━━━━━━━━━━━━━━━━━━━\n${cmd.message}\n\n_Delivered via WhatsApp Bot_`);
                        }
                    }
                } catch (cmdErr) {
                    console.error('Error executing bot command:', cmdErr);
                }
            } else {
                // Reload dynamic numbers & filters
                await loadDynamicConfigFromSupabase();
            }
        })
        .subscribe((status) => console.log('📡 app_config sync channel:', status));

    // ─── Listen: file_tracking_records (New File Created) ───
    supabase
        .channel('file-tracking-inserts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'file_tracking_records' }, async (payload) => {
            const f = payload.new;

            // 📊 Auto-sync new file entry to Google Sheets (non-blocking)
            appendRecordToGoogleSheet(f).catch(sheetErr => {
                console.warn('⚠️ Google Sheets auto-sync error:', sheetErr.message);
            });

            if (!isRecordEligibleForNotification(f)) {
                console.log(`⏩ [Filter] Skipping insert alert for ${f.cfo_diary_number || f.receiving_number} (Section: "${f.mark_to}", Category: "${f.main_category}")`);
                return;
            }

            const eventKey = `NEW_FILE_${f.id || f.receiving_number}`;
            if (isDuplicateNotification(eventKey)) return;

            console.log('📁 New Filtered File Registered:', f.cfo_diary_number || f.receiving_number);
            const msg =
                `📁 *New File Registered!*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 *CFO Diary No:* ${f.cfo_diary_number || 'N/A'}\n` +
                `📌 *Receiving No:* ${f.receiving_number || 'N/A'}\n` +
                `📂 *Category:* ${f.main_category || 'N/A'}\n` +
                `📝 *Subject:* ${f.subject || 'N/A'}\n` +
                `👤 *Handover Person:* ${f.received_from || f.handover_person_name || 'N/A'}\n` +
                `🏢 *Section:* ${f.mark_to || 'N/A'}\n` +
                `🕐 *Time:* ${getPktDateTimeFormatted()}`;

            // Check for attached file image
            const historyArr = Array.isArray(f.history) ? f.history : [];
            const fileImageUrl = f.file_image || (historyArr.length > 0 && historyArr[historyArr.length - 1]?.file_image) || null;
            if (fileImageUrl && (fileImageUrl.startsWith('http') || fileImageUrl.startsWith('data:image'))) {
                await broadcastWithMedia(msg, fileImageUrl, f);
            } else {
                await broadcastToAllTargets(msg, f);
            }

            // Direct Contractor Notification
            if (f.main_category === 'contractor' && f.employee_number) {
                const contractorMsg = `👷‍♂️ *Contractor Alert - KWSC*\n━━━━━━━━━━━━━━━━━━━━\nHello ${f.received_from || 'Contractor'},\nA new file has been registered under your account.\n\n${msg}`;
                await sendDirectMessage(f.employee_number, contractorMsg, fileImageUrl && (fileImageUrl.startsWith('http') || fileImageUrl.startsWith('data:image')) ? fileImageUrl : null);
            }
        })
        .subscribe((status) => console.log('📡 file_tracking_records INSERT channel:', status));

    // ─── Listen: file_tracking_records (File Updated / Moved / Edited) ───
    supabase
        .channel('file-tracking-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'file_tracking_records' }, async (payload) => {
            const f = payload.new;
            const old = payload.old || {};

            // Detect if this is a file EDIT (history contains EDITED action that wasn't there before)
            const newHistory = Array.isArray(f.history) ? f.history : [];
            const oldHistory = Array.isArray(old.history) ? old.history : [];
            const isFileEdit = newHistory.length > oldHistory.length && 
                newHistory.some(h => h.action === 'EDITED' && !oldHistory.some(oh => oh.date === h.date));

            // Only notify if meaningful fields changed (mark_to, status, outward_date) OR it's a file edit
            if (!isFileEdit && old.mark_to === f.mark_to && old.status === f.status && old.outward_date === f.outward_date) {
                return; // Minor edit (e.g. remarks or sync metadata), ignore to prevent spam
            }

            if (!isRecordEligibleForNotification(f)) {
                console.log(`⏩ [Filter] Skipping update alert for ${f.cfo_diary_number || f.receiving_number} (Section: "${f.mark_to}", Category: "${f.main_category}")`);
                return;
            }

            const eventKey = isFileEdit 
                ? `EDIT_FILE_${f.id || f.receiving_number}_${Date.now()}`
                : `UPDATE_FILE_${f.id || f.receiving_number}_${f.mark_to}`;
            if (isDuplicateNotification(eventKey)) return;

            // Get the latest edit details from history
            const latestEdit = isFileEdit ? newHistory.filter(h => h.action === 'EDITED').pop() : null;
            const editedBy = latestEdit?.processed_by || 'Unknown';

            if (isFileEdit) {
                console.log('📝 File EDITED (Filtered):', f.cfo_diary_number || f.receiving_number, 'by', editedBy);
                const msg =
                    `📝 *File Edited!*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 *CFO Diary No:* ${f.cfo_diary_number || 'N/A'}\n` +
                    `📌 *Receiving No:* ${f.receiving_number || 'N/A'}\n` +
                    `📂 *Category:* ${f.main_category || 'N/A'}\n` +
                    `📝 *Subject:* ${f.subject || 'N/A'}\n` +
                    `💰 *Amount:* Rs. ${f.amount ? Number(f.amount).toLocaleString('en-PK') : '0'}\n` +
                    `👤 *Received From:* ${f.received_from || f.handover_person_name || 'N/A'}\n` +
                    `🏢 *Section:* ${f.mark_to || 'N/A'}\n` +
                    `✏️ *Edited By:* ${editedBy}\n` +
                    `🕐 *Time:* ${getPktDateTimeFormatted()}`;

                // Check for file image in history or root
                const fileImageUrl = latestEdit?.file_image || f.file_image || null;
                if (fileImageUrl && (fileImageUrl.startsWith('http') || fileImageUrl.startsWith('data:image'))) {
                    await broadcastWithMedia(msg, fileImageUrl, f);
                } else {
                    await broadcastToAllTargets(msg, f);
                }

                if (f.main_category === 'contractor' && f.employee_number) {
                    const contractorMsg = `👷‍♂️ *Contractor Alert - KWSC*\n━━━━━━━━━━━━━━━━━━━━\nHello ${f.received_from || 'Contractor'},\nYour file has been updated/edited.\n\n${msg}`;
                    await sendDirectMessage(f.employee_number, contractorMsg, fileImageUrl && (fileImageUrl.startsWith('http') || fileImageUrl.startsWith('data:image')) ? fileImageUrl : null);
                }
            } else {
                console.log('✏️ File Updated/Moved (Filtered):', f.cfo_diary_number || f.receiving_number);
                const msg =
                    `✏️ *File Updated / Moved!*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 *CFO Diary No:* ${f.cfo_diary_number || 'N/A'}\n` +
                    `📌 *Receiving No:* ${f.receiving_number || 'N/A'}\n` +
                    `📂 *Category:* ${f.main_category || 'N/A'}\n` +
                    `📝 *Subject:* ${f.subject || 'N/A'}\n` +
                    `📍 *Current Section:* ${f.mark_to || 'N/A'}\n` +
                    `⚙️ *Status:* ${f.status || (f.outward_date ? 'Outwarded' : 'In Process')}\n` +
                    `🕐 *Time:* ${getPktDateTimeFormatted()}`;
                await broadcastToAllTargets(msg, f);

                if (f.main_category === 'contractor' && f.employee_number) {
                    const contractorMsg = `👷‍♂️ *Contractor Alert - KWSC*\n━━━━━━━━━━━━━━━━━━━━\nHello ${f.received_from || 'Contractor'},\nYour file status has been updated.\n\n${msg}`;
                    await sendDirectMessage(f.employee_number, contractorMsg);
                }
            }
        })
        .subscribe((status) => console.log('📡 file_tracking_records UPDATE channel:', status));

    // ─── Listen: activity_log (FORWARD / DELETE actions) ───
    supabase
        .channel('activity-log-inserts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, async (payload) => {
            const a = payload.new;
            // Avoid looping on self logs
            if (a.action === 'WHATSAPP_BROADCAST' || a.action === 'WHATSAPP_QUERY' || a.user_role === 'whatsapp_bot') {
                return;
            }

            if (['FORWARD', 'DELETE', 'EDIT'].includes(a.action)) {
                // Fetch associated file to check category & section filter
                let targetRecord = null;
                if (a.record_id) {
                    const { data } = await supabase.from('file_tracking_records').select('mark_to, main_category').eq('id', a.record_id).maybeSingle();
                    targetRecord = data;
                } else if (a.diary_number) {
                    const { data } = await supabase.from('file_tracking_records').select('mark_to, main_category').eq('cfo_diary_number', a.diary_number).maybeSingle();
                    targetRecord = data;
                }

                if (targetRecord && !isRecordEligibleForNotification(targetRecord)) {
                    console.log(`⏩ [Filter] Skipping activity alert for ${a.diary_number || a.record_id} (Section: "${targetRecord.mark_to}", Category: "${targetRecord.main_category}")`);
                    return;
                }

                const eventKey = `ACT_${a.action}_${a.record_id || a.diary_number}`;
                if (isDuplicateNotification(eventKey)) return;

                console.log('🔔 Activity Alert (Filtered):', a.action, a.diary_number);
                const msg =
                    `🔔 *Activity Alert: ${a.action}*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚡ *Action:* ${a.action}\n` +
                    `👤 *User:* ${a.user_name || 'N/A'} (${a.user_role || 'N/A'})\n` +
                    `📌 *Diary No:* ${a.diary_number || a.receiving_number || 'N/A'}\n` +
                    `📝 *Subject:* ${a.subject || 'N/A'}\n` +
                    `🕐 *Time:* ${getPktDateTimeFormatted()}`;
                broadcastToAllTargets(msg);
            }
        })
        .subscribe((status) => console.log('📡 activity_log channel:', status));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Broadcast Helper
// ─────────────────────────────────────────────────────────────────────────────
async function sendDirectMessage(targetNumber, message, imageUrl = null) {
    if (!targetNumber) return;
    
    // Ensure number has country code (defaulting to Pakistan 92) and ends with @c.us
    let cleanNumber = targetNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '92' + cleanNumber.substring(1);
    } else if (!cleanNumber.startsWith('92') && cleanNumber.length === 10) {
        cleanNumber = '92' + cleanNumber;
    }
    const chatId = `${cleanNumber}@c.us`;

    try {
        if (imageUrl) {
            try {
                let media;
                if (imageUrl.startsWith('data:')) {
                    media = await base64ToMedia(imageUrl);
                } else {
                    media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
                }
                await client.sendMessage(chatId, message);
                await new Promise(resolve => setTimeout(resolve, 500));
                await client.sendMessage(chatId, media);
                console.log(`✅ Direct media message sent to contractor ${cleanNumber}`);
            } catch (mediaErr) {
                console.warn(`⚠️ Could not send media to contractor ${cleanNumber}, sending text only:`, mediaErr.message);
                await client.sendMessage(chatId, message);
            }
        } else {
            await client.sendMessage(chatId, message);
            console.log(`✅ Direct message sent to contractor ${cleanNumber}`);
        }
        await logWhatsAppEvent('OUTGOING', cleanNumber, 'KWSC Bot (Contractor Direct)', message, 'WHATSAPP_BROADCAST');
    } catch (error) {
        console.error(`❌ Failed to send direct message to ${cleanNumber}:`, error.message);
    }
}
async function broadcastWithMedia(message, imageUrl, recordInfo = null) {
    if (activeTargetNumbers.length === 0) {
        console.log("⚠️ No active target phone numbers configured. Skipping media broadcast.");
        return;
    }
    let media = null;
    try {
        if (imageUrl.startsWith('data:')) {
            media = await base64ToMedia(imageUrl);
            console.log('🖼️ Media prepared from base64 temp file.');
        } else {
            media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
            console.log('🖼️ Media downloaded from URL for broadcast.');
        }
    } catch (mediaErr) {
        console.warn('⚠️ Could not prepare media, sending text only:', mediaErr.message);
        await broadcastToAllTargets(message);
        return;
    }
    for (const number of activeTargetNumbers) {
        if (number.includes('923456777712') && recordInfo) {
            const cat = (recordInfo.main_category || '').toLowerCase().trim();
            const sec = (recordInfo.mark_to || '').toLowerCase().trim();
            if (cat !== 'contractor' || sec !== 'budget') {
                continue; // Skip for this restricted number
            }
        }
        try {
            await client.sendMessage(number, message);
            if (media) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await client.sendMessage(number, media);
            }
            console.log(`✅ Media message broadcasted to ${number}`);
            await logWhatsAppEvent('OUTGOING', number, 'KWSC Bot', message, 'WHATSAPP_BROADCAST');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`❌ Failed to send media broadcast to ${number}:`, error.message);
        }
    }
}

async function broadcastToAllTargets(message, recordInfo = null) {
    if (activeTargetNumbers.length === 0) {
        console.log("⚠️ No active target phone numbers configured. Skipping broadcast.");
        return;
    }
    for (const number of activeTargetNumbers) {
        if (number.includes('923456777712') && recordInfo) {
            const cat = (recordInfo.main_category || '').toLowerCase().trim();
            const sec = (recordInfo.mark_to || '').toLowerCase().trim();
            if (cat !== 'contractor' || sec !== 'budget') {
                continue; // Skip for this restricted number
            }
        }
        try {
            await client.sendMessage(number, message);
            console.log(`✅ Message broadcasted to ${number}`);
            await logWhatsAppEvent('OUTGOING', number, 'KWSC Bot', message, 'WHATSAPP_BROADCAST');
            // Pacing delay to prevent WhatsApp rate-limit / spam flagging
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
            console.error(`❌ Failed to send broadcast to ${number}:`, error);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Start Client
// ─────────────────────────────────────────────────────────────────────────────
client.initialize();

