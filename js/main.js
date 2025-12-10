/*
 File:      main.js
 Author:    Maxximillion Thomas
 Purpose:   Activate the dormant js chessboard-1.0.0.js file
 Date:      December 9, 2025
 */

// Establish the logic and rules of the chess game
var game = new Chess();

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
}

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
  onDrop: onDrop,
  onSnapEnd: onSnapEnd
};

// Initialize the chessboard (div with id 'myBoard') 
 var board = Chessboard('myBoard', config);

 // Update the board status on game start
updateStatus();
 