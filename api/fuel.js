const axios = require('axios');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { postcode, fueltype, token } = req.query;

    if (!token || !postcode) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    // --- 核心修复：添加完整的浏览器请求头 ---
    const config = { 
        headers: { 
            'Authorization': `FPDAPI SubscriberToken=${token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://www.fuelpricesqld.com.au/'
        },
        timeout: 15000 
    };

    try {
        // 1. 获取所有站点
        const sitesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        // QLD API 经常把数据放在 .Sites 或 .SITES 字段里
        const rawSites = sitesRes.data.SITES || sitesRes.data.Sites || (Array.isArray(sitesRes.data) ? sitesRes.data : []);
        
        if (rawSites.length === 0) {
            // 如果还是 0，把原始返回的前100个字符打出来看看，方便排查
            const debugRaw = JSON.stringify(sitesRes.data).substring(0, 100);
            return res.status(200).json([{ n: "API returned no data", a: "Raw preview: " + debugRaw, p: 0, b: "" }]);
        }

        // 2. 匹配邮编
        const mySites = rawSites.filter(s => {
            const p = (s.P || s.Postcode || s.p || "").toString();
            return p === postcode.trim();
        });

        if (mySites.length === 0) {
            return res.status(200).json([{ n: "No sites in " + postcode, a: "Total sites: " + rawSites.length, p: 0, b: "" }]);
        }

        const siteIds = mySites.map(s => s.S || s.SiteId || s.id);

        // 3. 获取价格
        const pricesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        const allPrices = pricesRes.data.SitePrices || pricesRes.data.sitePrices || (Array.isArray(pricesRes.data) ? pricesRes.data : []);

        const fuelIdMap = { "U91": 2, "P95": 5, "P98": 16, "Diesel": 3, "DL": 3 };
        const targetFuelId = fuelIdMap[fueltype] || 2;

        const results = [];
        allPrices.forEach(p => {
            const pSiteId = p.SiteId || p.S || p.si;
            const pFuelId = p.FuelId || p.F || p.fi;
            
            if (pFuelId == targetFuelId && siteIds.includes(pSiteId)) {
                const siteInfo = mySites.find(s => (s.S || s.SiteId || s.id) == pSiteId);
                if (siteInfo) {
                    results.push({
                        n: siteInfo.N || siteInfo.Name || "Unknown",
                        a: siteInfo.A || siteInfo.Address || "",
                        p: (p.Price || p.P || p.pr) / 10,
                        b: fueltype
                    });
                }
            }
        });

        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        res.status(500).json({ error: "Fetch Error", msg: error.message, stack: error.response ? error.response.status : "No Response" });
    }
}
