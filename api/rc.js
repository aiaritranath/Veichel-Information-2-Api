const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const API_KEY = process.env.API_KEY || 'aritra';

// --- Headless browser দিয়ে পেজ লোড করে ডেটা বের করার ফাংশন ---
async function fetchVehicleData(vehicleNo) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();

    // ব্রাউজারের মতো হেডার সেট করুন
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    const url = `https://vahanx.in/rc-search/${vehicleNo.toUpperCase()}`;
    console.log('Navigating to:', url);

    await page.goto(url, {
      waitUntil: 'networkidle2',   // সব AJAX কল শেষ হওয়া পর্যন্ত অপেক্ষা
      timeout: 25000,
    });

    // ডেটা লোড হতে অতিরিক্ত সময় (কখনও কখনও দরকার হয়)
    await new Promise(r => setTimeout(r, 3000));

    // পুরো body টেক্সট নিন (innerText সব ভিজিবল টেক্সট দেয়)
    const bodyText = await page.evaluate(() => document.body.innerText);

    // ডিবাগের জন্য HTML সোর্সও নিতে পারেন (প্রয়োজনে)
    // const html = await page.content();

    return { bodyText, url };
  } finally {
    await browser.close();
  }
}

// --- লাইন-বাই-লাইন টেক্সট থেকে ডেটা এক্সট্রাক্ট করার হেল্পার ---
function extractAfterLast(lines, label) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === label && i + 1 < lines.length) {
      return lines[i + 1].trim();
    }
  }
  return 'N/A';
}

function extractBefore(lines, label) {
  const idx = lines.findIndex(l => l.trim() === label);
  if (idx > 0) return lines[idx - 1].trim();
  return 'N/A';
}

// --- মূল API হ্যান্ডলার ---
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key, vehicle_no, debug } = req.query;

  // API কী যাচাই
  if (!key || key !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key',
      hint: 'Use ?key=aritra',
    });
  }

  if (!vehicle_no) {
    return res.status(400).json({
      success: false,
      error: 'Missing vehicle_no parameter',
      example: '/api/rc?key=aritra&vehicle_no=WB26D2797',
    });
  }

  try {
    const { bodyText, url } = await fetchVehicleData(vehicle_no);

    // --- ডিবাগ মোড: পুরো টেক্সট দেখুন ---
    if (debug === '1') {
      return res.status(200).json({
        success: true,
        debug: true,
        body_text_length: bodyText.length,
        body_text_preview: bodyText.substring(0, 5000),
      });
    }

    // --- টেক্সট লাইন ভাগ করুন ---
    const lines = bodyText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // --- ডেটা এক্সট্রাক্ট করুন (vahanx.in-এর পেজ স্ট্রাকচার অনুযায়ী) ---
    const data = {
      vehicle_number: vehicle_no.toUpperCase(),

      // Ownership Details (label আগে, value পরে)
      owner_name: extractAfterLast(lines, 'Owner Name'),
      owner_serial: extractAfterLast(lines, 'Owner Serial No'),
      registration_number: extractAfterLast(lines, 'Registration Number'),
      registered_rto: extractAfterLast(lines, 'Registered RTO'),

      // Top summary (value আগে, label পরে)
      rto_code: extractBefore(lines, 'Code'),
      city: extractBefore(lines, 'City Name'),
      phone: extractBefore(lines, 'Phone'),
      website: extractBefore(lines, 'Website'),
      address: extractBefore(lines, 'Address'),

      // Vehicle Details
      model_name: extractAfterLast(lines, 'Model Name'),
      maker_model: extractAfterLast(lines, 'Maker Model'),
      vehicle_class: extractAfterLast(lines, 'Vehicle Class'),
      fuel_type: extractAfterLast(lines, 'Fuel Type'),
      chassis_number: extractAfterLast(lines, 'Chassis Number'),
      engine_number: extractAfterLast(lines, 'Engine Number'),

      // Insurance
      insurance_expiry: extractAfterLast(lines, 'Insurance Expiry'),
      insurance_no: extractAfterLast(lines, 'Insurance No'),
      insurance_company: extractAfterLast(lines, 'Insurance Company'),

      // Important Dates
      registration_date: extractAfterLast(lines, 'Registration Date'),
      vehicle_age: extractAfterLast(lines, 'Vehicle Age'),
      fitness_upto: extractAfterLast(lines, 'Fitness Upto'),
      tax_upto: extractAfterLast(lines, 'Tax Upto'),
      insurance_upto: extractAfterLast(lines, 'Insurance Upto'),
    };

    // কতগুলো ফিল্ড পাওয়া গেল
    const found = Object.values(data).filter(v => v && v !== 'N/A').length;

    return res.status(200).json({
      success: true,
      source: 'vahanx.in',
      fetched_at: new Date().toISOString(),
      fields_found: `${found}/${Object.keys(data).length}`,
      data,
    });
  } catch (err) {
    console.error('Scraping error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle data',
      details: err.message,
      stack: err.stack?.substring(0, 500),
    });
  }
};
