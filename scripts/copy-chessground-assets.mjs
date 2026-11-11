// Publish the GPL Chessground visual assets and license alongside the Worker.
// All three stylesheets are supplied by @lichess-org/chessground.
// Its cburnett stylesheet embeds the piece SVGs as data URLs.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const source=join(process.cwd(),"node_modules","@lichess-org","chessground");
const assets=join(source,"assets");
const target=join(process.cwd(),"public","assets","chessground");
const licenseDir=join(process.cwd(),"public","assets","licenses");

const styles=["chessground.base.css","chessground.brown.css","chessground.cburnett.css"];
mkdirSync(target,{recursive:true});
for(const name of styles){
  const input=join(assets,name);
  if(!existsSync(input))throw Error("Missing Chessground stylesheet: "+input+". Run npm install.");
  copyFileSync(input,join(target,name));
}

mkdirSync(licenseDir,{recursive:true});
const upstreamLicense=join(source,"LICENSE");
const license=existsSync(upstreamLicense)?upstreamLicense:join(process.cwd(),"LICENSE");
copyFileSync(license,join(licenseDir,"Chessground-GPL-3.0-or-later.txt"));
console.log("Published Chessground board, piece styles and GPL license.");
