import request from "@xan105/request";
import htmlParser from "node-html-parser";
import * as steamAPI from "../steam/steam.js"; 

export default async function getAchievementList(appID){
  
    console.log("getDataFromSteamCommunity");
    
    if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "EINVALIDAPPID";
    
    const url = `https://steamhunters.com/apps/${appID}/achievements`;
    
    const { body } = await request(url);
    
    const html = htmlParser.parse(body);

    let result = []

    result["gameName"] = html.querySelector('span.text-ellipsis.app-name.after').innerText;

    const scriptContent = html.querySelectorAll("script")[29].innerHTML;
    const AchListMatch = scriptContent.match(/model:\s*({[\s\S].*}\]),.+?"page"/);
    const AchList = AchListMatch ? AchListMatch[1] : null;

    if (!AchList) throw "ENOACHIEVEMENTLIST"

    let AchData = JSON.parse(`${AchList}}}}`);
    AchData = AchData.listData.pagedList.items

    for (const item of AchData) {
        result.push({
            displayName: item.name,
            name: item.apiName,
            description: item.description,
            hidden: item.hidden,
            icon: item.icon,
            icongray: item.iconGray,
            percent: `${item.steamPercentage.toFixed(1)}%`
        });
    }
    
    return result;
  }