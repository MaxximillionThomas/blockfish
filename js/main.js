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
var gameActive = false;

// =============================
// ==  Navigation  =============
// =============================

// Store FEN history for back/forward navigation
var fenHistory = [];
var viewingIndex = 0;

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

        // Save the current position to the FEN history
        fenSnapshot();

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
    // No game in progress
    if (!gameActive) {
        return false;
    }   

    // Prevent moving pieces when viewing previous positions
    if (viewingIndex < fenHistory.length - 1) {
        return false;
    }

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

    // Save the current position to the FEN history
    fenSnapshot();

    // Update the turn status text
    updateStatus();

    // Make the engine move after a short delay
    window.setTimeout(makeEngineMove, 250);
}

// =============================
// ==  Game  ===================
// =============================

// ==========  Functions  ==========
// Toggle on/off game controls based on game state
function toggleGameControls(isPlayable) {
    // Difficulty drop-down
    document.getElementById('difficulty').disabled = !isPlayable;
    
    // Color radio buttons
    colorRadios = document.querySelectorAll('input[name="color"]');
    colorRadios.forEach(function(radio) {
        radio.disabled = !isPlayable;
    });

    // Start new game button
    document.getElementById('startBtn').disabled = !isPlayable;

    // Options button
    document.getElementById('optionsBtn').enabled = isPlayable;
}

// Update the game status text
function updateStatus() {
    // If the game is not active, prompt the user
    if (!gameActive) {
        $('#status').html('Click "Start New Game" to begin playing.');
        return;
    }

    // Initialize variables for active game
    var status = '';
    var moveColor = 'White';

    // Determine whose turn it is
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }

    // Checkmate
    if (game.in_checkmate()) {
        status = 'Game over. ' + moveColor + ' has been checkmated.';
        showGameOverModal(moveColor.toLowerCase() != playerColor ? 'You Win!' : 'You Lost', 'Checkmate');
        gameActive = false;

    // Draw
    } else if (game.in_draw()) {
        // Stalemate
        if (game.in_stalemate()) {
            status = 'Game over. A draw by stalemate was reached.';
            showGameOverModal('Draw', 'Stalemate');
        // Repetition
        } else if (game.in_threefold_repetition()) {
            status = 'Game over. A draw by threefold repetition was reached.';
            showGameOverModal('Draw', 'Threefold Repetition');
        // Insufficient material
        } else if (game.insufficient_material()) {
            status = 'Game over. A draw by insufficient material was reached.';
            showGameOverModal('Draw', 'Insufficient Material');
        }
        gameActive = false;

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

    // Unlock game controls if the game is over
    if (!gameActive) {
        toggleGameControls(true);
    }
}

// Force the board to accurately reflect the game state
function onSnapEnd () {
    board.position(game.fen());
}

// Update the move history display with every move  
function updateMoveHistory() {
    // Get the history as an array: ['d4', 'd5', 'c4', 'b5']
    var history = game.history();
    
    // Create an HTML body for storing move history
    var html = '';

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

    // Update the HTML element with the generated table data
    var moveHistoryBodyElement = document.getElementById('moveHistoryBody');
    moveHistoryBodyElement.innerHTML = html;
    
    // Auto-scroll the move history to the latest move
    var pgnElement = document.getElementById('pgn');
    pgnElement.scrollTop = pgnElement.scrollHeight;
}

// Save the current board position to the FEN history
function fenSnapshot() {
    fenHistory.push(game.fen());
    viewingIndex = fenHistory.length - 1;
}

// ==========  Board setup  ==========
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
    // Hide the game over modal if visible
    gameOverModal.style.display = "none";

    // Initialize list of FEN position history
    fenHistory = [game.fen()];
    viewingIndex = 0;

    // Reveal the move history panel
    document.getElementById('pgn').style.display = 'block';

    // Disable mid-game control changes
    gameActive = true;
    toggleGameControls(false);

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
    document.getElementById('gameContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Engine moves first if playing as black
    if (playerColor === 'black') {
        window.setTimeout(makeEngineMove, 250);
    }
}
// Bind the reset function to the reset button
var resetButton = document.getElementById('startBtn');
resetButton.addEventListener('click', startNewGame);

// ==========  Game over modal  ==========
// Modal Elements
var gameOverModal = document.getElementById("gameOverModal");
var gameOverModalText = document.getElementById("gameResult");
var gameOverModalReason = document.getElementById("gameReason");
var gameOverModalRematchBtn = document.getElementById("gameOverModalRematchBtn");
var gameOverModalCloseBtn = document.getElementById("gameOverModalCloseBtn");

// Show the game over modal with the result and reason 
function showGameOverModal(result, reason) {
    // win/loss/draw
    gameOverModalText.innerText = result;
    // checkmate/stalemate/repetition
    gameOverModalReason.innerText = reason;

    // Make the modal visible
    gameOverModal.style.display = "flex";
}

// Start a new game with the same settings
function gameOverModalRematch() {
    startNewGame();
}
// Bind the modal rematch function to the Rematch button
gameOverModalRematchBtn.addEventListener('click', gameOverModalRematch);

// Close the modal without starting a new game
function gameOverModalClose() {
    gameOverModal.style.display = "none";
}
// Bind the close function to the close button
gameOverModalCloseBtn.addEventListener('click', gameOverModalClose);

// ==========  In-game options modal  ==========
var optionsModal = document.getElementById('optionsModal');
var optionsModalBtn = document.getElementById('optionsBtn');
var optionsModalCloseBtn = document.getElementById('optionsModalCloseBtn');
var optionsModalResignBtn = document.getElementById('optionsModalResignBtn');

// Open the options modal
function openOptionsModal() {
    // Prevent opening options before a game starts
    if (!gameActive) {
        return;
    }

    optionsModal.style.display = 'flex';
}
// Bind the open options modal function to the options button
optionsModalBtn.addEventListener('click', openOptionsModal);

// Close the options modal
function closeOptionsModal() {
    optionsModal.style.display = 'none';
}
// Bind the close function to the close button
optionsModalCloseBtn.addEventListener('click', closeOptionsModal);

// Close the options module when clicking outside of it
function optionsModuleOutsideClick(event) {
    if (event.target == optionsModal) {
        optionsModal.style.display = 'none';
    }
}
window.addEventListener('click', optionsModuleOutsideClick);

// Resign the game for a loss
function resignGame() {
    // Clear any queued engine moves
    window.clearTimeout(engineTimeout);

    // Hide the options modal and end the game
    optionsModal.style.display = 'none';
    gameActive = false;
    toggleGameControls(true);

    // Update the move status and show the game over modal
    var moveColor = 'White';
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }
    $('#status').html('Game over. ' + moveColor + ' has resigned.');
    showGameOverModal('Loss', 'Resignation');
}
// Bind the resign function to the resign button
optionsModalResignBtn.addEventListener('click', resignGame);

// ==========  Back / forward navigation  ==========
var backBtn = document.getElementById('backBtn');
var forwardBtn = document.getElementById('forwardBtn');

// Navigate back to the previous position
function navigateBack() {
    if (viewingIndex > 0) {
        viewingIndex--;
        board.position(fenHistory[viewingIndex]);
    }   
}
// Bind the back function to the back button
backBtn.addEventListener('click', navigateBack);

// Navigate forward to the next position
function navigateForward() {
    if (viewingIndex < fenHistory.length - 1) {
        viewingIndex++;
        board.position(fenHistory[viewingIndex]);
    }   
}
// Bind the forward function to the forward button
forwardBtn.addEventListener('click', navigateForward);






 