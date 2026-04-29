const axios = require('axios');

export default async function handler(req, res) {
    // 允许跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { postcode, fueltype, token } = req.query;

    if (!token || !postcode) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const config = { 
        headers: { 'Authorization': `FPDAPI SubscriberToken=${token}` },
        timeout: 8000 // 8秒超时，防止 QLD 接口太慢导致 Vercel 崩溃
    };

    try {
        // 并行请求两个接口，速度更快
        const [sitesRes, pricesRes] = await Promise.all([
            axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config),
            axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config)
        ]);

        // 1. 过滤站点
        const mySites = sitesRes.data.filter(s => s.P == postcode);
        const siteIds = mySites.map(s => s.S);

        // 2. 匹配油品 ID
        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3, "DL": 3 };
        const targetFuelId = fuelIdMap[fueltype] || 2;

        // 3. 组装结果
        const results = [];
        const allPrices = pricesRes.data.SitePrices || [];

        allPrices.forEach(p => {
            if (p.FuelId == targetFuelId && siteIds.includes(p.SiteId)) {
                const siteInfo = mySites.find(s => s.S == p.SiteId);
                results.push({
                    n: siteInfo.N, // Name
                    a: siteInfo.A, // Address
                    p: p.Price / 10, // Price
                    b: fueltype
                });
            }
        });

        // 按价格从低到高排序，取前3个
        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        
        res.status(200).json(finalData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Fetch failed", details: error.message });
    }
}
