'use strict';

const os = require('os');
const path = require('path');
const fs = require('@xan105/fs');
const request = require('@xan105/request');
const regedit = require('regodit');
const WQL = require('wql-process-monitor');
const humanizeDuration = require("humanize-duration");
const EventEmitter = require("emittery");
const tasklist = require('win-tasklist');
const Timer = require('./timer.js');
const TimeTrack = require('./track.js');
const { findByReadingContentOfKnownConfigfilesIn } = require('./steam_appid_find.js');

const debug = new (require("@xan105/log"))({
  console: true,
  file: path.join(process.env['APPDATA'],"Achievement Watcher/logs/playtime.log")
});

const blacklist = require("./filter.json");

const systemTempDir = os.tmpdir() || process.env['TEMP'] || process.env['TMP'];

const filter = {
	ignore: blacklist.ignore, //WMI WQL FILTER
	mute: {
		dir: [
      systemTempDir,
			process.env['USERPROFILE'],
			process.env['APPDATA'],
			process.env['LOCALAPPDATA'],
			process.env['ProgramFiles'],
			process.env['ProgramFiles(x86)'],
			path.join(process.env['SystemRoot'],"System32"),
			path.join(process.env['SystemRoot'],"SysWOW64")
		],
		file: blacklist.mute
	}	
};

async function init(){

	const emitter = new EventEmitter();

	let nowPlaying = [];
	let gameIndex = await getGameIndex();

	await WQL.promises.createEventSink();
	const processMonitor = await WQL.promises.subscribe({ 
		/*
		Elevated process (scene release are usually UAC elevated via appcompatibility out of the box)
		Set built-in filter to false 
		cf: https://github.com/xan105/node-processMonitor/issues/2
		*/
		filterWindowsNoise: false, filterUsualProgramLocations: false,
		filter: filter.ignore 
	});

	processMonitor.on("creation", async ([process,pid,filepath]) => {

	  //Mute event
	  if (!filepath) return;
	  if (filter.mute.dir.some( dirpath => path.parse(filepath).dir.toLowerCase().startsWith(dirpath.toLowerCase()))) return;
	  if (filter.mute.file.some( bin => bin.toLowerCase() === process.toLowerCase() )) return;
	  
    const games = gameIndex.filter(game => ( game.binary.toLowerCase() === process.toLowerCase() ||
                                             game.binary.replace(".exe","-Win64-Shipping.exe").toLowerCase() === process.toLowerCase() //thanks UE -.-'
                                           ) && !game.name.toLowerCase().includes("demo")
    );
	  
	  let game;
	  
    if (games.length === 1) { //single hit
      game = games[0];
    }
	  else if (games.length > 1) { //more than one
      debug.log(`More than 1 entry for "${process}"`);
      const gameDir = path.parse(filepath).dir;
      debug.log(`Try to find appid from a cfg file in "${gameDir}"`);
      try{
        const appid = await findByReadingContentOfKnownConfigfilesIn(gameDir);
        debug.log(`Found appid: ${appid}`);
        game = games.find(game => game.appid == appid);
      }catch(err){
        debug.warn(err);
      }
 
    }

	  if(!game) return;
    debug.log(`DB Hit for ${game.name}(${game.appid}) ["${filepath}"]`);
    
    //RunningAppID is not that reliable and this intefere with Greenluma; Commenting out for now
    /*const runningAppID = await regedit.promises.RegQueryIntegerValue("HKCU","SOFTWARE/Valve/Steam", "RunningAppID") || 0;
    if (+runningAppID == game.appid){
      debug.warn("RunningAppID found! Checking if Steam is running...");
      const isSteamRunning = await tasklist.isProcessRunning("steam.exe").catch((err) => { return false });
      if (isSteamRunning){
        debug.warn("Ignoring game launched by Steam");
        return;
      }
    }*/
    
    if (!nowPlaying.includes(game)) { //Only one instance allowed

      const playing = Object.assign(game,{ 
        pid: pid,
        timer: new Timer
      });
      debug.log(playing);
        
      nowPlaying.push(playing);
        
    } else {
      debug.warn("Only one game instance allowed");
    }
    
    emitter.emit("notify", [game]);
	});

	processMonitor.on("deletion",([process,pid]) => {
	  
	  const game = nowPlaying.find(game => game.pid === pid && ( game.binary.toLowerCase() === process.toLowerCase() ||
                                                               game.binary.replace(".exe","-Win64-Shipping.exe").toLowerCase() === process.toLowerCase() //thanks UE -.-'
                                                             )
    );
    
	  if (!game) return;
	  
		debug.log(`Stop playing ${game.name}(${game.appid})`);
		game.timer.stop();
		const playedtime = game.timer.played;
		
		let index = nowPlaying.indexOf(game);
		if (index !== -1) { nowPlaying.splice(index, 1); } //remove from nowPlaying
	 
		debug.log("playtime: " + Math.floor( playedtime / 60 ) + "min");
		
		let humanized;
		if (playedtime < 60) {
			humanized = humanizeDuration(playedtime * 1000, { language: "en", units: ["s"] }); 
		} else {
			humanized = humanizeDuration(playedtime * 1000, { language: "en", conjunction: " and ", units: ["h", "m"], round: true });
		}
		
		TimeTrack(game.appid,playedtime).catch((err)=>{debug.error(err)});
		
		emitter.emit("notify", [game, "You played for " + humanized]);

	});

	return emitter;
};

async function getGameIndex(){
	
	//Temporary esm in cjs load | REPLACE ME when using ESM !
	//Warning @xan105/is targets >= node16 but should be fine.
	const { shouldArrayOfObjWithProperties } = (await import("@xan105/is")).assert;
	
	const filePath = {
    cache: path.join(process.env['APPDATA'],"Achievement Watcher/steam_cache/schema","gameIndex.json"),
    user: path.join(process.env['APPDATA'],"Achievement Watcher/cfg","gameIndex.json")
  };
	
	let gameIndex, userOverride;
	
	try{
		if (await fs.existsAndIsYoungerThan(filePath.cache,{timeUnit: 'd', time: 1})) {
			gameIndex = JSON.parse( await fs.readFile(filePath.cache,"utf8") );
		} else {
			try{
				gameIndex = ( await request.getJson("http://localhost/v2/steam/gameindex") ).data;
				debug.log("[Playtime] gameIndex updated");
				await fs.writeFile(filePath.cache,JSON.stringify(gameIndex),"utf8").catch((err)=>{debug.error(err)});
			}catch(err){
				debug.error(err);
				gameIndex = JSON.parse( await fs.readFile(filePath.cache,"utf8") );
			}
		}
		debug.log(`[Playtime] gameIndex loaded ! ${gameIndex.length} game(s)`);
	}catch(err){
		debug.error(err);
		gameIndex = [];
	}
	
	try{
    userOverride = JSON.parse( await fs.readFile(filePath.user,"utf8") );
    shouldArrayOfObjWithProperties(userOverride, ["appid","name","binary"]);
    debug.log(`[Playtime] user gameIndex loaded ! ${userOverride.length} override(s)`);
	}catch(err){
    debug.error(err);
    userOverride = [];
  }
  
  //Merge (assign) arrB in arrA using prop as unique key
  const mergeArrayOfObj = (arrA, arrB, prop) => arrA.filter(a => !arrB.find(b => a[prop] === b[prop])).concat(arrB);
  return mergeArrayOfObj(gameIndex, userOverride, "appid");
}

module.exports = { init };