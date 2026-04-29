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

        // --- 核心修复：基于官方 curl 结果的真实映射表 ---
        // P98 对应 8, E10 对应 12, Diesel 对应 3
        const fuelIdMap = { 
            "U91": 2, 
            "P95": 5, 
            "P98": 8, 
            "DIESEL": 3, 
            "E10": 12, 
            "PD": 14 
        };
        
        let targetFuelId;
        const upperType = (fueltype || "").toUpperCase();

        // 逻辑判定：优先识别数字 ID，其次识别映射表
        if (/^\d+$/.test(fueltype)) {
            targetFuelId = parseInt(fueltype);
        } else {
            targetFuelId = fuelIdMap[upperType] || 0; 
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
                        b: upperType
                    });
                }
            }
        });

        // 3. 排序与返回
        if (results.length === 0) {
            return res.status(200).json([{ 
                n: `No ${upperType} Data`, 
                a: `ID:${targetFuelId} not found in ${postcode}`, 
                p: 0, 
                b: upperType 
            }]);
        }

        // 按价格从低到高排序，取前三名
        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        res.status(500).json({ error: "Fetch Error", msg: error.message });
    }
}
