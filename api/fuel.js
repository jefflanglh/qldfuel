// api/fuel.js
const axios = require('axios');

export default async function handler(req, res) {
    const { postcode, fueltype, token } = req.query;
    const config = { headers: { 'Authorization': `FPDAPI SubscriberToken=${token}` } };

    try {
        // 1. 获取站点详情
        const sitesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        const mySites = sitesRes.data.filter(s => s.P == postcode).slice(0, 5);
        const siteIds = mySites.map(s => s.S);

        // 2. 获取价格
        const pricesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        // 3. 匹配逻辑
        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3 };
        const targetFuelId = fuelIdMap[fueltype] || 2;

        const results = [];
        pricesRes.data.SitePrices.forEach(p => {
            if (p.FuelId == targetFuelId && siteIds.includes(p.SiteId)) {
                const siteInfo = mySites.find(s => s.S == p.SiteId);
                results.push({
                    n: siteInfo.N, // Name
                    a: siteInfo.A, // Address
                    p: p.Price / 10, // Price
                    b: fueltype     // Brand
                });
            }
        });

        // 只给 ESP32 返回这几百个字节，内存压力瞬间消失
        res.status(200).json(results.slice(0, 3));
    } catch (error) {
        res.status(500).json({ error: "Cloud Fetch Failed" });
    }
}
