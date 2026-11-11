/*
 * Chessboard adapter for the Club's in-app Lichess puzzle assignments.
 * @mirasen/chessboard is MIT-licensed; the underlying puzzle rules are chess.js.
 * Lichess Chessground itself is GPL-3.0 and is deliberately not bundled here.
 */
import { createBoard } from "@mirasen/chessboard";
import { toGameMove, toBoardMove, toBoardMoveDestinations } from "@mirasen/chessboard/adapters/chessjs";
import { Chess } from "chess.js";

function playUci(game, uci) {
  const move = { from:uci.slice(0,2), to:uci.slice(2,4) };
  if (uci.length === 5) move.promotion=uci[4];
  return game.move(move);
}

function create({element,item,interactive,onMove,onError}) {
  if (!element) throw Error("Puzzle board element is missing.");
  const game=new Chess(item.start_fen);
  for (const uci of item.played||[]) playUci(game,uci);
  const board=createBoard({ element });
  // The muted tan/brown palette is inspired by a common Lichess board theme.
  // All rendered pieces come from Mirasen's separately licensed Chessnut set.
  board.extensions.renderer.setConfig({
    colors:{
      board:{light:"#f0d9b5",dark:"#b58863"},
      coordinates:{light:"#fff7e6",dark:"#5e402b"}
    },
    animation:{durationMs:220}
  });
  const initialOrientation=item.start_fen.split(" ")[1]==="b"?"black":"white";
  board.setOrientation(initialOrientation);
  board.setPosition(game.fen());
  let busy=false;
  let solved=!!item.solved;
  let destroyed=false;
  let orientation=initialOrientation;

  function movement(){
    if (destroyed) return;
    if(!interactive || solved || busy){
      board.setMovability({mode:"disabled"});
      return;
    }
    board.setMovability({
      mode:"strict",
      destinations: source=>{
        const moves=game.moves({square:source,verbose:true});
        const destinations=toBoardMoveDestinations(moves);
        return destinations.length ? destinations : undefined;
      }
    });
  }
  movement();

  board.extensions.events.setOnUIMove(async uiMove=>{
    if(destroyed) return;
    if(busy || solved || !interactive) {
      board.setPosition(game.fen());
      return;
    }
    let played;
    try {
      // The board has already moved graphically. chess.js remains the legal-move authority.
      played=game.move(toGameMove(uiMove));
    } catch(error) {
      board.setPosition(game.fen());
      onError?.("Illegal move. Try another square.");
      return;
    }
    busy=true;
    movement();
    const oldCount=(item.played||[]).length;
    const uci=played.from+played.to+(played.promotion||"");
    try {
      // The API checks the solution server-side; never send it to the browser.
      const result=await onMove(uci);
      if(destroyed) return;
      if(!result || !Array.isArray(result.played)) throw Error("Unexpected puzzle response");
      if(!result.correct){
        game.undo();
        board.setPosition(game.fen());
      } else {
        // Correct user move has already animated; animate automatic opponent replies.
        for(const uciReply of result.played.slice(oldCount+1)){
          const reply=playUci(game,uciReply);
          board.move(toBoardMove(reply));
        }
        solved=!!result.solved;
      }
      item.played=result.played;
      item.solved=!!result.solved;
      item.mistakes=result.mistakes;
    }catch(error){
      if(destroyed) return;
      game.undo();
      board.setPosition(game.fen());
      onError?.(error?.message||"Unable to save puzzle move.");
    }finally{
      if(!destroyed){
        busy=false;
        movement();
      }
    }
  });

  return {
    flip(){
      if(destroyed) return;
      orientation=orientation==="white"?"black":"white";
      board.setOrientation(orientation);
    },
    destroy(){
      if(destroyed) return;
      destroyed=true;
      board.destroy();
    }
  };
}
window.PuzzleBoardFactory={create};
