import {cpSync,existsSync,mkdirSync} from "node:fs";
import {join} from "node:path";

const source=join(process.cwd(),"node_modules","@mirasen","chessboard","assets","pieces","chessnut");
const destination=join(process.cwd(),"public","assets","pieces","chessnut");

if(!existsSync(source)){
  throw Error("Mirasen chess piece assets are missing. Run npm install before building.");
}
mkdirSync(destination,{recursive:true});
cpSync(source,destination,{recursive:true});
console.log("Copied MIT-board Chessnut SVG assets and attribution into public/assets/pieces/chessnut");
