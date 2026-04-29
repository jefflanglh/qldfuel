const axios = require('axios');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { postcode, fueltype, token } = req.query;

    if (!token || !postcode) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const config = { 
        headers: { 
            'Authorization': `FPDAPI SubscriberToken=${token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        },
        timeout: 20000 
    };

    try {
        // 1. 获取站点详情
        const sitesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        // 核心修复：根据你提供的预览，数据在 sitesRes.data.S 中
        const rawSites = sitesRes.data.S || [];
        
        // 2. 匹配邮编 (过滤 4169)
        const mySites = rawSites.filter(s => {
            const p = (s.P || "").toString();
            return p === postcode.trim();
        });

        if (mySites.length === 0) {
            return res.status(200).json([{ n: "No sites in " + postcode, a: "Total sites found: " + rawSites.length, p: 0, b: "" }]);
        }

        const siteIds = mySites.map(s => s.S);

        // 3. 获取价格
        const pricesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        // 价格数据通常在 SitePrices 数组中
        const allPrices = pricesRes.data.SitePrices || [];

        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3, "DL": 3 };
        const targetFuelId = fuelIdMap[fueltype] || 2;

        const results = [];
        allPrices.forEach(p => {
            if (p.FuelId == targetFuelId && siteIds.includes(p.SiteId)) {
                const siteInfo = mySites.find(s => s.S == p.SiteId);
                if (siteInfo) {
                    results.push({
                        n: siteInfo.N || "Unknown",
                        a: siteInfo.A || "",
                        p: p.Price / 10,
                        b: fueltype
                    });
                }
            }
        });

        // 排序并返回
        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        res.status(500).json({ error: "Fetch Error", msg: error.message });
    }
}
