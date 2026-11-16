import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {fromDatasetRow,fetchArchivePuzzles} from "../worker/puzzle-archive.js";

const example={
 PuzzleId:"00Bg4",
 FEN:"3r2k1/1q3ppp/p2rp3/Qp1B4/7P/P4P2/1PP3P1/1K1R3R b - - 0 21",
 Moves:"d6d5 a5d8 d5d8 d1d8",
 Rating:1373,
 Themes:["backRankMate","endgame","mate","mateIn2","short","xRayAttack"],
 GameId:"6qWf8wOP/black#42",
 OpeningTags:[]
};

test("Lichess archive rows apply the opponent's setup move before player solutions",()=>{
 const selected=fromDatasetRow(example,"xRayAttack","normal");
 assert.ok(selected);
 assert.equal(selected.lichess_id,"00Bg4");
 assert.deepEqual(selected.solution,["a5d8","d5d8","d1d8"]);
 assert.equal(selected.game_id,"6qWf8wOP");
 const board=new Chess(example.FEN);
 board.move({from:"d6",to:"d5"});
 assert.equal(selected.start_fen,board.fen());
 for(const move of selected.solution){
   const args={from:move.slice(0,2),to:move.slice(2,4)};
   board.move(args);
 }
});

test("Archive filter requires the actual requested theme and approximate rating band",()=>{
 assert.equal(fromDatasetRow(example,"xRayAttack","normal")?.lichess_id,"00Bg4");
 assert.equal(fromDatasetRow(example,"xRayAttack","hardest"),null);
 assert.equal(fromDatasetRow(example,"fork","normal"),null);
 assert.equal(fromDatasetRow({...example,Moves:"a1a8 d6d5"},"xRayAttack","normal"),null);
 assert.equal(fromDatasetRow({...example,PuzzleId:"NO_VALID"},"xRayAttack","normal"),null);
});

test("Public archive fallback retrieves independent rows without Lichess live puzzle requests",async()=>{
 const before=globalThis.fetch;
 const urls=[];
 globalThis.fetch=async url=>{
   urls.push(url);
   return new Response(JSON.stringify({rows:[
     {row:example},
     {row:{...example,PuzzleId:"00Bg5",GameId:"abcdefgh#7"}}
   ]}),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
   const result=await fetchArchivePuzzles({theme:"xRayAttack",difficulty:"normal",count:2});
   assert.equal(result.items.length,2);
   assert.ok(urls.every(u=>u.startsWith("https://datasets-server.huggingface.co/rows?")));
   assert.equal(urls.length,1);
   assert.equal(result.items[0].start_fen,fromDatasetRow(example,"xRayAttack","normal").start_fen);
 }finally{globalThis.fetch=before;}
});

test("Archive fallback skips excluded and nonmatching puzzles",async()=>{
 const before=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({rows:[
   {row:example},{row:{...example,PuzzleId:"00Bg5",Themes:["fork"]}}
 ]}),{status:200});
 try{
   const result=await fetchArchivePuzzles({theme:"xRayAttack",difficulty:"normal",count:1,exclude:["00Bg4"]});
   assert.equal(result.items.length,0);
 }finally{globalThis.fetch=before;}
});
