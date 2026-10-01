const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS হেডার সেট করুন
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { key, vehicle_no } = req.query;

  // API কী যাচাই করুন
  if (key !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key'
    });
  }

  // গাড়ির নম্বর যাচাই করুন
  if (!vehicle_no) {
    return res.status(400).json({
      success: false,
      error: 'Missing vehicle_no parameter'
    });
  }

  try {
    // vahanx.in এর RC সার্চ পেজে রিকোয়েস্ট পাঠান
    const targetUrl = `https://vahanx.in/rc-search/${vehicle_no}`;
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // HTML পার্স করুন
    const $ = cheerio.load(response.data);

    // ডেটা এক্সট্রাক্ট করুন (আপনার প্রয়োজন অনুযায়ী সিলেক্টর পরিবর্তন করুন)
    const vehicleData = {
      vehicle_number: vehicle_no,
      owner_name: $('.owner-name').text().trim() || 'N/A',
      registration_date: $('.reg-date').text().trim() || 'N/A',
      vehicle_class: $('.vehicle-class').text().trim() || 'N/A',
      fuel_type: $('.fuel-type').text().trim() || 'N/A',
      insurance_expiry: $('.insurance-expiry').text().trim() || 'N/A',
      // আরও ফিল্ড যোগ করতে পারেন...
    };

    // JSON রেসপন্স পাঠান
    res.status(200).json({
      success: true,
      data: vehicleData
    });

  } catch (error) {
    console.error('Scraping error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle data',
      details: error.message
    });
  }
};