import { Chess } from "chess.js";

// Secondary source: official CC0 Lichess chess puzzles published through
// Hugging Face's public Dataset Viewer API. Unlike /api/puzzle/batch, this
// dataset exposes the opponent's setup move in Moves[0], so the board FEN must
// be advanced once and the solution must start at Moves[1].
const VIEWER="https://datasets-server.huggingface.co/rows";
const DATASET_ROWS=6157341; // approximate size, only used to pick offsets
const PAGE_SIZE=100;
const MAX_PAGES=5;
function uci(chess,move){
 if(typeof move!=="string"||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))throw Error("Invalid puzzle move");
 const args={from:move.slice(0,2),to:move.slice(2,4)};
 if(move.length===5)args.promotion=move[4];
 chess.move(args);
}
function matchingTheme(row,theme){
 const tags=Array.isArray(row.Themes)?row.Themes:String(row.Themes||"").split(/\s+/);
 const opening=Array.isArray(row.OpeningTags)?row.OpeningTags:String(row.OpeningTags||"").split(/\s+/);
 return theme==="mix"||tags.includes(theme)||opening.includes(theme);
}
function matchingDifficulty(rating,difficulty){
 // Dataset puzzles have absolute Elo, unlike Lichess's personalized "normal".
 // These bands approximate the teacher's selected difficulty.
 if(difficulty==="easiest")return rating<=900;
 if(difficulty==="easier")return rating>900&&rating<=1300;
 if(difficulty==="normal")return rating>1100&&rating<=1900;
 if(difficulty==="harder")return rating>1800&&rating<=2400;
 if(difficulty==="hardest")return rating>2300;
 return true;
}
export function fromDatasetRow(row,theme,difficulty){
 if(!row||!(/^[a-zA-Z0-9]{5}$/.test(row.PuzzleId||"")))return null;
 const rating=Number(row.Rating);
 if(!Number.isFinite(rating)||!matchingDifficulty(rating,difficulty)||!matchingTheme(row,theme))return null;
 const moves=String(row.Moves||"").trim().split(/\s+/);
 if(moves.length<2||moves.length>31)return null;
 try{
   const game=new Chess(String(row.FEN||""));
   uci(game,moves[0]); // Opponent's pre-puzzle move
   const start_fen=game.fen();
   for(const move of moves.slice(1))uci(game,move);
   const rawGame=String(row.GameId||row.GameUrl||"");
   const game_id=(rawGame.match(/(?:lichess\.org\/)?([a-zA-Z0-9]{8})(?:\/|#|$)/)||[])[1]||null;
   const themes=Array.isArray(row.Themes)?row.Themes:String(row.Themes||"").trim().split(/\s+/);
   return {
     id:row.PuzzleId,lichess_id:row.PuzzleId,rating:Math.trunc(rating),
     themes,start_fen,solution:moves.slice(1),game_id
   };
 }catch{return null;}
}
export async function fetchArchivePuzzles({theme,difficulty,count,exclude=[]}){
 const items=[];
 const seen=new Set(exclude);
 let failures=0;
 for(let page=0;page<MAX_PAGES&&items.length<count;page++){
   // Evenly spread page offsets over the dataset, rather than repeatedly
   // hitting the same first rows and issuing many requests for rare themes.
   const maxOffset=Math.max(0,DATASET_ROWS-PAGE_SIZE);
   const bucket=Math.floor(maxOffset/MAX_PAGES);
   const offset=Math.min(maxOffset,page*bucket+Math.floor(Math.random()*Math.max(1,bucket)));
   const url=new URL(VIEWER);
   url.searchParams.set("dataset","Lichess/chess-puzzles");
   url.searchParams.set("config","default");
   url.searchParams.set("split","train");
   url.searchParams.set("offset",String(offset));
   url.searchParams.set("length",String(PAGE_SIZE));
   try{
     const res=await fetch(url.toString(),{
       headers:{Accept:"application/json"},
       signal:AbortSignal.timeout(7500)
     });
     if(!res.ok){failures++;if(res.status===429)break;continue;}
     const body=await res.json();
     for(const entry of body.rows||[]){
       const item=fromDatasetRow(entry?.row,theme,difficulty);
       if(!item||seen.has(item.lichess_id))continue;
       seen.add(item.lichess_id);
       items.push(item);
       if(items.length>=count)break;
     }
   }catch{failures++;}
 }
 return {items,failures};
}
