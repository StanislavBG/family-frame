import type { Express, Request, Response } from "express";
import { asyncHandler } from "../middleware";
import { HEALTH_CHECK_TIMEOUT_MS, PUBLIC_CACHE_TTL_MS, memoTTL, discardBody } from "../route-helpers";

export function registerTvRoutes(app: Express): void {
  // TV channels health check - tests which channels are accessible
  // Organized by region with Bulgaria first, then World News, then alphabetically by region
  const getTvChannels = memoTTL(async () => {
    const channelsByCountry: Record<string, Array<{ name: string; url: string; logo?: string; group?: string }>> = {
      // ============ BULGARIA (Primary) ============
      "🇧🇬 Bulgaria": [
        // Music Channels
        { name: "The Voice TV", url: "https://bss1.neterra.tv/thevoice/thevoice.m3u8", group: "Music", logo: "https://i.imgur.com/OoJSmoj.png" },
        { name: "Magic TV", url: "https://bss1.neterra.tv/magictv/magictv.m3u8", group: "Music", logo: "https://i.imgur.com/n7bcrrp.png" },
        { name: "Tiankov Folk", url: "https://streamer103.neterra.tv/tiankov-folk/live.m3u8", group: "Music", logo: "https://i.imgur.com/VKY4q64.png" },
        { name: "Tiankov Orient Folk", url: "https://streamer103.neterra.tv/tiankov-orient/live.m3u8", group: "Music", logo: "https://i.postimg.cc/KYNvL1ML/tiankovorientfolk.png" },
        { name: "City TV", url: "https://tv.city.bg/play/tshls/citytv/index.m3u8", group: "Music", logo: "https://i.imgur.com/qJvMbNH.png" },
        // Entertainment & Culture
        { name: "This is Bulgaria HD", url: "https://streamer103.neterra.tv/thisisbulgaria/live.m3u8", group: "Entertainment", logo: "https://i.imgur.com/062jkXw.png" },
        { name: "Travel TV", url: "https://streamer103.neterra.tv/travel/live.m3u8", group: "Travel", logo: "https://i.imgur.com/5xllfed.png" },
        { name: "TV1", url: "https://tv1.cloudcdn.bg/tv1/livestream.m3u8", group: "Entertainment", logo: "https://i.imgur.com/LVHK1mW.png" },
        { name: "Evrokom", url: "https://live.ecomservice.bg/hls/stream.m3u8", group: "Entertainment", logo: "https://i.imgur.com/8JvT9Yw.png" },
        // News & Information
        { name: "Bulgaria ON AIR", url: "https://edge1.cdn.bg:2006/fls/bonair.stream/playlist.m3u8", group: "News", logo: "https://i.imgur.com/YFZYJFN.png" },
        { name: "Kanal 0", url: "https://old.rn-tv.com/k0/stream.m3u8", group: "News", logo: "https://i.imgur.com/0kqJhHz.png" },
        // Regional
        { name: "TV Zagora", url: "http://zagoratv.ddns.net:8080/tvzagora.m3u8", group: "Regional", logo: "https://i.imgur.com/JxLHvfM.png" },
        { name: "DSTV", url: "http://46.249.95.140:8081/hls/data.m3u8", group: "Regional", logo: "https://i.imgur.com/bHWJZcY.png" },
        // Religious & Educational
        { name: "Hope Channel Bulgaria", url: "https://hc1.hopetv.bg/live/hopetv_all.smil/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/wvJ5PeX.png" },
        { name: "Plovdivska Pravoslavna TV", url: "http://78.130.149.196:1935/live/pptv.stream/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/TCqMqpM.png" },
        { name: "Light Channel", url: "https://streamer1.streamhost.org/salive/GMIlcbgM/playlist.m3u8", group: "Religious", logo: "https://i.imgur.com/pQlBXJc.png" },
        // International (Bulgarian)
        { name: "BNT 4 (World)", url: "https://viamotionhsi.netplus.ch/live/eds/bntworld/browser-HLS8/bntworld.m3u8", group: "International", logo: "https://i.imgur.com/LkXLDfm.png" },
        // Specialty
        { name: "Agro TV", url: "https://restr2.bgtv.bg/agro/hls/agro.m3u8", group: "Specialty", logo: "https://i.imgur.com/HVKjGjz.png" },
        { name: "100% Auto Moto TV", url: "http://100automoto.tv:1935/bgtv1/autotv/playlist.m3u8", group: "Specialty", logo: "https://i.imgur.com/GfDvKHv.png" },
        { name: "MM TV", url: "https://streamer103.neterra.tv/mmtv/mmtv.smil/playlist.m3u8", group: "Entertainment", logo: "https://i.imgur.com/QjYmVJf.png" },
        { name: "RMTV", url: "https://transcoder1.bitcare.eu/streaming/rimextv/rmtv.m3u8", group: "Entertainment", logo: "https://i.imgur.com/yqKKMnf.png" },
        { name: "Wness TV", url: "https://wness103.neterra.tv/wness/wness.smil/playlist.m3u8", group: "Lifestyle", logo: "https://i.imgur.com/kF5JNXN.png" },
      ],

      // ============ KIDS (Free Public Channels) ============
      "👶 Kids": [
        // USA
        { name: "PBS Kids", url: "https://livestream.pbskids.org/out/v1/14507d931bbe48a69287e4850e53443c/est.m3u8", group: "USA", logo: "https://i.imgur.com/mWLt6wY.png" },
        // Germany
        { name: "KiKA", url: "https://viamotionhsi.netplus.ch/live/eds/kikahd/browser-HLS8/kikahd.m3u8", group: "Germany", logo: "https://i.imgur.com/zVJQNfX.png" },
        { name: "Disney Channel DE", url: "https://viamotionhsi.netplus.ch/live/eds/disneychannelde/browser-HLS8/disneychannelde.m3u8", group: "Germany", logo: "https://i.imgur.com/tZLDXPq.png" },
        // Italy
        { name: "Rai Yoyo", url: "https://mediapolis.rai.it/relinker/relinkerServlet.htm?cont=746899", group: "Italy", logo: "https://i.imgur.com/NV8nqGU.png" },
        { name: "Rai Gulp", url: "https://viamotionhsi.netplus.ch/live/eds/raigulp/browser-HLS8/raigulp.m3u8", group: "Italy", logo: "https://i.imgur.com/TkKXzMa.png" },
        { name: "BeJoy Kids", url: "https://64b16f23efbee.streamlock.net/bejoy/bejoy/playlist.m3u8", group: "Italy", logo: "https://i.imgur.com/KQLnKcJ.png" },
        // Spain
        { name: "Clan TVE", url: "https://dum8zv1rbdjj2.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-x6uutpgph4tpt/ClanES.m3u8", group: "Spain", logo: "https://i.imgur.com/nBZrqvM.png" },
        // South Korea
        { name: "EBS Kids", url: "https://ebsonair.ebs.co.kr/ebs1familypc/familypc1m/playlist.m3u8", group: "Korea", logo: "https://i.imgur.com/5xGbMWt.png" },
      ],

      // ============ WORLD NEWS (International) ============
      "🌍 World News": [
        { name: "Al Jazeera English", url: "https://live-hls-web-aje.getaj.net/AJE/index.m3u8", group: "News", logo: "https://i.imgur.com/GJmLFzF.png" },
        { name: "France 24 English", url: "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8", group: "News", logo: "https://i.imgur.com/nTp4h4h.png" },
        { name: "France 24 French", url: "https://live.france24.com/hls/live/2037179/F24_FR_HI_HLS/master_5000.m3u8", group: "News", logo: "https://i.imgur.com/nTp4h4h.png" },
        { name: "DW English", url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8", group: "News", logo: "https://i.imgur.com/A1xzjOI.png" },
        { name: "DW Deutsch", url: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8", group: "News", logo: "https://i.imgur.com/A1xzjOI.png" },
        { name: "Euronews English", url: "https://viamotionhsi.netplus.ch/live/eds/euronews/browser-HLS8/euronews.m3u8", group: "News", logo: "https://i.imgur.com/7MBmUgR.png" },
        { name: "RT News", url: "https://rt-glb.rttv.com/live/rtnews/playlist.m3u8", group: "News", logo: "https://i.imgur.com/8gWDnIw.png" },
        { name: "NHK World Japan", url: "https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/domestic/263942/live.m3u8", group: "News", logo: "https://i.imgur.com/z0TbRUV.png" },
        { name: "Arirang TV Korea", url: "http://amdlive-ch01.ctnd.com.edgesuite.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8", group: "News", logo: "https://i.imgur.com/fLvHpCL.png" },
        { name: "CGTN", url: "https://news.cgtn.com/resource/live/english/cgtn-news.m3u8", group: "News", logo: "https://i.imgur.com/T5xds9w.png" },
      ],

      // ============ EUROPE ============
      "🇩🇪 Germany": [
        { name: "Das Erste", url: "https://daserste-live.ard-mcdn.de/daserste/live/hls/int/master.m3u8", group: "Public", logo: "https://i.imgur.com/rJgRxnA.png" },
        { name: "ZDF", url: "https://viamotionhsi.netplus.ch/live/eds/zdfhd/browser-HLS8/zdfhd.m3u8", group: "Public", logo: "https://i.imgur.com/9sVBnvH.png" },
        { name: "Tagesschau 24", url: "https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8", group: "News", logo: "https://i.imgur.com/5CMVoTy.png" },
        { name: "Phoenix", url: "https://viamotionhsi.netplus.ch/live/eds/phoenixhd/browser-HLS8/phoenixhd.m3u8", group: "News", logo: "https://i.imgur.com/xYyNDQT.png" },
        { name: "ARD-alpha", url: "https://mcdn.br.de/br/fs/ard_alpha/hls/de/master.m3u8", group: "Education", logo: "https://i.imgur.com/WprNwGJ.png" },
        { name: "hr-fernsehen", url: "https://hrhls.akamaized.net/hls/live/2024525/hrhls/index.m3u8", group: "Regional", logo: "https://i.imgur.com/6vYkRqY.png" },
        { name: "WDR", url: "https://wdr-live.ard-mcdn.de/wdr/live/hls/de/master.m3u8", group: "Regional", logo: "https://i.imgur.com/KqPLUeX.png" },
        { name: "NDR Hamburg", url: "https://mcdn.ndr.de/ndr/hls/ndr_fs/ndr_hh/master.m3u8", group: "Regional", logo: "https://i.imgur.com/xdYNzKX.png" },
      ],
      "🇫🇷 France": [
        { name: "France 2", url: "https://viamotionhsi.netplus.ch/live/eds/france2hd/browser-HLS8/france2hd.m3u8", group: "Public", logo: "https://i.imgur.com/pbmqYmV.png" },
        { name: "France 3", url: "https://viamotionhsi.netplus.ch/live/eds/france3hd/browser-HLS8/france3hd.m3u8", group: "Public", logo: "https://i.imgur.com/XWNcqMP.png" },
        { name: "France 5", url: "https://viamotionhsi.netplus.ch/live/eds/france5hd/browser-HLS8/france5hd.m3u8", group: "Public", logo: "https://i.imgur.com/wBnXOUn.png" },
        { name: "Arte", url: "https://viamotionhsi.netplus.ch/live/eds/artehd/browser-HLS8/artehd.m3u8", group: "Culture", logo: "https://i.imgur.com/9KI9VvS.png" },
        { name: "TF1", url: "https://viamotionhsi.netplus.ch/live/eds/tf1hd/browser-HLS8/tf1hd.m3u8", group: "Entertainment", logo: "https://i.imgur.com/Gm4XYmT.png" },
        { name: "Franceinfo", url: "https://viamotionhsi.netplus.ch/live/eds/franceinfo/browser-HLS8/franceinfo.m3u8", group: "News", logo: "https://i.imgur.com/cC5IK6q.png" },
        { name: "BFM TV", url: "https://viamotionhsi.netplus.ch/live/eds/bfmtv/browser-HLS8/bfmtv.m3u8", group: "News", logo: "https://i.imgur.com/fZ8OhBr.png" },
        { name: "TV5Monde", url: "https://viamotionhsi.netplus.ch/live/eds/tv5mondefbs/browser-HLS8/tv5mondefbs.m3u8", group: "International", logo: "https://i.imgur.com/6j1Bsxu.png" },
      ],
      "🇮🇹 Italy": [
        { name: "Rai 1", url: "https://viamotionhsi.netplus.ch/live/eds/rai1/browser-HLS8/rai1.m3u8", group: "Public", logo: "https://i.imgur.com/GnVGqxP.png" },
        { name: "Rai 2", url: "https://viamotionhsi.netplus.ch/live/eds/rai2/browser-HLS8/rai2.m3u8", group: "Public", logo: "https://i.imgur.com/nzP6Qe1.png" },
        { name: "Rai 3", url: "https://viamotionhsi.netplus.ch/live/eds/rai3/browser-HLS8/rai3.m3u8", group: "Public", logo: "https://i.imgur.com/6rRFwQE.png" },
        { name: "Rai News 24", url: "https://viamotionhsi.netplus.ch/live/eds/rainews/browser-HLS8/rainews.m3u8", group: "News", logo: "https://i.imgur.com/NQZBcvJ.png" },
        { name: "La7", url: "https://viamotionhsi.netplus.ch/live/eds/la7/browser-HLS8/la7.m3u8", group: "Entertainment", logo: "https://i.imgur.com/Gj8mHVu.png" },
        { name: "Canale 5", url: "https://viamotionhsi.netplus.ch/live/eds/canale5/browser-HLS8/canale5.m3u8", group: "Entertainment", logo: "https://i.imgur.com/qxlZXpT.png" },
        { name: "Rai Gulp", url: "https://viamotionhsi.netplus.ch/live/eds/raigulp/browser-HLS8/raigulp.m3u8", group: "Kids", logo: "https://i.imgur.com/TkKXzMa.png" },
        { name: "Rai Scuola", url: "https://viamotionhsi.netplus.ch/live/eds/raiscuola/browser-HLS8/raiscuola.m3u8", group: "Education", logo: "https://i.imgur.com/JqLPnEj.png" },
      ],
      "🇪🇸 Spain": [
        { name: "La 1 (TVE)", url: "https://ztnr.rtve.es/ztnr/1688877.m3u8", group: "Public", logo: "https://i.imgur.com/QJvbpnL.png" },
        { name: "La 2 (TVE)", url: "https://ztnr.rtve.es/ztnr/1688885.m3u8", group: "Public", logo: "https://i.imgur.com/z0BQxWH.png" },
        { name: "Canal 24 Horas", url: "https://ztnr.rtve.es/ztnr/1694255.m3u8", group: "News", logo: "https://i.imgur.com/Zcy2kM3.png" },
        { name: "Telemadrid", url: "https://telemadrid-23-secure2.akamaized.net/master.m3u8", group: "Regional", logo: "https://i.imgur.com/xVZ6iYL.png" },
      ],
      "🇬🇷 Greece": [
        { name: "ERT 1", url: "https://ert-live-bcbs15228.siliconweb.com/media/ert1/ert1.m3u8", group: "Public", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT 2", url: "https://ert-live-bcbs15228.siliconweb.com/media/ert2/ert2.m3u8", group: "Public", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT 3", url: "https://ert-live-bcbs15228.siliconweb.com/media/ert3/ert3.m3u8", group: "Regional", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT Sports", url: "https://ert-live-bcbs15228.siliconweb.com/media/ertsports/ertsports.m3u8", group: "Sports", logo: "https://i.imgur.com/Z8rZZVn.png" },
        { name: "ERT World", url: "https://ert-live-bcbs15228.siliconweb.com/media/ertworld/ertworld.m3u8", group: "International", logo: "https://i.imgur.com/Z8rZZVn.png" },
      ],
      "🇷🇸 Serbia": [
        { name: "RTS 1", url: "https://rts1.streaming.rs/rts1/rts1.m3u8", group: "Public", logo: "https://i.imgur.com/4K1rQXZ.png" },
        { name: "RTS 2", url: "https://rts2.streaming.rs/rts2/rts2.m3u8", group: "Public", logo: "https://i.imgur.com/4K1rQXZ.png" },
        { name: "Pink TV", url: "http://pink.streaming.rs/pink/pink.m3u8", group: "Entertainment", logo: "https://i.imgur.com/aDNqJ1Y.png" },
        { name: "B92", url: "http://b92.streaming.rs/b92/b92.m3u8", group: "Entertainment", logo: "https://i.imgur.com/4rPQCMF.png" },
        { name: "Happy TV", url: "http://happy.streaming.rs/happy/happy.m3u8", group: "Entertainment", logo: "https://i.imgur.com/5jKQ5pM.png" },
      ],
      "🇵🇱 Poland": [
        { name: "TVP World", url: "https://dash2.antik.sk/live/test_tvp_world/playlist.m3u8", group: "International", logo: "https://i.imgur.com/vRTnMXA.png" },
        { name: "TVP Polonia", url: "https://viamotionhsi.netplus.ch/live/eds/tvpolonia/browser-HLS8/tvpolonia.m3u8", group: "International", logo: "https://i.imgur.com/vRTnMXA.png" },
        { name: "TVP Info", url: "https://dash4.antik.sk/live/test_tvp_info/playlist.m3u8", group: "News", logo: "https://i.imgur.com/vRTnMXA.png" },
        { name: "TV Biznesowa", url: "https://s-pl-01.mediatool.tv/playout/tbpl-abr/index.m3u8", group: "Business", logo: "https://i.imgur.com/JBKiMVx.png" },
      ],
      "🇹🇷 Turkey": [
        { name: "TRT 1", url: "https://trt.daioncdn.net/trt-1/master.m3u8?app=web", group: "Public", logo: "https://i.imgur.com/XNQHX1A.png" },
        { name: "TRT 2", url: "https://tv-trt2.medya.trt.com.tr/master.m3u8", group: "Culture", logo: "https://i.imgur.com/XNQHX1A.png" },
        { name: "TRT Haber", url: "https://tv-trthaber.medya.trt.com.tr/master.m3u8", group: "News", logo: "https://i.imgur.com/XNQHX1A.png" },
        { name: "Habertürk", url: "https://ciner-live.daioncdn.net/haberturktv/haberturktv.m3u8", group: "News", logo: "https://i.imgur.com/vYKlJmS.png" },
        { name: "NTV Turkey", url: "https://dogus-live.daioncdn.net/ntv/ntv.m3u8", group: "News", logo: "https://i.imgur.com/dSLQCLJ.png" },
        { name: "Kanal D", url: "https://demiroren.daioncdn.net/kanald/kanald.m3u8?app=kanald_web&ce=3", group: "Entertainment", logo: "https://i.imgur.com/yVJXpcZ.png" },
        { name: "Halk TV", url: "https://halktv-live.daioncdn.net/halktv/halktv.m3u8", group: "News", logo: "https://i.imgur.com/xN4P4VJ.png" },
        { name: "Tele 1", url: "https://tele1-live.ercdn.net/tele1/tele1.m3u8", group: "News", logo: "https://i.imgur.com/TxVSJDG.png" },
      ],
      "🇷🇺 Russia": [
        { name: "Channel One", url: "https://edge1.1internet.tv/live-cdn/pervyi/tracks-v1a1/mono.m3u8", group: "Public", logo: "https://i.imgur.com/cZUxvlM.png" },
        { name: "Russia 1", url: "https://edge1.1internet.tv/live-cdn/russia1/tracks-v1a1/mono.m3u8", group: "Public", logo: "https://i.imgur.com/2P7xvYb.png" },
        { name: "NTV Russia", url: "https://edge1.1internet.tv/live-cdn/ntv/tracks-v1a1/mono.m3u8", group: "Entertainment", logo: "https://i.imgur.com/dYk8WCx.png" },
        { name: "Zvezda", url: "https://live-cdn.zvezda.ru/live/zvezda/tracks-v1a1/mono.m3u8", group: "News", logo: "https://i.imgur.com/6qLLc8H.png" },
      ],

      // ============ AMERICAS ============
      "🇺🇸 USA": [
        { name: "ABC News", url: "https://content.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8", group: "News", logo: "https://i.imgur.com/5kLLe2G.png" },
        { name: "NBC News NOW", url: "https://d1bl6tskrpq9ze.cloudfront.net/hls/master.m3u8", group: "News", logo: "https://i.imgur.com/m8G7RBj.png" },
        { name: "Newsmax", url: "https://nmx1ota.akamaized.net/hls/live/2107010/Live_1/index.m3u8", group: "News", logo: "https://i.imgur.com/bBMVw6r.png" },
        { name: "Bloomberg US", url: "https://bloomberg.com/media-manifest/streams/us.m3u8", group: "Business", logo: "https://i.imgur.com/DqKlQPr.png" },
        { name: "Cheddar News", url: "https://cheddar-us.samsung.wurl.tv/playlist.m3u8", group: "Business", logo: "https://i.imgur.com/x9QFVMX.png" },
        { name: "Fox Weather", url: "https://247wlive.foxweather.com/stream/index.m3u8", group: "Weather", logo: "https://i.imgur.com/HvpLYEv.png" },
        { name: "Court TV", url: "https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01438-ewscrippscompan-courttv-tablo/playlist.m3u8", group: "Legal", logo: "https://i.imgur.com/YIIlnVY.png" },
        { name: "Scripps News", url: "https://content.uplynk.com/channel/4bb4901b934c4e029fd4c1abfc766c37.m3u8", group: "News", logo: "https://i.imgur.com/7xKL9vF.png" },
      ],
      "🇧🇷 Brazil": [
        { name: "TV Brasil", url: "https://tvbrasil-stream.ebc.com.br/index.m3u8", group: "Public", logo: "https://i.imgur.com/KG6CQZl.png" },
        { name: "Record News", url: "https://rnw-rn.otteravision.com/rnw/rn/rnw_rn.m3u8", group: "News", logo: "https://i.imgur.com/1vXbsMM.png" },
        { name: "TV Cultura", url: "https://player-tvcultura.stream.uol.com.br/live/tvcultura.m3u8", group: "Culture", logo: "https://i.imgur.com/y6LHQl8.png" },
        { name: "TV Câmara", url: "https://stream3.camara.gov.br/tv1/manifest.m3u8", group: "Government", logo: "https://i.imgur.com/6TfL5Ua.png" },
        { name: "Canal Educação", url: "https://canaleducacao-stream.ebc.com.br/index.m3u8", group: "Education", logo: "https://i.imgur.com/cR7PJGQ.png" },
        { name: "Jovem Pan News", url: "https://d6yfbj4xxtrod.cloudfront.net/out/v1/7836eb391ec24452b149f3dc6df15bbd/index.m3u8", group: "News", logo: "https://i.imgur.com/6pXMnqs.png" },
      ],
      "🇦🇷 Argentina": [
        { name: "El Trece", url: "https://live-01-02-eltrece.vodgc.net/eltrecetv/index.m3u8", group: "Entertainment", logo: "https://i.imgur.com/dVaU6LQ.png" },
        { name: "Canal 26", url: "https://stream-gtlc.telecentro.net.ar/hls/canal26hls/main.m3u8", group: "News", logo: "https://i.imgur.com/xF9hLgN.png" },
        { name: "America TV", url: "https://prepublish.f.qaotic.net/a07/americahls-100056/playlist_720p.m3u8", group: "Entertainment", logo: "https://i.imgur.com/xfN4p9F.png" },
        { name: "Canal E", url: "https://unlimited1-us.dps.live/perfiltv/perfiltv.smil/playlist.m3u8", group: "Business", logo: "https://i.imgur.com/7wD2vhT.png" },
      ],

      // ============ ASIA ============
      "🇯🇵 Japan": [
        { name: "NHK World", url: "https://nhkworld.webcdn.stream.ne.jp/www11/nhkworld-tv/domestic/263942/live.m3u8", group: "Public", logo: "https://i.imgur.com/z0TbRUV.png" },
        { name: "Weathernews", url: "https://weather-live-hls01e.akamaized.net/ade36978-4ad3-48de-91ab-7d6edd0b6388/11ed8ed8ca.ism/manifest(format=m3u8-aapl-v3,audio-only=false).m3u8", group: "Weather", logo: "https://i.imgur.com/8NWYKQx.png" },
        { name: "QVC Japan", url: "https://cdn-live1.qvc.jp/iPhone/1501/1501.m3u8", group: "Shopping", logo: "https://i.imgur.com/nnc4Kgh.png" },
      ],
      "🇰🇷 South Korea": [
        { name: "KTV Korea", url: "https://hlive.ktv.go.kr/live/klive_h.stream/playlist.m3u8", group: "Government", logo: "https://i.imgur.com/cPqfGKz.png" },
        { name: "Arirang TV", url: "http://amdlive-ch01.ctnd.com.edgesuite.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8", group: "International", logo: "https://i.imgur.com/fLvHpCL.png" },
        { name: "TBS Seoul", url: "https://cdntv.tbs.seoul.kr/tbs/tbs_tv_web.smil/playlist.m3u8", group: "Regional", logo: "https://i.imgur.com/VxQMk5x.png" },
        { name: "EBS 1", url: "https://ebsonair.ebs.co.kr/ebs1familypc/familypc1m/playlist.m3u8", group: "Education", logo: "https://i.imgur.com/5xGbMWt.png" },
      ],
      "🇮🇳 India": [
        { name: "NDTV 24x7", url: "https://ndtv24x7elemarchana.akamaized.net/hls/live/2003678/ndtv24x7/master.m3u8", group: "News", logo: "https://i.imgur.com/QQBbZxO.png" },
        { name: "India TV", url: "https://pl-indiatvnews.akamaized.net/out/v1/db79179b608641ceaa5a4d0dd0dca8da/index.m3u8", group: "News", logo: "https://i.imgur.com/F9Y5Txy.png" },
        { name: "ABP News", url: "https://d2l4ar6y3mrs4k.cloudfront.net/live-streaming/abpnews-livetv/master.m3u8", group: "News", logo: "https://i.imgur.com/2XbCzxF.png" },
        { name: "CNBC TV18", url: "https://n18syndication.akamaized.net/bpk-tv/CNBC_TV18_NW18_MOB/output01/index.m3u8", group: "Business", logo: "https://i.imgur.com/dKNwSxq.png" },
        { name: "Sansad TV", url: "https://playhls.media.nic.in/hls/live/lstv/lstv.m3u8", group: "Government", logo: "https://i.imgur.com/xm7WYoV.png" },
      ],
    };

    // Helper to check if a channel is healthy
    async function checkChannel(channel: { name: string; url: string; logo?: string }) {
      try {
        const response = await fetch(channel.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
          redirect: "follow",
        });
        await discardBody(response);

        return response.status === 200 || response.status === 302 || response.status === 405;
      } catch {
        // Try GET for streams that don't support HEAD
        try {
          const response = await fetch(channel.url, {
            method: "GET",
            signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
            redirect: "follow",
          });
          await discardBody(response);

          return response.status === 200 || response.status === 302;
        } catch {
          return false;
        }
      }
    }

    // Test all channels in parallel and group by country
    const result: Record<string, Array<{ name: string; url: string; logo?: string }>> = {};
    
    await Promise.all(
      Object.entries(channelsByCountry).map(async ([country, channels]) => {
        const healthyChannels = await Promise.all(
          channels.map(async (channel) => {
            const isHealthy = await checkChannel(channel);
            return isHealthy ? channel : null;
          })
        );
        result[country] = healthyChannels.filter((c): c is typeof channels[0] => c !== null);
      })
    );

    return result;
  }, PUBLIC_CACHE_TTL_MS);

  app.get("/api/tv/channels", asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getTvChannels());
  }));
}
