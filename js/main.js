/*
 File:      main.js
 Author:    Maxximillion Thomas
 Purpose:   Activate the dormant js chessboard-1.0.0.js file
 Date:      December 9, 2025
 */

// =============================
// ==  Logic  ==================
// =============================

// Establish the logic and rules of the chess game
var game = new Chess();

// =============================
// ==  Engine  =================
// =============================

// Initialize the Stockfish chess engine
var engine = new Worker('js/stockfish.js');

// Engine timeout will be later used for resetting the engine
var engineTimeout = null;

/* 
    Configure engine starting settings 
    The engine has different difficulty levels (0-20), start at the easiest
    Search depth determines how many moves ahead the engine will consider
*/
var difficulty = 0;
var searchDepth = 1;
engine.postMessage('uci'); 
engine.postMessage('setoption name Skill Level value ' + difficulty); 

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

// =============================
// ==  Player  =================
// =============================

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

    // Make the engine move after a short delay
    window.setTimeout(makeEngineMove, 250);
}

// =============================
// ==  Game  ===================
// =============================

// Update the game status text
function updateStatus() {
    var status = '';

    // Determine whose turn it is
    var moveColor = 'White';
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }

    // Checkmate
    if (game.in_checkmate()) {
        status = 'Game over. ' + moveColor + ' has been checkmated.';
        showGameOverModal(moveColor === 'Black' ? 'You Win!' : 'You Lost', 'Checkmate');

    // Draw
    } else if (game.in_draw()) {
        status = 'Game over, the position is a draw.';
        showGameOverModal('Draw', 'Stalemate / Repetition');

    // Ongoing game
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

// =============================
// ==  UI controls  ============
// =============================

// ========== Reset game ==========
// Reset the game to the starting position
function resetGame() {
    // Clear any existing delayed moves
    window.clearTimeout(engineTimeout);
    // Reset the game logic
    game.reset();
    // Reset the board position
    board.start();
    // Update the status text
    updateStatus();
    // Clear the engine's memory
    engine.postMessage('ucinewgame');
}

// Bind the reset function to the reset button
var resetButton = document.getElementById('resetBtn');
resetButton.addEventListener('click', resetGame);

// ========== Game over  ==========
// Modal Elements
var modal = document.getElementById("gameOverModal");
var modalText = document.getElementById("gameResult");
var modalReason = document.getElementById("gameReason");
var modalBtn = document.getElementById("modalNewGameBtn");

// Show the game over modal with the result  and reason 
function showGameOverModal(result, reason) {
    // win/loss/draw
    modalText.innerText = result;
    // checkmate/stalemate/repetition
    modalReason.innerText = reason;

    // Make the modal visible
    modal.style.display = "flex";
}

function gameOverModalReset() {
    modal.style.display = "none";
    resetGame();
}

// When the user clicks the button, reset the game and hide the modal
modalBtn.addEventListener('click', gameOverModalReset);




 