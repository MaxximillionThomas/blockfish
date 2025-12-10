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
    if (move == null) {
        return 'snapback';
    }
}

// Create configurations for the chessboard before it is created
var config = {
  draggable: true,
  position: 'start',
  onDrop: onDrop
};

// Initialize the chessboard (div with id 'myBoard') 
 var board = Chessboard('myBoard', config);
 