/*
 File:      main.js
 Author:    Maxximillion Thomas
 Purpose:   Give interactive capabilities to the web page elements (main menu, chess board, in-game options, etc.)
 Date:      December 9, 2025
 */

// =============================
// ==  Fundamentals  ===========
// =============================

// Establish the logic and rules of the chess game
var game = new Chess();
var playerColor = 'white';
var gameActive = false;
var selectedSquare = null;
var squareClass = 'square-55d63';
var gettingHint = false;
var reviewingGame = false;

// Establish preference trackers
var highlightsEnabled = true;
var clickMovesEnabled = true;
var dragMovesEnabled = true;
var evalBarEnabled = true;

// Store move data history for back/forward navigation
var fenHistory = [];
var viewingIndex = 0;
var evalHistory = [0];
var currentEval = 0;
var hintHistory = [];
var analysisIndex = 0;

// Store sounds used for game actions
var sounds = {
    start: new Audio('audio/game-start.mp3'),
    move: new Audio('audio/move-self.mp3'),
    capture: new Audio('audio/capture.mp3'),
    check: new Audio('audio/move-check.mp3'),
    end: new Audio('audio/game-end.mp3'),
    hover: new Audio('audio/hover.mp3')
};

// =============================
// ==  Bot engine  =============
// =============================

// Initialize the Stockfish chess engine
var botEngine = new Worker('js/stockfish.js');

// Engine timeout will be later used for resetting the engine
var botEngineTimeout = null;

/* 
Configure engine starting settings 
    The engine has different difficulty levels (0-20), start at the easiest
    Search depth determines how many moves ahead the engine will consider
*/
var botDifficulty = 0;
var botSearchDepth = 1;
botEngine.postMessage('uci'); 
botEngine.postMessage('setoption name Skill Level value ' + botDifficulty); 

// Allow setting of engine difficulty
function setBotEngineDifficulty(newDifficulty) {    

    // Set the difficulty
    botDifficulty = newDifficulty;
    botEngine.postMessage('setoption name Skill Level value ' + botDifficulty)

    // Set the search depth level in accordance with difficulty
    // Easiest + Easy
    if (botDifficulty < 5) {
        botSearchDepth = 1;
    // Medium
    } else if (botDifficulty < 10) {
        botSearchDepth = 3;       
    // Hard
    } else if (botDifficulty < 15) {
        botSearchDepth = 7;  
    // Impossible
    } else {
        botSearchDepth = 10;      
    }
}

// Set up responses from the engine
botEngine.onmessage = function(event) {
    // == Evaluation bar ===========
    var line = event.data;
    /*
    Check for 'score' for use in updating the game evaluation
        1.  Determine the score based on the event data
        2.  Adjust the score to be relative to Whites position
        3.  Update the evaluation bar and evaluation score history
    */
    if (line.startsWith('info') && line.includes('score')) {
        var score = 0;

        // 1-A: Mate score
        if (line.includes('mate')) {
            // Raw line example: info depth 10 seldepth 15 score mate 3 nodes 45000 nps 120000
            // Focus mate score (example output = ['3', 'nodes', ... ] )
            var mateString = line.split('mate ')[1];
            // Isolate mate score (example output = '3')
            var mateIn = parseInt(mateString.split(' ')[0]);

            // Set the score to a large number to max out the evaluation bar visual effect
            if (mateIn > 0) {
                score = 10000;
            } else {
                score = -10000;
            }
        }

        // 1-B: Centipawn score
        else if (line.includes('cp')) {
            var centipawnString = line.split('score cp ')[1];
            score = parseInt(centipawnString.split(' ')[0])
        }

        // 2: Adjust the score
        if (game.turn() === 'b') {
            score = -score;
        }

        // 3: Update the eval bar and score history
        currentEval = score;
        if (evalHistory.length > 0) {
            // Overwrite the last entry (message runs multiple times before the engine makes the best move)
            evalHistory[evalHistory.length - 1] = currentEval;
        }
        updateEvalBar(currentEval);
    }
    

    // == Best move ===========
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
        var engineMove = game.move({
            from: source,
            to: target,
            // Queen promotion as empty string protection
            promotion: promotion || 'q'
        });

        // Play a sound after the engine has played its move
        playMoveSound(engineMove);

        // Highlight the engine's move for player awareness
        removeHighlights();
        highlightLastMove(source, target)

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
    botEngine.postMessage('position fen ' + game.fen());
    // Search for the best move to a certain depth
    botEngine.postMessage('go depth ' + botSearchDepth);
}

// =============================
// ==  Hint engine  =============
// =============================

// Set up an engine specifically for generating hints (same process as bot engine)
var hintEngine = new Worker('js/stockfish.js');
var hintDifficulty = 20;
var hintSearchDepth = 10;
hintEngine.postMessage('uci'); 
hintEngine.postMessage('setoption name Skill Level value ' + hintDifficulty); 

// Set up responses from the engine
hintEngine.onmessage = function(event) {
    // Engine produces many messages - we only care about 'bestmove' messages for decision making
    if (event.data.startsWith('bestmove')) {
        // Extract only the notation portion of the best move (ex: 'bestmove e1e3')
        var bestMove = event.data.split(' ')[1];

        // Handle game over (no best move) 
        if (bestMove === '(none)') {
            if (reviewingGame) {
                hintHistory[analysisIndex] = null;
                analysisIndex++;
                triggerMoveAnalysis();
            }
        }

        // Convert the bestmove into a format the chess.js library understands
        // 1st index is starting point, 2nd index is "ending" point (0,2 means 0-1). 
        var source = bestMove.substring(0, 2);
        var target = bestMove.substring(2, 4);

        // A: Reviewing game
        if (reviewingGame) {
            // Store the best move into the history array
            hintHistory[analysisIndex] = { from: source, to: target };

            // If updating the hint for the viewing index that is currently in view by the user
            if (analysisIndex === viewingIndex - 1) {
                navigationUpdate();
            }

            // Process the next move
            analysisIndex ++;
            triggerMoveAnalysis();
        }

        // B: Mid-game
        else {
            // == Highlight the best move squares ==
            // Pulls data from the engine message, whereas status bar uses a new object for algebraic notation (ex: Bxc6)
            highlightHint(source, target);

            // == Update the status bar with the best move notation ==
            // Obtain all possible moves
            var moves = game.moves({ verbose: true });

            // Search through the  moves and find the one that matches the best move provided by the engine
            var matchedMove = moves.find(function(move) {

                // A match must have the same source and target squares
                if (move.from !== source) return false;
                if (move.to !== target) return false;

                // Handle promotions (4 values produced for every promotion)
                if (move.promotion) {
                    if (move.promotion === 'q') {
                        return true;
                    } else {
                        return false;
                    }
                }

                return true;
            });

            // The move must be legal for the current board state (prevents Undo / timing conflicts)
            if (matchedMove !== undefined) {
                $('#status').html("Best move: " + matchedMove.san);
            }
        }
    }
};

// =============================
// ==  Player  =================
// =============================

// Prevent illegal interactions and highlight legal moves
function onDragStart (source, piece) {
    // If the player prefers click-moving
    if (!dragMovesEnabled) {
        return false;
    }

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

    // Clear previous click selections before handling this piece
    if (selectedSquare !== null) {
        selectedSquare = null;

    }

    // Highlight only the selected piece and it's legal moves
    removeHighlights();
    highlightSquare(source);
    highlightMoves(source);

    return true;
}

// Allow piece drop interactions between chess pieces and squares
function onDrop (source, target) {
    // Classify the move as a 'click' if the piece is dragged and dropped to the same square
    if (source === target) {
        handleSquareClickInteractions(source);

        // If in drag-mode, only display legal move highlighting while holding the piece (onDrag, not onDrop)
        if (!clickMovesEnabled) {
            removeHighlights();
        }

        // Visually return the piece to it's original square
        return 'snapback';
    }

    // Check if the move is legal 
    var move = game.move({
      from: source,
      to: target,
      // Queen promotion as default
      promotion: 'q' 
    });

    // If the move is illegal, return the piece to its original square
    if (move === null) {
        selectedSquare = null;
        removeHighlights();
        return 'snapback';
    }

    // Clear click-moving state after a successful move
    selectedSquare = null;

    // Play a sound and wiggle the piece after the move has passed validation
    playMoveSound(move);
    wiggleAnimation(target, 50);


    // Highlight the players move for awareness
    removeHighlights();
    highlightLastMove(source, target); 

    // Save the current position to the FEN history
    fenSnapshot();

    // Update the turn status text
    updateStatus();

    // Make the engine move after a short delay
    window.setTimeout(makeEngineMove, 250);
}

// Highlight the square of the piece that the player has clicked
function highlightSquare(square) {
    var $square = $('#myBoard .square-' + square);
    $square.addClass('highlight-source');
}

// Highlight the legal moves for the piece that the player has clicked
function highlightMoves(square) {
    if (highlightsEnabled) {
        // Get legal moves for the piece
        var moves = game.moves({
            square: square,
            verbose: true
        });

        // Highlight every legal square
        for (var i = 0; i < moves.length; i++) {
            $('#myBoard .square-' + moves[i].to).addClass('highlight-move');
        }
    }
}

// Remove highlighting of source square and legal move squares
function removeHighlights() {
    // Highlights
    $('#myBoard .square-55d63').removeClass('highlight-source');
    $('#myBoard .square-55d63').removeClass('highlight-move');
    $('#myBoard .square-55d63').removeClass('highlight-hint');
    if (game.in_check() === false) $('#myBoard .square-55d63').removeClass('in-check');

    // Status bar text
    var currentText = $('#status').text();
    if (currentText.startsWith("Best move:")) updateStatus();
}

// Clear the highlights of the last move played
function clearLastMoveHighlights() {
    $('#myBoard .square-55d63').removeClass('highlight-played');
}

// Update the highlights during previous move navigation
function updateHistoryHighlights() {
    // Don't show highlights on the first move
    if (viewingIndex === 0) {
        clearLastMoveHighlights();
        return;
    }

    // Retrieve the full move history (verbose allows for to/from details)
    var history = game.history({verbose: true});

    // Highlight the last move's details
    var moveIndex = viewingIndex - 1
    if (history[moveIndex]) {
        var move = history[moveIndex];
        highlightLastMove(move.from, move.to);
    }
}

// Highlight the last move played
function highlightLastMove(source, target) {
    clearLastMoveHighlights();
    $('#myBoard .square-' + source).addClass('highlight-played');
    $('#myBoard .square-' + target).addClass('highlight-played');
}

// Enable and disable legal move highlighting ability
function toggleHighlights() {
    highlightsEnabled = !highlightsEnabled;
}

// Handle the logic of square clicks under different scenarios
function handleSquareClickInteractions(square) {
    // If the user prefers drag-moving
    if (!clickMovesEnabled) {
        return;
    }

    // Prevent pre-game interactions
    if (!gameActive) {
        return;
    }

    // Scenario 1 - player clicked a square to select a piece
    // Current selection is null - no piece previously selected
    if (selectedSquare === null) {
        var piece = game.get(square);
        
        // Must be a piece, and must be the players color
        if (!piece || piece.color !== game.turn()) {
            return;
        }

        // Reset highlights and status bar text
        removeHighlights();

        // Select it
        selectedSquare = square;
        highlightSquare(square);
        highlightMoves(square);
        return;
    }

    // Scenario 2 - player clicked a square to move a piece
    // 2A. Same square clicked - deselect it
    if (square === selectedSquare) {
        selectedSquare = null;
        removeHighlights();
        return;
    }

    // 2B. New piece of the same color selected - change selection
    var piece = game.get(square);
    // If(piece) returns true if selection is not null - piece.color crashes on null
    if (piece && piece.color === game.turn()) {
        selectedSquare = square;
        removeHighlights();
        highlightSquare(square);
        highlightMoves(square);
        return;
    }

    // 2C. Attempt to move the selected piece to the target square
    var move = game.move({
        from: selectedSquare,
        to: square,
        promotion: 'q'
    });

    // 2D. Resolve the move
    if (move === null) {
        // Illegal move
        selectedSquare = null;
        removeHighlights();
    } else {
        // Legal move
        board.position(game.fen());
        fenSnapshot();
        updateStatus();
        selectedSquare = null;
        playMoveSound(move);
        wiggleAnimation(square, 250);
        if (game.in_check() === false) removeHighlights();
        window.setTimeout(makeEngineMove, 250);
    }
}

// Perform an action based on the type of square clicked
function onSquareClick(event) {
    // 'this' is the specific .square-55d63 element that was clicked
    var square = $(this).attr('data-square');
    handleSquareClickInteractions(square);
}
// Bind the square click function to board clicks 
$('#myBoard').on('click', '.square-55d63', onSquareClick);

// Wiggle animation on piece hover/drop
function wiggleAnimation(target, delay) {
    // If no delay explicitly provided, wait 50ms for the board to finish snapping/redrawing
    var waitTime = delay || 50;

    window.setTimeout(function() {
        // Find the square and piece image
        var $targetSquare = $('#myBoard .square-' + target);
        var $targetImage = $targetSquare.find('img');

        // Ensure the element exists (has loaded)
        if ($targetImage.length > 0) {
            // Apply the wiggle animation class
            $targetImage.addClass('drop-wiggle');
            
            // Remove the class after the animation ends (allows for wiggling on next interaction)
            window.setTimeout(function() {
                $targetImage.removeClass('drop-wiggle');
            }, 400);
        }
    }, waitTime);   
}

// Play a sound when hovering over a piece of the players color
function playHoverSound() {
    // Retrieve the piece data
    var piece = $(this).attr('data-piece');
    
    // Play the audio if the piece belongs to the player
    if (piece.charAt(0) === playerColor.charAt(0)) {
        playSound('hover');
    }
}
// Bind the hover sound function to piece-hovering
$('#myBoard').on('mouseenter', '.square-55d63 img', playHoverSound);

// =============================
// ==  Game  ===================
// =============================

// ==========  Functions  ==========
// Toggle on/off game controls based on game state (true = cannot be changed mid-game)
function toggleGameControls(gameInProgress) {
    // Manu options
    // Difficulty drop-down
    document.getElementById('difficulty').disabled = gameInProgress;
    // Color radio buttons
    colorRadios = document.querySelectorAll('input[name="color"]');
    colorRadios.forEach(function(radio) {
        radio.disabled = gameInProgress;
    });
    // Start new game button
    document.getElementById('startBtn').disabled = gameInProgress;

    // In-game options
    // Options button
    document.getElementById('optionsBtn').disabled = !gameInProgress;
    // Undo button
    document.getElementById('undoBtn').disabled = !gameInProgress;
    // Navigation buttons
    toggleNavigation();
    // Hint button
    document.getElementById('hintBtn').disabled = !gameInProgress;
    // Resign button
    document.getElementById('resignBtn').disabled = !gameInProgress;
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
        openGameOverModal(moveColor.toLowerCase() !== playerColor ? 'You Win!' : 'You Lost', 'Checkmate');
        gameActive = false;
        highlightKingCheck();
        currentEval = (game.turn() === 'b') ? 10000 : -10000;
        evalHistory[evalHistory.length - 1] = currentEval;

    // Draw
    } else if (game.in_draw()) {
        // Stalemate
        if (game.in_stalemate()) {
            status = 'Game over. A draw by stalemate was reached.';
            openGameOverModal('Draw', 'Stalemate');
        // Repetition
        } else if (game.in_threefold_repetition()) {
            if (game.in_check()) highlightKingCheck();
            status = 'Game over. A draw by threefold repetition was reached.';
            openGameOverModal('Draw', 'Threefold Repetition');
        // Insufficient material
        } else if (game.insufficient_material()) {
            status = 'Game over. A draw by insufficient material was reached.';
            openGameOverModal('Draw', 'Insufficient Material');
        }
        gameActive = false;
        currentEval = 0;
        evalHistory[evalHistory.length - 1] = currentEval;

    // Ongoing game
    } else {
        status = moveColor + ' to move.';
        if (game.in_check()) {
            highlightKingCheck();
            status += ' ' + moveColor + ' is in check.';
        }
    }

    // Update visuals
    $('#status').html(status);
    document.getElementById('gameContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Update the move history div
    updateMoveHistory();

    // Toggle navigation controls as appropriate
    toggleNavigation();

    // Unlock game controls if the game is over
    if (!gameActive) {
        toggleGameControls(false);
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
        var whiteIndex = i + 1;
        var whiteMove = '<span class="move-link" data-index="' + whiteIndex + '">' + history[i] + '</span>';

        // Black move is the second in the pair
        if (history[i + 1]) {
            blackIndex = i + 2;
            blackMove = '<span class="move-link" data-index="' + blackIndex + '">' + history[i + 1] + '</span>';
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
    // Save board state
    fenHistory.push(game.fen());
    viewingIndex = fenHistory.length - 1;
    // Save evaluation state
    evalHistory.push(currentEval);
}

// Highlight the King when in check
function highlightKingCheck(color) {
    // Establish the target piece (wK or bK)
    var kingColor = color || game.turn();
    var kingNotation = kingColor + 'K';

    // Get the board state
    var boardSquares = board.position();

    // Locate the target piece
    for (var square in boardSquares) {
        if (boardSquares[square] === kingNotation) {
            var kingSquare = square;
            // King located - stop searching
            break;
        }
    }

    // Apply the class
    removeHighlights();
    $('#myBoard .square-' + kingSquare).addClass('in-check');

    // Apply a wiggle animation
    wiggleAnimation(kingSquare, 250);
}

// Start a batch analysis of the completed game's move history
function analyzeGame() {
    // Reset variables
    hintHistory = [];
    analysisIndex = 0;

    // Trigger the move analysis process
    triggerMoveAnalysis();
}

// Process a move in the move history list
function triggerMoveAnalysis() {
    // Stop once every move has been analyzed
    if (analysisIndex >= fenHistory.length) return;

    // Retrieve the board state for the targeted turn
    var fen = fenHistory[analysisIndex];

    // Obtain the best move for the targeted turn
    hintEngine.postMessage('position fen ' + fen);
    hintEngine.postMessage('go depth ' + hintSearchDepth);
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
    // Disallow accidental new game start-up
    if (gameActive) {
        return;
    }

    // Prevent game review processes
    reviewingGame = false;
    document.getElementById('pgn').style.display = 'none';

    // Reset visuals
    closeGameOverModal();
    removeHighlights();

    // Clear queued move and reset game logic
    window.clearTimeout(botEngineTimeout);
    game.reset();

    // Initialize list of FEN position & evaluation score history
    fenHistory = [game.fen()];
    viewingIndex = 0;
    evalHistory = [0];
    currentEval = 0;
    updateEvalBar(currentEval);

    // Reveal the move history panel and control buttons
    document.getElementById('optionsBtn').style.display = '';
    document.getElementById('undoBtn').style.display = '';
    document.getElementById('hintBtn').style.display = '';
    document.getElementById('resignBtn').style.display = '';

    // Disable mid-game control changes
    gameActive = true;
    toggleGameControls(true);

    // Set the board orientation based on player color
    playerColor = document.querySelector('input[name="color"]:checked').value;
    board.orientation(playerColor);

    // Replace CSS class for interactivity with only the players color pieces
    var boardElement = document.getElementById('myBoard');
    boardElement.classList.remove('board-white', 'board-black');
    boardElement.classList.add('board-' + playerColor);

    // Reset the board 
    board.start();
    updateStatus();
    botEngine.postMessage('ucinewgame');

    // Play the start game sound
    playSound('start');

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
var gameOverModalCloseBtn = document.getElementById("gameOverModalCloseBtn");
var rematchBtn = document.getElementById("rematchBtn");
var gameReviewBtn = document.getElementById("gameReviewBtn");

// Show the game over modal with the result and reason 
function openGameOverModal(result, reason) {
    // win/loss/draw
    gameOverModalText.innerText = result;
    // checkmate/stalemate/repetition
    gameOverModalReason.innerText = reason;

    // Make the modal visible
    gameOverModal.style.display = "flex";
}

// Bind the start new gamefunction to the Rematch button
rematchBtn.addEventListener('click', startNewGame);

// Close the Game Over modal
function closeGameOverModal() {
    // Close the modal
    gameOverModal.style.display = "none";
}

// Close the Game Over modal and return to the main menu
function exitToMenu() {
    // Close the modal
    closeGameOverModal();

    // Stop pending actions and reset flags
    window.clearTimeout(botEngineTimeout);
    gameActive = false;
    reviewingGame = false;

    // Reset game logic and visuals
    removeHighlights();
    clearLastMoveHighlights();
    game.reset();
    board.start();

    // Reset move history
    fenHistory = [game.fen()];
    viewingIndex = 0;
    evalHistory = [0];
    currentEval = 0;
    updateEvalBar(0);

    // Reset controls and refocus
    toggleGameControls(false);
    updateStatus();
    document.getElementById('difficulty').focus();
}

// Bind the exit to menu function to the close button
gameOverModalCloseBtn.addEventListener('click', exitToMenu);

// Determine whether the game over modal is open
function gameOverModalStatus() {
    var status = false;
    if (gameOverModal.style.display === 'flex') {
        status = true;
    }
    return status;
}

// Review the previous game
function reviewGame() {
    reviewingGame = true;

    // Reset visuals
    closeGameOverModal();
    navigateFirst();
    removeHighlights();

    // Hide controls
    optionsModalBtn.style.display = 'none';
    undoBtn.style.display = 'none';
    hintBtn.style.display = 'none';
    resignBtn.style.display = 'none';

    // Display move history
    document.getElementById('pgn').style.display = 'block';

    // Trigger batch move analysis
    analyzeGame();
}
// Bind the review game function to the game review button
gameReviewBtn.addEventListener('click', reviewGame);

// ==========  In-game options modal  ==========
var optionsModal = document.getElementById('optionsModal');
var optionsModalBtn = document.getElementById('optionsBtn');
var optionsModalCloseBtn = document.getElementById('optionsModalCloseBtn');
var optionsModalHighlightsCheckbox = document.getElementById('optionsModalHighlightsCheckbox');
var clickMovingPreference = document.querySelector('input[name="optionsModalMovingPreference"][value="click"]');
var dragMovingPreference = document.querySelector('input[name="optionsModalMovingPreference"][value="drag"]');
var bothMovingPreference = document.querySelector('input[name="optionsModalMovingPreference"][value="both"]');

// Not usable until game start
optionsModalBtn.disabled = true;

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
    if (event.target === optionsModal) {
        closeOptionsModal();
    }
}
window.addEventListener('click', optionsModuleOutsideClick);

// Determine whether the options modal is open
function optionsModalStatus() {
    var status = false;
    if (optionsModal.style.display === 'flex') {
        status = true;
    }
    return status;
}

// Bind the move-highlighting toggle function to the highlights checkbox
optionsModalHighlightsCheckbox.addEventListener('click', toggleHighlights)

// Set clicking and dragging abilities according to user preferences
function setMovingPreference(enableClicking, enableDragging) {
    clickMovesEnabled = enableClicking;
    dragMovesEnabled = enableDragging;

    // Handle conflicts if the user changes settings while a piece is selected
    if (!clickMovesEnabled) {
        selectedSquare = null;
        removeHighlights();
    }
}
// Bind the moving preference function to the moveving preference radiobuttons
clickMovingPreference.addEventListener('change', function() { setMovingPreference(true, false); });
dragMovingPreference.addEventListener('change', function() { setMovingPreference(false, true); });
bothMovingPreference.addEventListener('change', function() { setMovingPreference(true, true); });

// ==========  Confirm choice (yes/no) modal  ==========
var yesNoModal = document.getElementById('yesNoModal');
var yesBtn = document.getElementById('yesBtn');
var noBtn = document.getElementById('noBtn');
var yesNoCloseBtn = document.getElementById('yesNoCloseBtn');

// Open yesNoModal
function openYesNoModal() {
    yesNoModal.style.display = 'flex';
}

// Close yesNoModal
function closeYesNoModal() {
    yesNoModal.style.display = 'none';
}

// Determine whether the YesNo modal is open
function yesNoModalStatus() {
    var status = false;
    if (yesNoModal.style.display == 'flex') {
        status = true;
    }
    return status;
}

// Resign only if the user clicks Yes to confirm their choice
function confirmResignation() {
    // Clear any queued engine moves
    window.clearTimeout(botEngineTimeout);

    // Close the confirmation modal and end the game
    closeYesNoModal();
    gameActive = false;
    toggleGameControls(false);
    playSound('end');

    // Update the move status and show the game over modal
    var moveColor = 'White';
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }
    $('#status').html('Game over. ' + moveColor + ' has resigned.');
    openGameOverModal('Loss', 'Resignation');
}
// Bind the resignation confirmation button to the Yes button
yesBtn.addEventListener('click', confirmResignation);

// Cancel resignation and return the user to the options meodal
function cancelResignation() {
    closeYesNoModal();
}
// Bind the resignation cancellation function to the cancel buttons
noBtn.addEventListener('click', cancelResignation);
yesNoCloseBtn.addEventListener('click', cancelResignation);

// ==========  Back / forward navigation  ==========
var backBtn = document.getElementById('backBtn');
var forwardBtn = document.getElementById('forwardBtn');
var firstBtn = document.getElementById('firstBtn');
var lastBtn = document.getElementById('lastBtn');
backBtn.disabled = true;
forwardBtn.disabled = true;
firstBtn.disabled = true;
lastBtn.disabled = true;

// Navigate back to the previous position
function navigateBack() {
    if (viewingIndex > 0) {
        viewingIndex--;
        navigationUpdate();
    }   
}
// Bind the back function to the back button
backBtn.addEventListener('click', navigateBack);

// Navigate forward to the next position
function navigateForward() {
    if (viewingIndex < fenHistory.length - 1) {
        viewingIndex++;
        navigationUpdate();
    }   
}
// Bind the forward function to the forward button
forwardBtn.addEventListener('click', navigateForward);

// Navigate back to the first move
function navigateFirst() {
    viewingIndex = 0;
    navigationUpdate();        
}
// Bind the first function to the first button
firstBtn.addEventListener('click', navigateFirst);

// Navigate back to the last move
function navigateLast() {
    viewingIndex = fenHistory.length - 1;
    navigationUpdate();
}
// Bind the last function to the last button
lastBtn.addEventListener('click', navigateLast);

// Enable / disable move viewing navigation
function toggleNavigation() {
    // Backward navigation
    if (viewingIndex === 0) {
        backBtn.disabled = true;
        firstBtn.disabled = true;
    } else {
        backBtn.disabled = false;
        firstBtn.disabled = false;
    }

    // Forward navigation
    if (viewingIndex === fenHistory.length - 1) {
        forwardBtn.disabled = true;
        lastBtn.disabled = true;
    } else {
        forwardBtn.disabled = false;
        lastBtn.disabled = false;
    }

    // Undo function
    if (viewingIndex === 0 || gameActive === false) {
        undoBtn.disabled = true;
    } else {
        undoBtn.disabled = false;
    }

    // Hint function
    if (viewingIndex !== fenHistory.length - 1) {
        hintBtn.disabled = true;
    } else {
        hintBtn.disabled = false;
    }
}

// Update the board and move highlights per the viewing index 
function navigationUpdate() {
    // Update the board view
    board.position(fenHistory[viewingIndex]);
    document.getElementById('gameContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Update previous move highlights
    updateHistoryHighlights();

    // Update in-check highlights
    $('#myBoard .square-55d63').removeClass('in-check');
    var move = (viewingIndex !== 0) ? getPreviousMove() : null;
    if (move !== null) {
        // Check for check (+) or checkmate (#)
        if (move.san.includes('+') || move.san.includes('#')) {
            // The previous move (opposite color) put THIS color in check
            colorInCheck = (move.color === 'w') ? 'b' : 'w';
            highlightKingCheck(colorInCheck);
        }

        // Apply the wiggle animation
        wiggleAnimation(move.to, 250);
    }

    // Play audio based on the type of move being viewed    
    playHistoricalMoveSound();
    
    // Update the evaluation score bar
    updateEvalBar(evalHistory[viewingIndex]);

    // Update the move status text
    if (reviewingGame) {
        $('#status').html("Move quality:");
    } else if (viewingIndex !== fenHistory.length - 1) {
        $('#status').html("Viewing a previous move...");
    } else {
        updateStatus();
    }

    // Clear existing best move highlights
    $('#myBoard .square-55d63').removeClass('highlight-hint');

    // Highlight best moves automatically if in game review mode
    if (reviewingGame && viewingIndex > 0) {
        // Clear existing move judgement
        $('.judgement-label').remove();

        // Get the index of the previous move
        moveIndex = viewingIndex - 1;

        // Display the best move & judgement only if the analysis has finished loading
        if (hintHistory[moveIndex]) {
            // Best move
            var hint = hintHistory[moveIndex];
            highlightHint(hint.from, hint.to);

            // Judgement
            var prevEval = evalHistory[moveIndex];
            var currEval = evalHistory[moveIndex + 1];
            var previousMove = getPreviousMove();
            var judgement = determineMoveJudgement(previousMove, hint, prevEval, currEval, previousMove.color);
            $('#status').append('<span class="judgement-label ' + judgement.class + '">' + judgement.text + '</span>');
        }
    }

    // Disable/enable navigation buttons as necessary
    toggleNavigation();
}

// ==========  Undo move  ==========
var undoBtn = document.getElementById('undoBtn');

// Not usable until game start
undoBtn.disabled = true;

// Undo the previous move
function undoMove() {
    // 1. Game must be in progress
    if (!gameActive) {
        return;
    }
    // 2. One move must have beeen completed by BOTH sides before the player may undo a move
    if (game.history().length < 2) {
        return;
    }
    // 3. It must be the players turn
    if (game.turn() !== playerColor.charAt(0)) {
        return;
    }

    // Undo the players previous move and the engines response
    game.undo();
    game.undo();

    // Remove the previous moves from the move history
    fenHistory.pop();
    fenHistory.pop();
    evalHistory.pop();
    evalHistory.pop();

    // Reset the evaluation score the the last valid value
    if (evalHistory.length > 0) {
        currentEval = evalHistory[evalHistory.length - 1];
    } else {
        currentEval = 0;
    }

    // Update the visual board
    viewingIndex = fenHistory.length - 1;
    board.position(game.fen());

    // Reset visual helpers and trigger audio 
    updateStatus();
    removeHighlights();
    selectedSquare = null;
    updateHistoryHighlights();
    updateEvalBar(currentEval);
    playHistoricalMoveSound();
}
undoBtn.addEventListener('click', undoMove);

// ==========  Hint (best move)  ==========
var hintBtn = document.getElementById('hintBtn');
hintBtn.disabled = true;

// Highlight the best move when a hint is requested
function highlightHint(source, target) {
    // Clear previous hints
    $('#myBoard .square-55d63').removeClass('highlight-hint');

    // Highlight the start and end squares of the hinted move
    $('#myBoard .square-' + source).addClass('highlight-hint');
    $('#myBoard .square-' + target).addClass('highlight-hint');
}

// Trigger a hint request
function getHint() {
    // State checks
    if (!gameActive) return;
    if (game.turn() !== playerColor.charAt(0)) return;
    if (viewingIndex !== fenHistory.length - 1) return;

    // Request the best move from the hint engine
    hintEngine.postMessage('position fen ' + game.fen());
    hintEngine.postMessage('go depth ' + hintSearchDepth);
}
// Bind the get hint function to the hint button
hintBtn.addEventListener('click', getHint);

// ==========  Resign game  ==========
var resignBtn = document.getElementById('resignBtn');
resignBtn.disabled = true;

// Resign the game for a loss
function resignGame() {
    yesNoModal.style.display = 'flex';

}
// Bind the resign function to the resign button
resignBtn.addEventListener('click', resignGame);

// =============================
// ==  Evaluation bar  =========
// =============================
evalContainer = document.getElementById('evalContainer');
optionsModalEvalBarCheckbox = document.getElementById('optionsModalEvalBarCheckbox');

// Show/hide the evaluation bar 
function toggleEvalBar() {
    evalBarEnabled = !evalBarEnabled;
    if (evalBarEnabled) {
        evalContainer.style.display = "";
    } else {
        evalContainer.style.display = "none";
    }
}
// Bind the eval toggle function to the eval toggle button
optionsModalEvalBarCheckbox.addEventListener('change', toggleEvalBar);

// Update evaluation bar
function updateEvalBar(centipawns) {
    evalBar = document.getElementById('evalBar');
    evalScore = document.getElementById('evalScore');
    var mateIncoming = Math.abs(centipawns) > 5000 ? true : false
    var barHeight = calculateEvaluation(centipawns);

    // Keep the bar within a fixed range for visual clarity
    if (barHeight > 95) {
        barHeight = 95;
        if (mateIncoming) barHeight = 100;
    }
    if (barHeight < 5) {
        barHeight = 5;
        if (mateIncoming) barHeight = 0;        
    }

    // Orientation (BAR) - flip if playing as Black
    if (playerColor === 'black') {
        evalBar.style.top = '0';
        evalBar.style.bottom = 'auto';
    } else {
        evalBar.style.top = 'auto';
        evalBar.style.bottom = '0';
    }

    // Set the html bar height according to the new value
    evalBar.style.height = barHeight + '%';

    // Give meaning to the centipawn advantage
    evalScoreText = '';
    if (mateIncoming) {
        evalScoreText = 'M';
    } else {
        var pawnAdvantage = Math.abs(centipawns) / 100;
        // Formated to one decimal place
        evalScoreText = pawnAdvantage.toFixed(1);
    }

    // Reset eval bar labels
    evalScore.classList.remove('eval-score-white', 'eval-score-black');
    evalScore.innerText = evalScoreText;

    if (centipawns >= 0) {
        // White is winning
        evalScore.classList.add('eval-score-white');

        // Orientation (TEXT) - flip if playing as Black
        if (playerColor === 'black') {
            evalScore.style.top = '5px';
            evalScore.style.bottom = 'auto';
        } else {
            evalScore.style.bottom = '5px';
            evalScore.style.top = 'auto';
        }

    } else {
        // Black is winning
        evalScore.classList.add('eval-score-black');

        // Orientation (TEXT - flip if playing as Black
        if (playerColor === 'black') {
            evalScore.style.bottom = '5px';
            evalScore.style.top = 'auto';
        } else {
            evalScore.style.top = '5px';
            evalScore.style.bottom = 'auto';
        }

    }
}

/* 
Calculate the game evaluation (who is winning)
    Stockfish tracks score by centipawns
    100 centipawn = 1 pawn
    Evaluation is always relative to Whites position 
*/
function calculateEvaluation(centipawnAdvantage) {
    // 0.004 is the commonly used sensitivity factor for game evaluation in chess programs
    var sensitivityFactor = 0.004;
    // Calculate the chance of winning based on the centipawn advantage
    var winChance = 1 / (1 + Math.pow(10, -sensitivityFactor * centipawnAdvantage))
    // Return the chance of White winning as a percentage
    return winChance * 100;
}   

// =============================
// ==  Sounds  =================
// =============================

// Helper to play sounds safely
function playSound(name) {
    var sound = sounds[name];

    if (sound !== null) {
        // Reset the sound to the beginning
        sound.currentTime = 0;

        // Play the sound
        var soundSample = sound.play();

        // Handle browser interupptions
        if (soundSample !== undefined) {
            soundSample.catch(function(error) {
                console.log('Sound interrupted', error);
            });
        }
    }
}

// Play a sound when a piece is successfully moved
function playMoveSound(moveResult) {
    // Game-ending move
    if (game.game_over()) {
        playSound('end');
        return;
    }

    // A check was delivered
    if (game.in_check()) {
        playSound('check');
        return;
    }

    // A piece was captured
    if (moveResult.captured) {
        playSound('capture');
        return;
    }

    // Default: normal move
    playSound('move');
}

// Retrieve the details of the previously played move
function getPreviousMove() {
    var history = game.history({verbose: true});
    var moveIndex = viewingIndex - 1;
    var move = history[moveIndex];
    return move;
}

// Play sounds during move navigation, based on historical move data
function playHistoricalMoveSound() {
    if (viewingIndex === 0) {
        playSound('move');
        return;
    }

    // Determine the kind of move played
    var move = getPreviousMove();

    // Checkmate delivered
    if (move.san.includes('#')) {
        playSound('end');
        return;
    }

    // Check delivered
    if (move.san.includes('+')) {
        playSound('check');
        return;
    }

    // Piece captured
    if (move.san.includes('x')) {
        playSound('capture');
        return;
    }

    // Default: normal move
    playSound('move');
}

// =============================
// ==  Move history  ===========
// =============================

// Navigate to a move by move-history click
function moveHistoryNavigation() {
    // Get the index of the clicked move
    var index = $(this).attr('data-index');

    // Navigate to the viewing index of the move
    viewingIndex = parseInt(index);
    navigationUpdate();
}
// Bind the move history navigation function to move history clicking
$('#moveHistoryBody').on('click', '.move-link', moveHistoryNavigation);

// Determine the quality of the move played based on evaluation score
function determineMoveJudgement(movePlayed, bestMove, previousEvaluation, currentEvaluation, turnColor) {
    var judgement = {};

    // The best move was played
    if (movePlayed.from === bestMove.from && movePlayed.to === bestMove.to) {
        judgement = { text: 'Best', class: 'judgement-best' };
    }

    // Other move played
    else {
        // Compare winning chance before and after the move (min 0, max 100)
        var previousWinningChance = calculateEvaluation(previousEvaluation);
        var currentWinningChance = calculateEvaluation(currentEvaluation);

        /*
        Calculate the loss of advantage as the difference between evaluation score
        The engine always calculates evaluation score from White's perspective
            Increase of score - favorable for White
            Decrease of score - favorable for Black
        */
        var lostAdvantage = 0;
        if (turnColor === 'w') {
            // White loses chances if the score gets smaller
            lostAdvantage = previousWinningChance - currentWinningChance;
        } else {
            // Black loses chances if the score gets bigger
            lostAdvantage = currentWinningChance - previousWinningChance;
        }

        // Categorize the loss of advantage to determine move judgement
        if (lostAdvantage <= 10) {
            judgement = { text: 'Good', class: 'judgement-good' };
        } else if (lostAdvantage <= 25) {
            judgement = { text: 'Bad', class: 'judgement-bad' };
        } else {
            judgement = { text: 'Blunder', class: 'judgement-blunder' };
        }
    }

    return judgement;
}

// =============================
// ==  Hotkeys  ================
// =============================

// Ordered by probable frequency of use by chess players
document.addEventListener('keydown', function(event) {

// Debugging
console.log(event.key);

    switch (event.key) {
        // Navigate back
        case 'ArrowLeft':
        case 'Home':
            navigateBack();
            break;

        // Navigate forward
        case 'ArrowRight':
        case 'End':
            navigateForward();
            break;
   
        case 'b':
        case 'B':
            // Play as Black
            if (!optionsModalStatus()) {
                blackBtn = document.querySelector('input[name="color"][value="black"]'); 
                blackBtn.checked = true;
                blackBtn.focus();

            // Moving preference - click
            } else {
                var bothMovingPreference = document.querySelector('input[name="optionsModalMovingPreference"][value="both"]');
                if (optionsModalStatus()) {
                    setMovingPreference(true, true);
                    bothMovingPreference.checked = true;
                    bothMovingPreference.focus();
                }
            }
            break;

        // Play as White
        case 'w':
        case 'W':
            whiteBtn = document.querySelector('input[name="color"][value="white"]');
            whiteBtn.checked = true;
            whiteBtn.focus();
            break;
        
        // Start new game
        case 's':
        case 'S':
            startNewGame();
            break;

        // Resign or rematch
        case 'r':
        case 'R':
            // Resign 
            if (gameActive) {
                resignGame();
            // Rematch
            } else {
                if (gameOverModalStatus()) {
                    startNewGame();
                }
            }
            break;

        // Close all modals
        case 'Escape':
            if (gameOverModalStatus()) {
                exitToMenu();
            } else if (optionsModalStatus()) {
                closeOptionsModal();
            } else if (yesNoModalStatus()) {
                cancelResignation();
            }
            break;

        // Open options modal
        case 'o':
        case 'O':
            openOptionsModal();
            break;

        case 'd':
        case 'D':
            // Difficulty
            if (!optionsModalStatus()) {
                document.getElementById('difficulty').focus();

            // Moving preference - click
            } else {
                var dragMovingPreference = document.querySelector('input[name="optionsModalMovingPreference"][value="drag"]');
                if (optionsModalStatus()) {
                    setMovingPreference(false, true);
                    dragMovingPreference.checked = true;
                    dragMovingPreference.focus();
                }
            }
            break;

        // Confirm resignation
        case 'y':
        case 'Y':
            if (yesNoModalStatus()) {
                confirmResignation();
            }
            break;

        // Cancel resignation
        case 'n':
        case 'N':
            if (yesNoModalStatus()) {
                cancelResignation();
            }
            break;

        
        case 'h':
        case 'H':
            // Toggle highlighting
            var optionsModalHighlightsCheckbox = document.getElementById('optionsModalHighlightsCheckbox');
            if (optionsModalStatus()) {
                toggleHighlights();
                optionsModalHighlightsCheckbox.checked = highlightsEnabled;
            }

            // Request a hint
            else {
                getHint();
            }
            break;

        // Moving preference - click
        case 'c':
        case 'C':
            var clickMovingPreference = document.querySelector('input[name="optionsModalMovingPreference"][value="click"]');
            if (optionsModalStatus()) {
                setMovingPreference(true, false);
                clickMovingPreference.checked = true;
                clickMovingPreference.focus();
            }
            break;

        // Undo previous move
        case 'u':
        case 'U':
            undoMove();
            break;

        // Toggle on/off evaluation score bar
        case 'e':
        case 'E':
            var optionsModalEvalBarCheckbox = document.getElementById('optionsModalEvalBarCheckbox');
            if (optionsModalStatus()) {
                toggleEvalBar();
                optionsModalEvalBarCheckbox.checked = evalBarEnabled;
            }
            break;

        // Navigate to the first move 
        case 'f':
        case 'F':
            navigateFirst();
            break;

        // Navigate to the last move
        case 'l':
        case 'L':
            navigateLast();
            break;

        // Review the previous game
        case 'g':
        case 'G':
            if (gameOverModalStatus()) {
                reviewGame();
            }
            break;
    }
});
