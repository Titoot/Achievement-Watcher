import request from "@xan105/request";
import productInfoRequest from "./steamClient.js";
import { 
  getSteamGameInfoFromCacheOrRemote,
  getAchievementListFromCacheOrRemote,
  getUserAchievement,
  getServerGameIndex
} from "./steamWebApi.js";

import { require } from "../../util/esm.js";
const languages = require("./api/steam/languages.json");

export async function getSchema(appID,lang = "english"){
  
  console.log("getSchema:" + appID);
  
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "EINVALIDAPPID";
  if (!languages.some( language => language.api === lang )) throw "EUNSUPPORTEDLANG";

  const achievementList = await getAchievementListFromCacheOrRemote(appID,lang);
  const metadata = await getSteamGameInfoFromCacheOrRemote(appID);
  
  const schema = Object.assign(metadata,{achievement: achievementList});
  
  console.log("-- SCHEMA DONE --");

  return schema;
}

export async function getDataFromSteamAPI(appID){
  
  console.log("getProductInfo:" + appID);
  
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "EINVALIDAPPID";

  const url = `https://store.steampowered.com/api/appdetails?appids=${appID}`;

  const data = await request.getJson(url); //when busy return string. json parse failure

  if(data[appID].success) 
  {
    return data;
  }
  else 
  {
     throw "ENODATA"; //Game is probably no longer on sale
  }

}

export async function getRealAchName(percentData, percent){
  
  console.log("getRealAchName");
  
  if (!percentData || percentData.length <= 0) throw "EINVALIDJSONPERCENTDATA";

  if(percentData) 
  {
    for(const ach of percentData.achievementpercentages.achievements)
    {
      if(`${ach.percent.toFixed(1)}%` === percent || `${ach.percent.toFixed(1)-0.1}%` === percent)
      {
        return ach.name;
      
      }
    }
    return '';
  }
  else 
  {
     throw "ENODATA"; //Game is probably no longer on sale
  }

}

export { productInfoRequest, getUserAchievement, getServerGameIndex };