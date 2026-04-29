const axios = require('axios');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { postcode, fueltype, token } = req.query;

    if (!token || !postcode) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const config = { 
        headers: { 'Authorization': `FPDAPI SubscriberToken=${token}` },
        timeout: 15000 
    };

    try {
        // 1. 获取所有站点
        const sitesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        // 自动识别数据位置：有些 API 版本数据在 .SITES 之下，有些直接是数组
        const rawSites = sitesRes.data.SITES || (Array.isArray(sitesRes.data) ? sitesRes.data : []);
        
        // 2. 增强匹配邮编 (过滤出 4169 的站)
        const mySites = rawSites.filter(s => {
            const p = (s.P || s.Postcode || s.p || "").toString();
            return p === postcode.trim();
        });

        // 如果没找到站，返回调试信息告知搜到了多少个总站
        if (mySites.length === 0) {
            return res.status(200).json([{ n: "No sites found in " + postcode, a: "Total sites in QLD: " + rawSites.length, p: 0, b: "" }]);
        }

        const siteIds = mySites.map(s => s.S || s.SiteId || s.id);

        // 3. 获取价格
        const pricesRes = await axios.get('https://fppdirectapi-prod.fuelpricesqld.com.au/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1', config);
        
        // 价格数据通常在 .SitePrices 中
        const allPrices = pricesRes.data.SitePrices || (Array.isArray(pricesRes.data) ? pricesRes.data : []);

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

        // 排序并取前3
        const finalData = results.sort((a, b) => a.p - b.p).slice(0, 3);
        res.status(200).json(finalData);

    } catch (error) {
        res.status(500).json({ error: "Fetch Error", msg: error.message });
    }
}
