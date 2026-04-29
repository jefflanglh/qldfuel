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
        const rawSites = sitesRes.data.S || [];
        
        // 确保邮编过滤准确
        const mySites = rawSites.filter(s => String(s.P) === String(postcode).trim());

        if (mySites.length === 0) {
            return res.status(200).json([{ n: "No sites in " + postcode, a: "Check postcode", p: 0, b: "" }]);
        }

        const siteIds = mySites.map(s => s.S);

        // --- 核心修复：严谨的油品 ID 判定 ---
        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3, "DL": 3, "E10": 6 };
        
        let targetFuelId;
        // 如果 fueltype 是纯数字（如 "16"），强制转为数字
        if (/^\d+$/.test(fueltype)) {
            targetFuelId = parseInt(fueltype);
        } else {
            // 如果是字母（如 "P98"），查找映射，找不到则设为 0（代表非法，不触发默认值）
            targetFuelId = fuelIdMap[fueltype] || 0; 
        }

        // 2. 获取价格
        const pricesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        const allPrices = pricesRes.data.SitePrices || [];

        const results = [];
        allPrices.forEach(p => {
            // 严格匹配 FuelId 和 SiteId
            if (Number(p.FuelId) === targetFuelId && siteIds.includes(p.SiteId)) {
                const siteInfo = mySites.find(s => s.S == p.SiteId);
                if (siteInfo) {
                    results.push({
                        n: siteInfo.N || "Unknown",
                        a: siteInfo.A || "",
                        p: p.Price / 10,
                        b: fueltype.toUpperCase() // 统一转大写返回
                    });
                }
            }
        });

        // 3. 排序与返回
        if (results.length === 0) {
            return res.status(200).json([{ 
                n: `No ${fueltype} Data`, 
                a: `Site count: ${mySites.length}`, 
                p: 0, 
                b: fueltype 
            }]);
        }

        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        res.status(500).json({ error: "Fetch Error", msg: error.message });
    }
}
