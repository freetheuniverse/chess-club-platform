// Pure, testable helpers for curating an offline Lichess puzzle library.
// Official source: https://database.lichess.org/#puzzles (CC0)
// No account details, secrets or student records are involved.
import {fromDatasetRow} from "../worker/puzzle-archive.js";
import {ALLOWED_THEMES} from "../worker/puzzles.js";

export const DIFFICULTIES=["easiest","easier","normal","harder","hardest"];
export const TOPICS=[...ALLOWED_THEMES];
export const CSV_HEADER=["PuzzleId","FEN","Moves","Rating","RatingDeviation",
  "Popularity","NbPlays","Themes","GameUrl","OpeningTags","DailyDate"];

export function parseCsvLine(line){
 const fields=[];let current="",quoted=false;
 for(let i=0;i<line.length;i++){
   const ch=line[i];
   if(ch==='"'){
     if(quoted&&line[i+1]==='"'){current+='"';i++;}
     else quoted=!quoted;
   }else if(ch===","&&!quoted){fields.push(current);current="";}
   else current+=ch;
 }
 if(quoted)throw Error("Unclosed quoted CSV value");
 fields.push(current);
 return fields;
}
export function parsePuzzleRow(line,columns=CSV_HEADER){
 const values=parseCsvLine(line);
 if(values.length!==columns.length)return null;
 const data=Object.fromEntries(columns.map((key,i)=>[key,values[i]]));
 const themes=data.Themes.trim().split(/\s+/).filter(Boolean);
 const openings=data.OpeningTags.trim().split(/\s+/).filter(Boolean);
 const rating=Number(data.Rating);
 const deviation=Number(data.RatingDeviation);
 const popularity=Number(data.Popularity);
 const plays=Number(data.NbPlays);
 if(!/^[a-zA-Z0-9]{5}$/.test(data.PuzzleId))return null;
 if(!Number.isFinite(rating)||rating<400||rating>3400)return null;
 if(!Number.isFinite(deviation)||deviation>150||deviation<0)return null;
 if(!Number.isFinite(popularity)||popularity<50)return null;
 if(!Number.isFinite(plays)||plays<20)return null;
 if(!data.FEN||data.FEN.length>120)return null;
 if(!/^(?:[a-h][1-8][a-h][1-8][qrbn]?\s+){1,30}[a-h][1-8][a-h][1-8][qrbn]?$/.test(data.Moves.trim()))
   return null;
 return {
   PuzzleId:data.PuzzleId,FEN:data.FEN,Moves:data.Moves.trim(),Rating:rating,
   Themes:themes,OpeningTags:openings,GameUrl:data.GameUrl
 };
}
export function difficultyForRating(rating){
 if(rating<=900)return "easiest";
 if(rating<=1200)return "easier";
 if(rating<=1800)return "normal";
 if(rating<=2300)return "harder";
 return "hardest";
}
function randomInteger(n){return Math.floor(Math.random()*n);}
export class PuzzleCurator{
 constructor(limit=12000,{topics=TOPICS,random=randomInteger}={}){
   if(!Number.isSafeInteger(limit)||limit<1||limit>50000)throw Error("Limit must be 1 to 50,000");
   this.limit=limit;
   this.topics=topics.filter(t=>t!=="mix");
   this.allowed=new Set(this.topics);
   this.random=random;
   this.bucketLimit=Math.max(1,Math.ceil(limit/(this.topics.length*DIFFICULTIES.length)*2.5));
   this.buckets=new Map();
   this.totalSeen=0;this.eligible=0;
 }
 consider(row){
   this.totalSeen++;
   if(!row)return;
   const options=[...new Set([...row.Themes,...row.OpeningTags])]
     .filter(t=>this.allowed.has(t));
   // A small amount of mixed-tactics material is useful even when a row
   // carries no supported specialized theme.
   options.push("mix");
   const difficulty=difficultyForRating(row.Rating);
   let chosen=null,score=Infinity;
   for(const theme of options){
     const key=theme+"|"+difficulty;
     const slot=this.buckets.get(key);
     const seen=slot?.seen||0;
     // Underrepresented topics receive puzzle candidates before already
     // well-supplied topics. This naturally favors rare themes such as X-ray.
     const value=seen/this.bucketLimit+(theme==="mix"?0.25:0);
     if(value<score){score=value;chosen=key;}
   }
   const bucket=this.buckets.get(chosen)||{seen:0,items:[]};
   bucket.seen++;this.eligible++;
   if(bucket.items.length<this.bucketLimit)bucket.items.push(row);
   else {
     const idx=this.random(bucket.seen);
     if(idx<this.bucketLimit)bucket.items[idx]=row;
   }
   this.buckets.set(chosen,bucket);
 }
 finish(){
   const entries=[...this.buckets.entries()].map(([key,b])=>({
     key,puzzles:b.items.map(row=>{
       const [source_theme,source_difficulty]=key.split("|");
       const puzzle=fromDatasetRow(row,source_theme,source_difficulty);
       return puzzle?{...puzzle,source_theme,source_difficulty}:null;
     }).filter(Boolean)
   })).filter(entry=>entry.puzzles.length);
   // Round-robin ensures scarce themes survive a global limit even when
   // popular themes (mateIn1 / fork / endgame) have bigger reservoirs.
   entries.sort((a,b)=>a.puzzles.length-b.puzzles.length||a.key.localeCompare(b.key));
   const selected=[],used=new Set();
   let remaining=true,step=0;
   while(selected.length<this.limit&&remaining){
     remaining=false;
     for(const entry of entries){
       if(step<entry.puzzles.length){
         remaining=true;
         const p=entry.puzzles[step];
         if(!used.has(p.lichess_id)){used.add(p.lichess_id);selected.push(p);}
         if(selected.length>=this.limit)break;
       }
     }
     step++;
   }
   return selected;
 }
}
const quote=value=>value==null?"NULL":"'"+String(value).replace(/'/g,"''")+"'";
export function insertSql(puzzles,{rowsPerStatement=24}={}){
 if(!puzzles.length)return "";
 const statements=[];
 for(let offset=0;offset<puzzles.length;offset+=rowsPerStatement){
   const values=puzzles.slice(offset,offset+rowsPerStatement).map(p=>
     "("+[
       quote(p.lichess_id),quote(p.source_theme),quote(p.source_difficulty),
       String(p.rating),quote(JSON.stringify(p.themes)),quote(p.start_fen),
       quote(JSON.stringify(p.solution)),quote(p.game_id)
     ].join(",")+")"
   );
   const statement="INSERT OR IGNORE INTO puzzle_bank"+
     "(lichess_id,source_theme,source_difficulty,rating,themes,start_fen,solution_json,game_id) VALUES\n"+
     values.join(",\n")+";";
   if(Buffer.byteLength(statement,"utf8")>100000)
     throw Error("One generated SQL statement exceeds Cloudflare's 100KB limit");
   statements.push(statement);
 }
 return statements.join("\n")+"\n";
}
