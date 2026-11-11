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


test("Lichess puzzle move without promotion suffix: legal knight jump e5d3",()=>{
 // Regression: import previously supplied {from:"e5",to:"d3",promotion:"q"}
 // for a knight move, which chess.js rightfully rejects.
 const fen="4k3/8/8/4n3/8/8/8/4K3 b - - 0 1";
 const puzzle={puzzle:{id:"FORK1",fen,rating:1400,themes:["fork"],solution:["e5d3"]}};
 assert.equal(createStartFen(puzzle),fen);
});

test("ordinary non-promotion moves in a multi-step Lichess puzzle validate",()=>{
 const fen=new Chess().fen();
 const puzzle={puzzle:{id:"MOVES",fen,rating:1000,themes:["mix"],solution:["e2e4","e7e5","g1f3","b8c6"]}};
 assert.equal(createStartFen(puzzle),fen);
});

test("pawn promotion suffix remains supported",()=>{
 const fen="4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
 const puzzle={puzzle:{id:"PROMO",fen,rating:1600,themes:["promotion"],solution:["a7a8q"]}};
 assert.equal(createStartFen(puzzle),fen);
});
