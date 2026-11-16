import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CSV_HEADER,parseCsvLine,parsePuzzleRow,PuzzleCurator,
  difficultyForRating,insertSql
} from "../scripts/puzzle-import-core.mjs";
import {preparePuzzleBank,parseImportArgs} from "../scripts/import-lichess-puzzles.mjs";

const sample={
  PuzzleId:"00sHx",
  FEN:"q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17",
  Moves:"e8d7 a2e6 d7d8 f7f8",
  Rating:1760,RatingDeviation:80,Popularity:83,NbPlays:72,
  Themes:["mate","mateIn2","middlegame","short"],
  GameUrl:"https://lichess.org/yyznGmXs/black#34",
  OpeningTags:[],DailyDate:""
};
function toCsv(x){
  return CSV_HEADER.map(k=>{
    const value=Array.isArray(x[k])?x[k].join(" "):String(x[k]??"");
    return value.includes(",")||value.includes('"')?
      '"'+value.replaceAll('"','""')+'"':value;
  }).join(",");
}
const row=()=>parsePuzzleRow(toCsv(sample),CSV_HEADER);

test("Official Lichess CSV parses quoted values and supports the current 11-column format",()=>{
  assert.deepEqual(parseCsvLine('one,"two,three","four""five"'),["one","two,three",'four"five']);
  const parsed=row();
  assert.equal(parsed.PuzzleId,"00sHx");
  assert.deepEqual(parsed.Themes,["mate","mateIn2","middlegame","short"]);
  assert.equal(parsed.Rating,1760);
});

test("Quality filters exclude low popularity, high deviation, few plays and invalid move lines",()=>{
  for(const change of [
    {Popularity:49},{RatingDeviation:200},{NbPlays:5},
    {Moves:"z8z9 e7e8"},{PuzzleId:"bad!!"}
  ]){
    assert.equal(parsePuzzleRow(toCsv({...sample,...change}),CSV_HEADER),null);
  }
});

test("Rating buckets cover all difficulty levels without gaps",()=>{
  assert.equal(difficultyForRating(800),"easiest");
  assert.equal(difficultyForRating(1000),"easier");
  assert.equal(difficultyForRating(1450),"normal");
  assert.equal(difficultyForRating(2100),"harder");
  assert.equal(difficultyForRating(2800),"hardest");
});

test("Curator retains rare themes and validates official FEN and solution",()=>{
  const c=new PuzzleCurator(20,{topics:["mateIn2","xRayAttack"],random:()=>0});
  const known=row();
  c.consider(known);
  c.consider({...known,PuzzleId:"00sHy",Themes:["xRayAttack","mateIn2"]});
  const out=c.finish();
  assert.equal(out.length,2);
  assert.ok(out.some(p=>p.source_theme==="mateIn2"));
  assert.ok(out.some(p=>p.source_theme==="xRayAttack"));
  const p=out.find(x=>x.lichess_id==="00sHx");
  assert.equal(p.start_fen.includes(" "),true);
  assert.deepEqual(p.solution,["a2e6","d7d8","f7f8"]);
  assert.equal(p.game_id,"yyznGmXs");
});

test("SQL batch generator escapes text, remains idempotent and stays under D1 limits",()=>{
  const c=new PuzzleCurator(10,{topics:["mateIn2"],random:()=>0});
  c.consider(row());
  const [p]=c.finish();
  const sql=insertSql([p]);
  assert.match(sql,/INSERT OR IGNORE INTO puzzle_bank/);
  assert.match(sql,/source_theme,source_difficulty/);
  assert.match(sql,/'mateIn2'/);
  assert.match(sql,/'normal'/);
  assert.match(sql,/'yyznGmXs'/);
  assert.ok(Buffer.byteLength(sql)<100000);
});

test("Preparation streams local CSV and produces a resumable batch manifest",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"chess-puzzle-import-"));
  try{
    const input=join(dir,"sample.csv"),output=join(dir,"batch-data");
    await writeFile(input,CSV_HEADER.join(",")+"\n"+
      toCsv(sample)+"\n"+
      toCsv({...sample,PuzzleId:"00sHy",Themes:["mate","xRayAttack","short"]})+"\n");
    const m=await preparePuzzleBank({source:input,limit:10,output});
    assert.equal(m.selected,2);
    assert.equal(m.scanned,2);
    assert.equal(m.files.length,1);
    const sql=await readFile(join(output,"batch-0001.sql"),"utf8");
    assert.match(sql,/00sHx/);
    assert.match(sql,/00sHy/);
    const saved=JSON.parse(await readFile(join(output,"manifest.json"),"utf8"));
    assert.equal(saved.license,"CC0 — Lichess puzzle database");
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("CLI argument validation supports a source, a limit and safe upload toggles",()=>{
  const cfg=parseImportArgs(["--source","example.csv.zst","--limit","12000","--apply"]);
  assert.equal(cfg.source,"example.csv.zst");
  assert.equal(cfg.limit,12000);
  assert.equal(cfg.apply,true);
  assert.throws(()=>parseImportArgs(["--limit","51000"]),/Limit|limit/);
});
