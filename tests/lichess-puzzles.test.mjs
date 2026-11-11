import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { createStartFen, sanitizedPuzzle } from "../worker/puzzles.js";

test("reconstructs the starting position from a Lichess game and initialPly",()=>{
 const game = new Chess();
 game.move("e4");game.move("e5");game.move("Nf3");game.move("Nc6");
 const startingFen=game.fen();
 const fixture={game:{pgn:"e4 e5 Nf3 Nc6 Bb5 a6"},puzzle:{
   id:"ABCDE",rating:1200,themes:["opening"],initialPly:4,solution:["f1b5"]
 }};
 const result=sanitizedPuzzle(fixture);
 assert.equal(result.start_fen,startingFen);
 assert.equal(result.lichess_id,"ABCDE");
 assert.deepEqual(JSON.parse(result.solution_json),["f1b5"]);
});

test("rejects a puzzle with an illegal solution move",()=>{
 const fixture={puzzle:{id:"ABCDE",fen:new Chess().fen(),solution:["a1a8"],rating:1500,themes:["fork"]}};
 assert.throws(()=>createStartFen(fixture));
});

test("accepts a puzzle already containing a valid FEN",()=>{
 const fen=new Chess().fen();
 assert.equal(createStartFen({puzzle:{id:"ABCDE",fen,solution:["e2e4"]}}),fen);
});
