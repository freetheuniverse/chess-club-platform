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

test("adapter uses the official Lichess Chessground board and legal-move map",()=>{
  for(const expected of [
    'from "@lichess-org/chessground"',
    'export function legalDestinations',
    'Chessground(element,',
    'game.moves({verbose:true})',
    'dests:',
    'movable:',
    'events:{after:',
    'onMove(uci)',
    'board.toggleOrientation()',
    'board.destroy()'
  ]) assert.ok(adapterSource.includes(expected),"Adapter missing: "+expected);
});

function mountAdapter({result,solved=false}={}){
  const creates=[],updates=[],errors=[],submitted=[];
  let destroyed=0,flipped=0;
  const Chessground=(element,config)=>{
    creates.push(config);
    return {
      set:c=>updates.push(c),
      toggleOrientation:()=>flipped++,
      destroy:()=>destroyed++
    };
  };
  const window={prompt:()=>"q"};
  const context=vm.createContext({Chessground,Chess,window,console});
  const js=adapterSource
    .replace(/^import .*;$/gm,"")
    .replace("export function legalDestinations","function legalDestinations")
    .replace("export {create};","");
  vm.runInContext(js,context);
  const fen="4k3/8/8/4n3/8/8/8/4K3 b - - 0 1";
  const item={start_fen:fen,played:[],solved,mistakes:0};
  const board=window.PuzzleBoardFactory.create({
    element:{},item,interactive:!solved,
    onMove:async uci=>{
      submitted.push(uci);
      return result || {correct:true,played:["e5d3"],solved:true,mistakes:0};
    },
    onError:message=>errors.push(message)
  });
  return {board,item,fen,creates,updates,errors,submitted,
    get destroyed(){return destroyed;},
    get flipped(){return flipped;}
  };
}

test("Chessground forwards a legal knight move and disables solved puzzles",async()=>{
  const h=mountAdapter();
  assert.equal(h.creates[0].orientation,"black");
  assert.equal(h.creates[0].movable.color,"black");
  assert.ok(h.creates[0].movable.dests.get("e5").includes("d3"));
  h.creates[0].movable.events.after("e5","d3");
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.submitted,["e5d3"]);
  assert.equal(h.item.solved,true);
  assert.equal(h.updates.at(-1).movable.color,undefined);
  h.board.flip();assert.equal(h.flipped,1);
  h.board.destroy();assert.equal(h.destroyed,1);
});

test("incorrect puzzle moves return the board to its confirmed FEN",async()=>{
  const h=mountAdapter({result:{correct:false,played:[],solved:false,mistakes:1}});
  h.creates[0].movable.events.after("e5","d3");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.updates.at(-1).fen,h.fen);
  assert.equal(h.item.solved,false);
  assert.equal(h.item.mistakes,1);
});

test("completed puzzles are read-only on Chessground",()=>{
  const h=mountAdapter({solved:true});
  assert.equal(h.creates[0].movable.color,undefined);
  assert.equal(h.creates[0].movable.dests.size,0);
});
