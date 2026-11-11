import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { createStartFen, sanitizedPuzzle } from "../worker/puzzles.js";

test("reconstructs the starting position from a Lichess game and initialPly",()=>{
 const game = new Chess();
 game.move("e4");game.move("e5");game.move("Nf3");game.move("Nc6");
 const startingFen=game.fen();
 const fixture={game:{pgn:"e4 e5 Nf3 Nc6 Bb5 a6"},puzzle:{
   id:"ABCDE",rating:1200,themes:["opening"],initialPly:3,solution:["f1b5"]
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

test("matches real Lichess batch example 0haqU with all 53 PGN half-moves",()=>{
 const game={pgn:"e4 c5 c3 e6 d4 d5 dxc5 Bxc5 exd5 exd5 Bb5+ Nc6 Nf3 Nf6 O-O O-O Bg5 h6 Bh4 a6 Bd3 Bg4 h3 Bh5 Nbd2 Re8 Qb3 b5 a4 Na5 Qc2 Nc4 b3 Ne5 Nxe5 Rxe5 axb5 axb5 Rxa8 Qxa8 Bxf6 gxf6 Bxb5 Rg5 Re1 Qb7 Be2 Bxe2 Rxe2 d4 Ne4 Rg6 f3"};
 const puzzle={id:"0haqU",initialPly:52,rating:1167,themes:["promotion"],solution:["d4d3","e4c5","d3c2","c5b7","c2c1q"]};
 const full=new Chess();full.loadPgn(game.pgn);
 assert.equal(full.history().length,53);
 // Lichess game.pgn already ends with the opponent's setup move.
 assert.equal(createStartFen({game,puzzle}),full.fen());
});

test("matches real Lichess batch example 0NNEG with all 44 PGN half-moves",()=>{
 const game={pgn:"d4 Nf6 Bf4 d6 e3 Nbd7 Nf3 g6 Be2 Bg7 c4 O-O Nc3 a6 h3 b6 O-O Bb7 a4 Qe8 d5 h6 Re1 Nh5 Bh2 e5 e4 Nf4 Bxf4 exf4 Nd4 Ne5 b3 Bc8 Rc1 Bd7 Rc2 Qc8 Bd3 g5 Rce2 g4 Nf5 f3"};
 const puzzle={id:"0NNEG",initialPly:43,rating:1102,themes:["fork"],solution:["f5e7","g8h8","e7c8"]};
 const full=new Chess();full.loadPgn(game.pgn);
 assert.equal(full.history().length,44);
 assert.equal(createStartFen({game,puzzle}),full.fen());
});
