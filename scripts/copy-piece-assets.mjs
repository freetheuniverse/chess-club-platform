import {cpSync,copyFileSync,existsSync,mkdirSync} from "node:fs";
import {join} from "node:path";

const source=join(process.cwd(),"node_modules","@mirasen","chessboard","assets","pieces","chessnut");
const destination=join(process.cwd(),"public","assets","pieces","chessnut");

if(!existsSync(source)){
  throw Error("Mirasen chess piece assets are missing. Run npm install before building.");
}
mkdirSync(destination,{recursive:true});
cpSync(source,destination,{recursive:true});
const legal=join(process.cwd(),"public","assets","licenses");
mkdirSync(legal,{recursive:true});
copyFileSync(
  join(process.cwd(),"node_modules","@mirasen","chessboard","LICENSE"),
  join(legal,"Mirasen-Chessboard-MIT-LICENSE.txt")
);
console.log("Copied chess SVG assets plus their required MIT and Apache license notices.");
