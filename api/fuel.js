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
        // 1. 确定 Target Fuel ID
        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3, "E10": 6, "LPG": 4 };
        const fuelNameMap = { 2: "U91", 5: "P95", 16: "P98", 3: "Diesel", 6: "E10", 4: "LPG" };
        
        let targetFuelId;
        // 如果 fueltype 本身就是数字字符串 (ESP32 传过来的 "16", "5" 等)
        if (!isNaN(fueltype)) {
            targetFuelId = parseInt(fueltype);
        } else {
            // 如果是字符串 (网页手动测试传的 "P98")
            targetFuelId = fuelIdMap[fueltype] || 2;
        }

        // 2. 获取站点详情
        const sitesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        const rawSites = sitesRes.data.S || [];
        
        // 3. 匹配邮编
        const mySites = rawSites.filter(s => {
            const p = (s.P || "").toString();
            return p === postcode.trim();
        });

        if (mySites.length === 0) {
            return res.status(200).json([]);
        }

        const siteIds = mySites.map(s => s.S);

        // 4. 获取价格
        const pricesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        const allPrices = pricesRes.data.SitePrices || [];

        const results = [];
        allPrices.forEach(p => {
            // 严格匹配选中的 FuelId 和 区域内的 SiteId
            if (p.FuelId == targetFuelId && siteIds.includes(p.SiteId)) {
                const siteInfo = mySites.find(s => s.S == p.SiteId);
                if (siteInfo) {
                    results.push({
                        n: siteInfo.N || "Unknown",
                        a: siteInfo.A || "",
                        p: p.Price / 10,
                        b: fuelNameMap[targetFuelId] || "Other" // 修正品牌/种类显示
                    });
                }
            }
        });

        // 5. 按价格升序排列，取前3个
        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        res.status(500).json({ error: "Fetch Error", msg: error.message });
    }
}
