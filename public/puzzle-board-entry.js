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

function create({element,item,interactive,onMove,onError,preview=false,reviewOnly=false}){
  if(!element)throw Error("Puzzle board element is missing.");
  let game=new Chess(item.start_fen);
  for(const uci of item.played||[])playUci(game,uci);
  const initialOrientation=item.start_fen.split(" ")[1]==="b"?"black":"white";
  const solution=preview&&Array.isArray(item.solution)?item.solution:[];
  let solved=!!item.solved,busy=false,destroyed=false;
  // Completed puzzle solutions are already stored in item.played. After Reset,
  // allow a local replay without changing the server's solved status.
  const completedMoves=solved&&!preview?[...(item.played||[])]:[];
  let replayMode=false,replayCursor=0;
  const canMove=()=>!!interactive&&!busy&&!reviewOnly &&
    (replayMode?replayCursor<completedMoves.length:!solved);
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
      color:canMove()?(game.turn()==="w"?"white":"black"):undefined,
      dests:canMove()?legalDestinations(game):new Map(),
      showDests:true,
      rookCastle:false,
      events:{after:(from,to)=>{void submitMove(from,to);}}
    }
  });

  function sync(){
    if(destroyed)return;
    const active=canMove();
    board.set({
      fen:game.fen(),
      turnColor:game.turn()==="w"?"white":"black",
      check:game.isCheck(),
      lastMove:lastMovePair(replayMode?completedMoves.slice(0,replayCursor):item.played),
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
    if(destroyed||busy||(!replayMode&&solved)||!interactive||reviewOnly){sync();return;}
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
      // A solved puzzle can be practiced again locally. Do not call the
      // progress endpoint or alter the recorded completion / mistake counts.
      if(replayMode){
        const expected=completedMoves[replayCursor];
        if(expected!==uci){
          game.undo();applied=false;
          onError?.("That move does not match the completed solution. Try again.");
          sync();return;
        }
        replayCursor++;
        const reply=completedMoves[replayCursor];
        if(reply && replayCursor%2===1){
          playUci(game,reply);
          replayCursor++;
          board.set({fen:game.fen(),lastMove:lastMovePair([reply])});
        }
        sync();return;
      }
      // Moderators can rehearse puzzle solutions locally before publishing.
      // This branch never persists moves or exposes solutions to students.
      if(preview){
        if(solution[oldCount]!==uci){
          game.undo();applied=false;onError?.("That is not the puzzle solution. Try another move.");sync();return;
        }
        item.played=[...(item.played||[]),uci];
        const opponent=solution[item.played.length];
        if(opponent && item.played.length%2===1){
          playUci(game,opponent);
          item.played.push(opponent);
          board.set({fen:game.fen(),lastMove:lastMovePair([opponent])});
        }
        solved=item.played.length>=solution.length;
        item.solved=solved;
        onMove?.({correct:true,solved,played:item.played});
        sync();return;
      }
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
  function reset(){
    if(destroyed||busy)return;
    game=new Chess(item.start_fen);
    if(preview){item.played=[];item.solved=false;solved=false;}
    else if(item.solved&&completedMoves.length){
      replayMode=true;replayCursor=0;
      // The stored item.played and item.solved remain untouched.
    }else for(const move of item.played||[])playUci(game,move);
    sync();
  }
  function step(){
    if(!preview||destroyed||busy||!solution.length)return;
    const next=solution[(item.played||[]).length];
    if(!next)return;
    try{
      playUci(game,next);
      item.played=[...(item.played||[]),next];
      solved=item.played.length>=solution.length;
      item.solved=solved;
      sync();
    }catch(e){onError?.("Could not replay solution move.");}
  }
  return {
    flip(){if(!destroyed)board.toggleOrientation();},
    reset,step,
    destroy(){if(!destroyed){destroyed=true;board.destroy();}}
  };
}
if(typeof window!=="undefined")window.PuzzleBoardFactory={create};
export {create};
