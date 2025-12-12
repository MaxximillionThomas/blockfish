/*
 File:      main.js
 Author:    Maxximillion Thomas
 Purpose:   Activate the dormant js chessboard-1.0.0.js file
 Date:      December 9, 2025
 */

//==========  Logic  ==========
// Establish the logic and rules of the chess game
var game = new Chess();

//==========  Engine  ==========
// Initialize the Stockfish chess engine
var engine = new Worker('js/stockfish.js');

// The engine has different difficulty levels (0-20), start at the easiest
var difficulty = 0;
var searchDepth = 1;
engine.postMessage('uci'); 
engine.postMessage('setoption name Skill Level value ' + difficulty); 

// Debugging output
console.log('Engine difficulty starting at ' + difficulty + ' with search depth ' + searchDepth);

// Allow setting of engine difficulty
function setEngineDifficulty(newDifficulty) {    

    // Set the difficulty
    difficulty = newDifficulty;
    engine.postMessage('setoption name Skill Level value ' + difficulty)

    // Set the search depth level in accordance with difficulty
    // Easiest + Easy
    if (difficulty < 5) {
        searchDepth = 1;
    // Medium
    } else if (difficulty < 10) {
        searchDepth = 3;       
    // Hard
    } else if (difficulty < 15) {
        searchDepth = 7;  
    // Impossible
    } else {
        searchDepth = 10;      
    }

    // Debugging output
    console.log('Engine difficulty set to ' + difficulty + ' with search depth ' + searchDepth);
}

// Set up responses from the engine
engine.onmessage = function(event) {
    // Engine produces many messages - we only care about 'bestmove' messages for decision making
    if (event.data.startsWith('bestmove')) {
        // Extract only the notation portion of the best move (ex: 'bestmove e1e3')
        var bestMove = event.data.split(' ')[1];

        // Convert the bestmove into a format the chess.js library understands
        // 1st index is starting point, 2nd index is "ending" point (0,2 means 0-1). 
        var source = bestMove.substring(0, 2);
        var target = bestMove.substring(2, 4);
        // 4th index is blank unless there is a promotion (ex: 'e7e8q' means pawn promotes to queen)
        var promotion = bestMove.substring(4, 5);

        // Use the shared game logic for the engine's move
        game.move({
            from: source,
            to: target,
            // Queen promotion as empty string protection
            promotion: promotion || 'q'
        });

        // Update the chessboard with the engine's move
        board.position(game.fen());
        updateStatus();
    }
};

// Trigger the engine to make a move
function makeEngineMove() {
    // Halt thinking if the game is over
    if (game.game_over()) {
        return;
    }
    // Send the current game position to the engine
    engine.postMessage('position fen ' + game.fen());
    // Search for the best move to a certain depth
    engine.postMessage('go depth ' + searchDepth);
}

//==========  Player  ==========
// Prevent interactions once the game is over or during the opponents turn
function onDragStart (source, piece) {
    // Game over
    if (game.game_over()){
        return false;
    }
    // Opponents turn
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }   
}

// Allow piece drop interactions between chess pieces and squares
function onDrop (source, target) {
    // Check if the move is legal 
    var move = game.move({
      from: source,
      to: target,
      // Queen promotion as default
      promotion: 'q' 
    });

    // If the move is illegal, return the piece to its original square
    if (move === null) {
        return 'snapback';
    }

    // Update the turn status text
    updateStatus();

    // Allow a moment before the engine makes its move
    window.setTimeout(makeEngineMove, 250);
}

//==========  Game  ==========
// Update the game status text
function updateStatus() {
  var status = '';

  // Determine whose turn it is
  var moveColor = 'White';
  if (game.turn() === 'b') {
      moveColor = 'Black';
  }

  // Check if a player has legal moves left
  if (game.in_checkmate()) {
      status = 'Game over. ' + moveColor + ' has been checkmated.';
  } else if (game.in_draw()) {
      status = 'Game over, the position is a draw.';
  } else {
      status = moveColor + ' to move.';
      if (game.in_check()) {
          status += ' ' + moveColor + ' is in check.';
      }
  }

  // Update the status div
  $('#status').html(status);

  // Update the move history div
  $('#pgn').html(game.pgn());
}

// Force the board to accurately reflect the game state
function onSnapEnd () {
    board.position(game.fen());
}

// Create configurations for the chessboard before it is created
var config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd
};

// Initialize the chessboard (div with id 'myBoard') 
 var board = Chessboard('myBoard', config);

 // Update the board status on game start
updateStatus();



 