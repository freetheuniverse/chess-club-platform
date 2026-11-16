#!/usr/bin/env node
// Stream the official CC0 Lichess CSV.zst, curate a balanced set of puzzles,
// validate them with chess.js, and generate idempotent D1 SQL import batches.
// No giant archive is stored on disk. Run from the repository root.
import {createReadStream} from "node:fs";
import {mkdir,readdir,writeFile,unlink} from "node:fs/promises";
import {resolve,extname,basename} from "node:path";
import {Readable} from "node:stream";
import {createGunzip,createZstdDecompress} from "node:zlib";
import {createInterface} from "node:readline";
import {fileURLToPath} from "node:url";
import {PuzzleCurator,parseCsvLine,parsePuzzleRow,CSV_HEADER,insertSql} from "./puzzle-import-core.mjs";
import {uploadPuzzleBank} from "./upload-puzzle-bank.mjs";

const OFFICIAL="https://database.lichess.org/lichess_db_puzzle.csv.zst";
const WORKDIR=resolve(".puzzle-import");
const HERE=fileURLToPath(new URL(".",import.meta.url));
const help=`Chess Club Manager: curated Lichess puzzle importer (CC0)

Usage:
  npm run puzzles:import
  npm run puzzles:import -- --limit 12000
  npm run puzzles:import -- --source "C:\\path\\lichess_db_puzzle.csv.zst"
  npm run puzzles:prepare -- --source puzzles.csv --limit 200
  npm run puzzles:upload

Options:
  --source PATH|URL   CSV, CSV.gz or CSV.zst; default: official Lichess URL
  --limit N           Up to 50000 puzzles; default 12000 (Free-plan friendly)
  --output DIRECTORY  Generated batch location (default .puzzle-import)
  --apply             Upload SQL batches to your remote Cloudflare D1 database
  --local             With --apply, upload to local D1 instead of remote
  --help              Print this help

No puzzles or account data are sent to any third-party service by the importer.
The only download by default is from the official Lichess public dataset.
`;

export function parseImportArgs(argv){
 const opts={source:OFFICIAL,limit:12000,output:WORKDIR,apply:false,local:false,help:false};
 for(let i=0;i<argv.length;i++){
   let arg=argv[i],value;
   if(arg.includes("=")&&arg.startsWith("--")){
     [arg,value]=arg.split(/=(.*)/s,2);
   }
   if(["--source","--limit","--output"].includes(arg)){
     value=value??argv[++i];
     if(!value||value.startsWith("--"))throw Error("Missing value for "+arg);
     if(arg==="--source")opts.source=value;
     if(arg==="--output")opts.output=resolve(value);
     if(arg==="--limit")opts.limit=Number(value);
   }else if(arg==="--apply")opts.apply=true;
   else if(arg==="--local")opts.local=true;
   else if(arg==="--help"||arg==="-h")opts.help=true;
   else throw Error("Unknown option: "+arg);
 }
 if(!Number.isInteger(opts.limit)||opts.limit<1||opts.limit>50000)
   throw Error("--limit must be a whole number between 1 and 50000");
 return opts;
}
export async function sourceStream(source){
 const isOnline=/^https:\/\//.test(source);
 let stream;
 if(isOnline){
   const u=new URL(source);
   if(u.hostname!=="database.lichess.org")
     throw Error("For security, online sources must be on database.lichess.org; use --source for a local file.");
   console.log("Streaming official public puzzle dataset from "+u.href);
   const response=await fetch(u,{headers:{Accept:"application/octet-stream"}});
   if(!response.ok||!response.body)throw Error("Failed to download puzzle dataset: HTTP "+response.status);
   stream=Readable.fromWeb(response.body);
 }else{
   console.log("Reading local puzzle dataset: "+resolve(source));
   stream=createReadStream(resolve(source));
 }
 const name=isOnline?new URL(source).pathname:source;
 if(name.endsWith(".zst")) {
   if(typeof createZstdDecompress!=="function")
     throw Error("Zstandard needs Node 22.15 or newer. Update Node.js and try again.");
   return stream.pipe(createZstdDecompress());
 }
 if(name.endsWith(".gz"))return stream.pipe(createGunzip());
 if(name.endsWith(".csv"))return stream;
 throw Error("Puzzle source must end in .csv, .csv.gz or .csv.zst");
}
export async function preparePuzzleBank({source,limit,output}){
 const stream=await sourceStream(source);
 const curator=new PuzzleCurator(limit);
 const reader=createInterface({input:stream,crlfDelay:Infinity});
 let columns=null,skipped=0;
 console.log("Curating up to "+limit.toLocaleString()+" positions across topics and ratings…");
 try{
   for await(const line of reader){
     if(!line.trim())continue;
     if(!columns){
       columns=parseCsvLine(line.replace(/^\uFEFF/,""));
       if(!CSV_HEADER.slice(0,10).every(c=>columns.includes(c)))
         throw Error("Puzzle CSV is missing required official Lichess columns");
       continue;
     }
     let row;
     try{row=parsePuzzleRow(line,columns);}catch{row=null;}
     if(!row)skipped++;
     curator.consider(row);
     if(curator.totalSeen%1000000===0)
       console.log("  Read "+curator.totalSeen.toLocaleString()+" puzzles, sampled "+
         [...curator.buckets.values()].reduce((a,b)=>a+b.items.length,0).toLocaleString()+" candidates");
   }
 }finally{reader.close();}
 if(!columns)throw Error("Dataset is empty");
 const selected=curator.finish();
 if(!selected.length)throw Error("No valid puzzles met the requested quality filters");
 await mkdir(output,{recursive:true});
 const old=await readdir(output);
 for(const file of old)
   if(/^batch-\d{4}\.sql$/.test(file))await unlink(resolve(output,file));
 const chunkSize=400,files=[];
 for(let offset=0;offset<selected.length;offset+=chunkSize){
   const file="batch-"+String(files.length+1).padStart(4,"0")+".sql";
   const chunk=selected.slice(offset,offset+chunkSize);
   await writeFile(resolve(output,file),insertSql(chunk), "utf8");
   files.push({name:file,rows:chunk.length});
 }
 const themes={};
 for(const p of selected){
   const key=p.source_theme+" / "+p.source_difficulty;
   themes[key]=(themes[key]||0)+1;
 }
 const manifest={
   format:1,created_at:new Date().toISOString(),source,selected:selected.length,
   scanned:curator.totalSeen,eligible:curator.eligible,skipped,requested:limit,
   files,topics:themes,license:"CC0 — Lichess puzzle database",
   note:"SQL is idempotent. Only public chess puzzles, no club or student records."
 };
 await writeFile(resolve(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 console.log("Selected "+selected.length.toLocaleString()+" verified puzzles from "+
   curator.totalSeen.toLocaleString()+" rows. Generated "+files.length+" SQL batches.");
 console.log("Saved to "+output);
 if(selected.length<Math.floor(limit*.75))
   console.log("Note: some rare topic/rating combinations had few high-quality positions.");
 return manifest;
}
async function main(){
 const opts=parseImportArgs(process.argv.slice(2));
 if(opts.help){console.log(help);return;}
 const manifest=await preparePuzzleBank(opts);
 if(opts.apply)await uploadPuzzleBank({directory:opts.output,local:opts.local});
 else console.log("Ready. Run npm run puzzles:upload to apply generated batches to Cloudflare D1.");
 return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))
 main().catch(e=>{console.error("Puzzle import failed:",e.message);process.exitCode=1;});
