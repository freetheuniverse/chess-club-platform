#!/usr/bin/env node
// Upload prepared, idempotent SQL batches to the project's existing D1.
// If connectivity fails, rerunning this command resumes at the failed batch.
import {readFile,writeFile,access} from "node:fs/promises";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

function wrangler(args){
 return new Promise((resolvePromise,reject)=>{
   const cli=resolve("node_modules","wrangler","bin","wrangler.js");
   const p=spawn(process.execPath,[cli,...args],{stdio:"inherit",windowsHide:false});
   p.once("error",reject);
   p.once("exit",(code,signal)=>code===0?resolvePromise():
     reject(Error("Wrangler failed ("+(signal||"exit "+code)+"). Check login, database and Cloudflare limits.")));
 });
}
export async function uploadPuzzleBank({directory=resolve(".puzzle-import"),local=false}={}){
 directory=resolve(directory);
 const manifest=JSON.parse(await readFile(resolve(directory,"manifest.json"),"utf8"));
 if(manifest.format!==1||!Array.isArray(manifest.files)||!manifest.files.length)
   throw Error("Invalid puzzle import manifest. Run npm run puzzles:prepare first.");
 for(const f of manifest.files){
   if(!/^batch-\d{4}\.sql$/.test(f.name))throw Error("Invalid batch filename");
   await access(resolve(directory,f.name));
 }
 const stateFile=resolve(directory,"upload-state.json");
 let state={created_at:manifest.created_at,completed:[]};
 try{
   const old=JSON.parse(await readFile(stateFile,"utf8"));
   if(old.created_at===manifest.created_at&&Array.isArray(old.completed))state=old;
 }catch{}
 const done=new Set(state.completed);
 const target=local?"local":"remote Cloudflare";
 console.log("Uploading "+manifest.selected.toLocaleString()+" curated puzzles to "+target+" D1");
 console.log("Batches already completed: "+done.size+" / "+manifest.files.length);
 for(let i=0;i<manifest.files.length;i++){
   const batch=manifest.files[i];
   if(done.has(batch.name))continue;
   console.log("Batch "+(i+1)+"/"+manifest.files.length+
     " — "+batch.rows+" rows (INSERT OR IGNORE; safe to retry)");
   await wrangler(["d1","execute","chess-club-db",local?"--local":"--remote",
     "--config","wrangler.cloud.jsonc","--file",resolve(directory,batch.name)]);
   done.add(batch.name);
   await writeFile(stateFile,JSON.stringify({
     created_at:manifest.created_at,completed:[...done]
   },null,2)+"\n");
 }
 console.log("Puzzle import complete. Verify your puzzle-bank totals with:");
 console.log("npx wrangler d1 execute chess-club-db --remote --config wrangler.cloud.jsonc --command \"SELECT COUNT(*) AS puzzles FROM puzzle_bank;\"");
}
async function main(){
 const args=process.argv.slice(2),opts={directory:resolve(".puzzle-import"),local:false};
 for(let i=0;i<args.length;i++){
   if(args[i]==="--output"||args[i]==="--directory"){
     if(!args[i+1])throw Error("Missing directory path");
     opts.directory=resolve(args[++i]);
   }else if(args[i]==="--local")opts.local=true;
   else if(args[i]==="--remote")opts.local=false;
   else if(args[i]==="--help"){
     console.log("Usage: npm run puzzles:upload [-- --directory DIRECTORY] [--local]");
     return;
   }else throw Error("Unknown option: "+args[i]);
 }
 await uploadPuzzleBank(opts);
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))
 main().catch(e=>{
   console.error("Upload stopped:",e.message);
   console.error("After addressing the issue, run npm run puzzles:upload to resume.");
   process.exitCode=1;
 });
