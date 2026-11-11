import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Chess } from "chess.js";

const source=readFileSync(new URL("../public/puzzles-ui.js",import.meta.url),"utf8");

function renderFixture(fen,played=[]){
 const window={ChessEngine:Chess};
 const context=vm.createContext({window,document:{querySelectorAll:()=>[],getElementById:()=>null}});
 vm.runInContext(source,context);
 const item={id:"item1",lichess_id:"FORK1",position:1,rating:1200,themes:["fork"],start_fen:fen,played,mistakes:0,solved:false};
 const state={activeAssignment:"a1",puzzleIndex:0,puzzleSquare:null,puzzleFeedback:"",
   assignmentData:{assignment:{id:"a1",title:"Knight practice",theme:"fork",difficulty:"normal",due_date:null},items:[item],canSolve:true,summary:[]}};
 return window.PuzzleModule.page(state);
}

test("the puzzle board reconstructs saved ordinary UCI moves without false promotion",()=>{
 const fen="4k3/8/8/4n3/8/8/8/4K3 b - - 0 1";
 const html=renderFixture(fen,["e5d3"]);
 assert.match(html,/chess-board/);
 assert.match(html,/data-puzzle-square="d3"/);
 assert.doesNotMatch(html,/Chessboard is not loaded|Invalid move/);
});

test("the puzzle board replays a valid pawn promotion",()=>{
 const fen="4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
 const html=renderFixture(fen,["a7a8q"]);
 assert.match(html,/chess-board/);
 assert.doesNotMatch(html,/Invalid move/);
});
