import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Chess } from "chess.js";

const source=readFileSync(new URL("../public/puzzles-ui.js",import.meta.url),"utf8");
const adapterSource=readFileSync(new URL("../public/puzzle-board-entry.js",import.meta.url),"utf8");

function fixture(fen,played=[]){
  const host={textContent:""};
  const elements=new Map([["puzzle-board-host",host]]);
  const calls={created:0,destroyed:0,flipped:0,options:null};
  const window={
    ChessEngine:Chess,
    PuzzleBoardFactory:{create:options=>{
      calls.created++;
      calls.options=options;
      return {destroy:()=>calls.destroyed++,flip:()=>calls.flipped++};
    }}
  };
  const document={
    getElementById:id=>elements.get(id)||null,
    querySelectorAll:()=>[],
    querySelector:()=>null
  };
  const context=vm.createContext({window,document});
  vm.runInContext(source,context);
  const item={id:"item1",lichess_id:"FORK1",position:1,rating:1200,
    themes:["fork"],start_fen:fen,played,mistakes:0,solved:false};
  const state={club:"club1",activeAssignment:"a1",puzzleIndex:0,puzzleSquare:null,puzzleFeedback:"",
    assignmentData:{assignment:{id:"a1",title:"Knight practice",theme:"fork",difficulty:"normal",due_date:null},
      items:[item],canSolve:true,summary:[]}};
  return {window,document,state,item,calls};
}

test("assignment renders an accessible chessboard host for the animated board library",()=>{
  const h=fixture("4k3/8/8/4n3/8/8/8/4K3 b - - 0 1",["e5d3"]);
  const html=h.window.PuzzleModule.page(h.state);
  assert.match(html,/class="chess-board-host"/);
  assert.match(html,/id="puzzle-board-host"/);
  assert.match(html,/Flip board/);
  assert.doesNotMatch(html,/data-puzzle-square=/);
});

test("board mounts, reports moves to the server and releases DOM listeners",async()=>{
  const h=fixture("4k3/8/8/4n3/8/8/8/4K3 b - - 0 1");
  const posted=[];
  const result={correct:false,solved:false,played:[],mistakes:1};
  h.window.PuzzleModule.bind({
    state:h.state, render:()=>{}, api:async()=>{},
    action:async fn=>fn(),
    post:async(path,payload)=>{posted.push({path,payload});return result;}
  });
  assert.equal(h.calls.created,1);
  assert.equal(h.calls.options.interactive,true);
  await h.calls.options.onMove("e5d3");
  assert.equal(posted.length,1);
  assert.equal(posted[0].payload.move,"e5d3");
  assert.match(posted[0].path,/puzzles\/assignments\/a1\/items\/item1/);
  assert.equal(h.item.mistakes,1);
  h.window.PuzzleModule.destroyBoard();
  assert.equal(h.calls.destroyed,1);
});

test("board source continues to enforce legal chess.js moves and server verification",()=>{
  assert.match(adapterSource,/mode:"strict"/);
  assert.match(adapterSource,/toBoardMoveDestinations/);
  assert.match(adapterSource,/onMove\(uci\)/);
  assert.match(adapterSource,/board\.move\(toBoardMove\(reply\)\)/);
  assert.match(adapterSource,/board\.destroy\(\)/);
});
