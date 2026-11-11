/*
 * Chess Club Platform's Chessground adapter.
 * Chessground Copyright (C) the Lichess contributors, GPL-3.0-or-later.
 * Source: https://github.com/lichess-org/chessground
 * Combined application source: https://github.com/freetheuniverse/chess-club-platform
 * Chessground provides the UI; chess.js calculates legal moves; the Worker
 * validates puzzle solutions and records each member's progress.
 */
import { Chessground } from "@lichess-org/chessground";
import { Chess } from "chess.js";

function playUci(game,uci){
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw Error("Invalid stored chess move");
  const args={from:uci.slice(0,2),to:uci.slice(2,4)};
  if(uci.length===5)args.promotion=uci[4];
  return game.move(args);
}

export function legalDestinations(game){
  const dests=new Map();
  for(const move of game.moves({verbose:true})){
    if(!dests.has(move.from))dests.set(move.from,[]);
    const squares=dests.get(move.from);
    if(!squares.includes(move.to))squares.push(move.to);
  }
  return dests;
}

function lastMovePair(moves){
  if(!moves?.length)return undefined;
  const move=moves[moves.length-1];
  return [move.slice(0,2),move.slice(2,4)];
}

function create({element,item,interactive,onMove,onError}){
  if(!element)throw Error("Puzzle board element is missing.");
  let game=new Chess(item.start_fen);
  for(const uci of item.played||[])playUci(game,uci);
  const initialOrientation=item.start_fen.split(" ")[1]==="b"?"black":"white";
  let solved=!!item.solved,busy=false,destroyed=false;
  const board=Chessground(element,{
    fen:game.fen(),
    orientation:initialOrientation,
    turnColor:game.turn()==="w"?"white":"black",
    coordinates:true,
    coordinatesOnSquares:true,
    ranksPosition:"left",
    autoCastle:true,
    highlight:{lastMove:true,check:true},
    lastMove:lastMovePair(item.played),
    animation:{enabled:true,duration:230},
    draggable:{enabled:true,showGhost:true},
    selectable:{enabled:true},
    premovable:{enabled:false},
    drawable:{enabled:true,visible:true},
    movable:{
      free:false,
      color:interactive&&!solved?(game.turn()==="w"?"white":"black"):undefined,
      dests:interactive&&!solved?legalDestinations(game):new Map(),
      showDests:true,
      rookCastle:false,
      events:{after:(from,to)=>{void submitMove(from,to);}}
    }
  });

  function sync(){
    if(destroyed)return;
    const active=!!interactive&&!solved&&!busy;
    board.set({
      fen:game.fen(),
      turnColor:game.turn()==="w"?"white":"black",
      check:game.isCheck(),
      lastMove:lastMovePair(item.played),
      movable:{
        free:false,
        color:active?(game.turn()==="w"?"white":"black"):undefined,
        dests:active?legalDestinations(game):new Map(),
        showDests:true,
        rookCastle:false
      },
      premovable:{enabled:false}
    });
  }

  async function submitMove(from,to){
    if(destroyed||busy||solved||!interactive){sync();return;}
    const choices=game.moves({verbose:true}).filter(m=>m.from===from&&m.to===to);
    if(!choices.length){sync();onError?.("This move is not legal.");return;}
    let chosen=choices[0];
    if(choices.length>1){
      const answer=window.prompt("Promote to q (queen), r (rook), b (bishop), or n (knight):","q");
      if(answer===null){sync();return;}
      const promote=String(answer).trim().toLowerCase();
      chosen=choices.find(m=>m.promotion===promote);
      if(!chosen){sync();onError?.("Choose q, r, b, or n to promote.");return;}
    }
    const oldCount=(item.played||[]).length;
    const uci=chosen.from+chosen.to+(chosen.promotion||"");
    let applied=false;
    busy=true;
    try{
      // Chessground has already moved the piece on the screen; apply the same
      // move to chess.js so it can reconstruct the real board state.
      game.move({from:chosen.from,to:chosen.to,...(chosen.promotion?{promotion:chosen.promotion}:{})});
      applied=true;
      sync();
      const result=await onMove(uci);
      if(destroyed)return;
      if(!result||!Array.isArray(result.played))throw Error("Unexpected puzzle response");
      // Both correct and incorrect attempts update progress. Incorrect moves
      // must not leave the board's mistake count stale after rollback.
      item.played=result.played;
      item.solved=!!result.solved;
      item.mistakes=Number(result.mistakes)||0;
      solved=item.solved;
      if(!result.correct){
        game.undo();
        applied=false;
        sync();
        return;
      }

      // The server includes the opponent's automatic reply, but never the
      // solution itself. Chessground animates the position difference.
      for(const reply of result.played.slice(oldCount+1)){
        playUci(game,reply);
        board.set({fen:game.fen(),lastMove:lastMovePair([reply])});
      }
      sync();
    }catch(error){
      if(destroyed)return;
      // Rebuild from the last confirmed server position, even if an
      // automatic opponent reply failed partway through processing.
      try{
        game=new Chess(item.start_fen);
        for(const move of item.played||[])playUci(game,move);
        board.set({fen:game.fen(),lastMove:lastMovePair(item.played)});
      }catch{}
      onError?.(error?.message||"Unable to save puzzle move.");
    }finally{
      if(!destroyed){busy=false;sync();}
    }
  }
  return {
    flip(){if(!destroyed)board.toggleOrientation();},
    destroy(){if(!destroyed){destroyed=true;board.destroy();}}
  };
}
if(typeof window!=="undefined")window.PuzzleBoardFactory={create};
export {create};
