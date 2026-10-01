const axios = require('axios');
const cheerio = require('cheerio');

// --- Helpers ---
function extractAfterLast(lines, label) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === label && i + 1 < lines.length) {
      return lines[i + 1];
    }
  }
  return null;
}

function extractBefore(lines, label) {
  const idx = lines.indexOf(label);
  if (idx > 0) return lines[idx - 1];
  return null;
}

function clean(v) {
  if (v === null || v === undefined) return 'N/A';
  const s = String(v).trim();
  if (!s || s.length > 250) return 'N/A';
  return s;
}

// Next.js এর __NEXT_DATA__ থেকে JSON বের করার চেষ্টা
function findInObject(obj, targetKeys, result = {}) {
  if (!obj || typeof obj !== 'object') return result;
  for (const k of Object.keys(obj)) {
    const norm = k.toLowerCase().replace(/[_\s-]/g, '');
    for (const target of targetKeys) {
      const tNorm = target.toLowerCase().replace(/[_\s-]/g, '');
      if (norm === tNorm && (typeof obj[k] === 'string' || typeof obj[k] === 'number')) {
        if (!result[target]) result[target] = String(obj[k]);
      }
    }
    if (obj[k] && typeof obj[k] === 'object') {
      findInObject(obj[k], targetKeys, result);
    }
  }
  return result;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key, vehicle_no, debug } = req.query;
  const API_KEY = process.env.API_KEY || 'aritra';

  if (!key || key !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key',
      hint: 'Use ?key=aritra'
    });
  }
  if (!vehicle_no) {
    return res.status(400).json({
      success: false,
      error: 'Missing vehicle_no parameter',
      example: '/api/rc?key=aritra&vehicle_no=WB26D2797'
    });
  }

  try {
    const url = `https://vahanx.in/rc-search/${vehicle_no.toUpperCase()}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://vahanx.in/',
      },
      timeout: 25000,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const bodyText = $('body').text();

    // ---- DEBUG MODE ----
    if (debug === '1') {
      const nextDataRaw = $('#__NEXT_DATA__').html();
      return res.status(200).json({
        success: true,
        debug: true,
        html_length: html.length,
        body_text_length: bodyText.length,
        has_next_data: !!nextDataRaw,
        is_likely_ssr: bodyText.length > 3000,
        body_text_preview: bodyText.substring(0, 4000),
        next_data_preview: nextDataRaw ? nextDataRaw.substring(0, 3000) : null,
      });
    }

    // ---- Strategy 1: __NEXT_DATA__ JSON ----
    const nextDataRaw = $('#__NEXT_DATA__').html();
    let jsonData = {};
    if (nextDataRaw) {
      try {
        const nextData = JSON.parse(nextDataRaw);
        jsonData = findInObject(nextData, [
          'owner_name', 'ownerName', 'registration_number', 'registrationNumber',
          'vehicle_class', 'vehicleClass', 'fuel_type', 'fuelType',
          'chassis_number', 'chassisNumber', 'engine_number', 'engineNumber',
          'model_name', 'modelName', 'maker_model', 'makerModel',
          'insurance_expiry', 'insuranceExpiry', 'insurance_company',
          'registration_date', 'registrationDate', 'fitness_upto',
          'tax_upto', 'insurance_no', 'registered_rto', 'rto_code',
          'city', 'phone', 'website', 'address',
        ]);
        console.log('Extracted from __NEXT_DATA__:', JSON.stringify(jsonData));
      } catch (e) {
        console.error('JSON parse error:', e.message);
      }
    }

    // ---- Strategy 2: Body text line parsing ----
    const lines = bodyText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const data = {
      vehicle_number: vehicle_no.toUpperCase(),

      // Ownership Details (label আগে, value পরে)
      owner_name: clean(extractAfterLast(lines, 'Owner Name')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Owner Name'))
        : clean(jsonData.owner_name),
      owner_serial: clean(extractAfterLast(lines, 'Owner Serial No')),
      registration_number: clean(extractAfterLast(lines, 'Registration Number')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Registration Number'))
        : clean(jsonData.registration_number),
      registered_rto: clean(extractAfterLast(lines, 'Registered RTO')),

      // Top summary (value আগে, label পরে)
      rto_code: clean(extractBefore(lines, 'Code')),
      city: clean(extractBefore(lines, 'City Name')),
      phone: clean(extractBefore(lines, 'Phone')),
      website: clean(extractBefore(lines, 'Website')),
      address: clean(extractBefore(lines, 'Address')),

      // Vehicle Details
      model_name: clean(extractAfterLast(lines, 'Model Name')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Model Name'))
        : clean(jsonData.model_name),
      maker_model: clean(extractAfterLast(lines, 'Maker Model')),
      vehicle_class: clean(extractAfterLast(lines, 'Vehicle Class')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Vehicle Class'))
        : clean(jsonData.vehicle_class),
      fuel_type: clean(extractAfterLast(lines, 'Fuel Type')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Fuel Type'))
        : clean(jsonData.fuel_type),
      chassis_number: clean(extractAfterLast(lines, 'Chassis Number')),
      engine_number: clean(extractAfterLast(lines, 'Engine Number')),

      // Insurance
      insurance_expiry: clean(extractAfterLast(lines, 'Insurance Expiry')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Insurance Expiry'))
        : clean(jsonData.insurance_expiry),
      insurance_no: clean(extractAfterLast(lines, 'Insurance No')),
      insurance_company: clean(extractAfterLast(lines, 'Insurance Company')),

      // Important Dates
      registration_date: clean(extractAfterLast(lines, 'Registration Date')) !== 'N/A'
        ? clean(extractAfterLast(lines, 'Registration Date'))
        : clean(jsonData.registration_date),
      vehicle_age: clean(extractAfterLast(lines, 'Vehicle Age')),
      fitness_upto: clean(extractAfterLast(lines, 'Fitness Upto')),
      tax_upto: clean(extractAfterLast(lines, 'Tax Upto')),
      insurance_upto: clean(extractAfterLast(lines, 'Insurance Upto')),
    };

    // কতগুলো ফিল্ড পাওয়া গেল
    const found = Object.values(data).filter(v => v && v !== 'N/A').length;
    const total = Object.keys(data).length;

    return res.status(200).json({
      success: true,
      source: 'vahanx.in',
      fetched_at: new Date().toISOString(),
      fields_found: `${found}/${total}`,
      data,
    });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle data',
      details: error.message,
      url_tried: `https://vahanx.in/rc-search/${vehicle_no}`,
    });
  }
};
