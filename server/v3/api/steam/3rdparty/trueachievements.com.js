import path from "path";
import request from "@xan105/request";
import * as fs from "@xan105/fs";
import htmlParser from "node-html-parser";

import { require } from "../../../util/esm.js";
const { folder } = require("./config.json");
//const { misc: { achievementstats : apiKey }  } = require("./key.json");

export default async function getHiddenDescriptionFromCacheOrRemote(appID, gameName){

  console.log("getHiddenDescriptionFromCacheOrRemote");
  
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw "EINVALIDAPPID";

  const filepath = path.join(folder.cache,"steam/schema/english/hidden_desc",`${appID}.json`);
  
  let result;
  
  if (await fs.existsAndIsYoungerThan(filepath,{timeUnit: 'M', time: 1})) 
  {
    
    console.log("> from cache");
    
    result = JSON.parse(await fs.readFile(filepath));
  }
  else 
  {
    try
    {
      
      console.log("> from remote");

      const name = gameName.replace(':', '').replace(/\s+/g, '-')
      
      const url = `https://www.trueachievements.com/game/${name}/achievements`;

      const { body } = await request(url);
  
      const html = htmlParser.parse(body);
      
      if (!html) throw "EUNEXPECTEDNODATA";
      
       
      result = [];
      const panels = html.querySelectorAll('.ach-panels');

      if(!panels) throw "GAMENOTFOUND";

      for(const li of panels){
        for(const elem of li.querySelectorAll('li')){
          const apiName = elem.querySelector('a').innerText;
          const description = elem.querySelector('p').innerText;

          result.push({
            apiName: apiName,
            description: description
          });
      }
      }

      if (result.length === 0) throw "EUNEXPECTEDEMPTY"; 
       
      fs.writeFile(filepath,JSON.stringify(result, null, 2)).catch(()=>{});
    }
    catch(err)
    {
      if (await fs.exists(filepath))
      {
        console.log("> fallback to previous data");
        result = JSON.parse(await fs.readFile(filepath));
      } 
      else 
      {
        throw err;
      }
    }
  }
  
  return result;
}
