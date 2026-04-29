const axios = require('axios');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { postcode, fueltype, token } = req.query;

    if (!token || !postcode) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const config = { 
        headers: { 'Authorization': `FPDAPI SubscriberToken=${token}` },
        timeout: 10000 
    };

    try {
        const [sitesRes, pricesRes] = await Promise.all([
            axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config),
            axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config)
        ]);

        // --- 修复点：强制确保 sites 是数组 ---
        const rawSites = Array.isArray(sitesRes.data) ? sitesRes.data : [];
        const mySites = rawSites.filter(s => s && s.P == postcode);
        
        if (mySites.length === 0) {
            return res.status(200).json([]); // 如果没找到邮编对应的点，直接返回空数组
        }

        const siteIds = mySites.map(s => s.S);

        // 油品 ID 转换
        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3, "DL": 3 };
        const targetFuelId = fuelIdMap[fueltype] || 2;

        const results = [];
        // --- 修复点：确保 pricesRes.data.SitePrices 存在 ---
        const allPrices = (pricesRes.data && Array.isArray(pricesRes.data.SitePrices)) ? pricesRes.data.SitePrices : [];

        allPrices.forEach(p => {
            if (p.FuelId == targetFuelId && siteIds.includes(p.SiteId)) {
                const siteInfo = mySites.find(s => s.S == p.SiteId);
                if (siteInfo) {
                    results.push({
                        n: siteInfo.N,
                        a: siteInfo.A,
                        p: p.Price / 10,
                        b: fueltype
                    });
                }
            }
        });

        // 按价格从低到高排序，取前3个
        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        console.error("Fetch Error:", error.message);
        res.status(500).json({ error: "Cloud Fetch Failed", details: error.message });
    }
}
