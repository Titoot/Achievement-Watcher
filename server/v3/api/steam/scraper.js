import request from "@xan105/request";
import htmlParser from "node-html-parser";
import * as steamAPI from "../steam/steam.js"; 

export default async function getAchievementList(appID){
  
    console.log("getDataFromSteamCommunity");
    
    if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "EINVALIDAPPID";
    
    const url = `https://steamcommunity.com/stats/${appID}/achievements/`;
    
    const { body } = await request(url);
    
    const html = htmlParser.parse(body);

    let result = []

    result["gameName"] = html.querySelector('.profile_small_header_texture h1').innerText;

    for (const elem of html.querySelectorAll(".achieveRow")) {
        const name = elem.querySelector(".achieveTxt h3").innerText;
        const description = elem.querySelector(".achieveTxt h5").innerText;
        const hidden = description == '';
        const icon = elem.querySelector(".achieveImgHolder img").getAttribute('src').match(/([^\\\/\:\*\?\"\<\>\|])+$/)[0].replace(".jpg","");
        const percent = elem.querySelector(".achievePercent").innerText;

        result.push({
            displayName: name,
            name: await steamAPI.getRealAchName(appID, percent),
            description: description,
            hidden: hidden,
            icon: icon,
            percent: percent
        });
    }
    
    return result;
  }