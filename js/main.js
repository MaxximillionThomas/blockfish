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
var playerColor = 'white';

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
    if ((playerColor === 'white' && piece.search(/^b/) !== -1) ||
        (playerColor === 'black' && piece.search(/^w/) !== -1)) {
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
    var moveColor = 'white';
    if (game.turn() === 'b') {
        moveColor = 'black';
    }

    // Checkmate
    if (game.in_checkmate()) {
        status = 'Game over. ' + moveColor + ' has been checkmated.';
        showGameOverModal(moveColor != playerColor ? 'You Win!' : 'You Lost', 'Checkmate');

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
    updateMoveHistory();
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

// ==========  Start new game  ==========
// Reset the game to the starting position
function startNewGame() {
    // Clear queued move and reset game logic
    window.clearTimeout(engineTimeout);
    game.reset();

    // Set the board orientation based on player color
    playerColor = document.querySelector('input[name="color"]:checked').value;
    board.orientation(playerColor);

    // Reset the board 
    board.start();
    updateStatus();
    engine.postMessage('ucinewgame');

    // Focus the center of the board
    document.getElementById('myBoard').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Engine moves first if playing as black
    if (playerColor === 'black') {
        window.setTimeout(makeEngineMove, 250);
    }
}

// Bind the reset function to the reset button
var resetButton = document.getElementById('startBtn');
resetButton.addEventListener('click', startNewGame);

// ==========  Game over  ==========
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
    startNewGame();
}

// When the user clicks the button, reset the game and hide the modal
modalBtn.addEventListener('click', gameOverModalReset);

// ==========  Move history  ==========
function updateMoveHistory() {
    // Get the history as an array: ['d4', 'd5', 'c4', 'b5']
    var history = game.history();
    
    // Create an HTML table for storing move history
    var html = '<table class="move-table">';
    html += '<thead><tr><th>#</th><th>White</th><th>Black</th></tr></thead>';
    html += '<tbody>';

    // Iterate through moves in pairs (1. white, 2. black)
    for (var i = 0; i < history.length; i += 2) {
        var moveNumber = (i / 2) + 1;

        // White move is the first in the pair
        var whiteMove = history[i];

        // Black move is the second in the pair
        if (history[i + 1]) {
            blackMove = history[i + 1];
        // Handle pending black move
        } else {
            blackMove = '';
        }

        html += '<tr>';
        html += '<td>' + moveNumber + '.</td>';
        html += '<td>' + whiteMove + '</td>';
        html += '<td>' + blackMove + '</td>';
        html += '</tr>';
    }

    // Close the table after all moves are added
    html += '</tbody></table>';

    // Update the HTML element with the generated table
    var pgnElement = document.getElementById('pgn');
    pgnElement.innerHTML = html;
    
    // Auto-scroll the move history to the latest move
    pgnElement.scrollTop = pgnElement.scrollHeight;
}




 