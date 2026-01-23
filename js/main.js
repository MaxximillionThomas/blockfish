/*
 File:      main.js
 Author:    Maxximillion Thomas
 Purpose:   Give interactive capabilities to the web page elements (main menu, chess board, in-game options, etc.)
 Date:      December 9, 2025
 */

// =============================
// ==  Constants  ==============
// =============================

// Game object for tracking state
const game = new Chess();

// Create configurations for the chessboard before it is created
const config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};

// Store sounds used for game actions
const sounds = {
    start: new Audio('audio/game-start.mp3'),
    move: new Audio('audio/move-self.mp3'),
    capture: new Audio('audio/capture.mp3'),
    check: new Audio('audio/move-check.mp3'),
    end: new Audio('audio/game-end.mp3'),
    hover: new Audio('audio/hover.mp3'),
    modal: new Audio('audio/modal.mp3'),
    loading: new Audio('audio/loading.mp3'),
    select: new Audio('audio/select.mp3'),
    hint: new Audio('audio/hint.mp3')
};
// Ensure loading sound loops while active
sounds.loading.loop = true;

// Stockfish chess engine - to be played against
const botEngine = new Worker('js/stockfish.js');

// Bot difficulty categories
const difficultyCategories = [
    { name: "Very Easy",   min: 100,  max: 500 },
    { name: "Easy",        min: 600,  max: 1000 },
    { name: "Medium",      min: 1100, max: 1500 },
    { name: "Hard",        min: 1600, max: 2000 },
    { name: "Expert",      min: 2100, max: 2500 },
    { name: "Grandmaster", min: 2600, max: 3000 }
];

/* 
Profiles mapping Elo (user-selected) to botEngine settings
    Skill level: The "glasses" through which the engine views the board. 0 = flawed judgement, 20 = precise, 
    Search depth determines how many moves ahead the engine will consider
    Randomization factor determines how often the engine will make a sub-optimal move (for lower difficulties)
*/
const botProfiles = {
    100:  { skill: 0,  depth: 1,  random: 0.80 },
    200:  { skill: 0,  depth: 1,  random: 0.70 },
    300:  { skill: 0,  depth: 1,  random: 0.65 },
    400:  { skill: 0,  depth: 1,  random: 0.60 },
    500:  { skill: 0,  depth: 1,  random: 0.55 },
    600:  { skill: 0,  depth: 2,  random: 0.50 },
    700:  { skill: 0,  depth: 2,  random: 0.45 },
    800:  { skill: 1,  depth: 2,  random: 0.40 },
    900:  { skill: 1,  depth: 3,  random: 0.35 },
    1000: { skill: 2,  depth: 3,  random: 0.30 },
    1100: { skill: 3,  depth: 4,  random: 0.25 },
    1200: { skill: 4,  depth: 4,  random: 0.20 },
    1300: { skill: 5,  depth: 5,  random: 0.15 },
    1400: { skill: 6,  depth: 5,  random: 0.10 },
    1500: { skill: 7,  depth: 6,  random: 0.05 },
    1600: { skill: 8,  depth: 6,  random: 0.00 },
    1700: { skill: 9,  depth: 7,  random: 0.00 },
    1800: { skill: 10, depth: 8,  random: 0.00 },
    1900: { skill: 11, depth: 9,  random: 0.00 },
    2000: { skill: 12, depth: 10, random: 0.00 },
    2100: { skill: 13, depth: 11, random: 0.00 },
    2200: { skill: 14, depth: 12, random: 0.00 },
    2300: { skill: 15, depth: 13, random: 0.00 },
    2400: { skill: 16, depth: 14, random: 0.00 },
    2500: { skill: 17, depth: 15, random: 0.00 },
    2600: { skill: 18, depth: 16, random: 0.00 },
    2700: { skill: 19, depth: 17, random: 0.00 },
    2800: { skill: 20, depth: 18, random: 0.00 },
    2900: { skill: 20, depth: 20, random: 0.00 },
    3000: { skill: 20, depth: 22, random: 0.00 }
};

// Set up an engine specifically for generating hints
const hintEngine = new Worker('js/stockfish.js');
const hintDifficulty = 20;
const hintSearchDepth = 10;

// =============================
// ==  Variables  ==============
// =============================

// Add logic for the chess game object
let playerColor = 'white';
let gameActive = false;
let selectedSquare = null;
let gettingHint = false;
let reviewingGame = false;

// Establish preference trackers
let legalMoveHighlightsEnabled = true;
let clickMovesEnabled = true;
let dragMovesEnabled = true;
let evalBarEnabled = true;

// Store move data history for navigation and analysis
let fenHistory = [];
let viewingIndex = 0;
let evalHistory = [0];
let currentEval = 0;
let tempBestEval = 0;
let hintHistory = [];
let analysisIndex = 0;
let analysisCounts = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
let moveJudgements = [];
let accuracyList = [];
let currentGameAccuracy = 0;

// Configure engineBot starting settings
let botEngineTimeout = null;
let botSearchDepth = 1;
let randomizationFactor = 0;   

// Starting difficulty configurations
let currentCategoryIndex = 0; 
let currentElo = 100;  

// Filter state: tracks which move types are visible in the PGN (move analysis)
let moveFilters = {
    'best': true,
    'excellent': true,
    'good': true,
    'inaccuracy': true,
    'mistake': true,
    'blunder': true
};

// =============================
// ==  Board setup  ============
// =============================

// Initialize the chessboard (div with id 'myBoard') 
const board = Chessboard('myBoard', config);

 // Update the board status on game start
updateStatus();

// =============================
// ==  Game state  =============
// =============================

// Reset the game to the starting position
function startNewGame() {
    // Disallow accidental new game start-up
    if (gameActive) return;
    
    // Reset game review state
    reviewingGame = false;
    document.getElementById('moveHistoryAnalysisContainer').style.display = 'none';
    moveJudgements = [];
    moveFilters = {
        'best': true,
        'excellent': true,
        'good': true,
        'inaccuracy': true,
        'mistake': true,
        'blunder': true
    };
    $('#analysisSummary').empty();

    // Reset visuals
    closeGameOverModal();
    removeAllHighlights();

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
    let boardElement = document.getElementById('myBoard');
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

// Update the state of the game
function updateStatus() {
    // If the game is not active, prompt the user
    if (!gameActive) {
        $('#status').html('Click “Start New Game” to begin playing.');
        return;
    }

    // Initialize variables for active game
    let status = '';
    let moveColor = 'White';

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
        currentEval = (game.turn() === 'b') ? 20000 : -20000;
        evalHistory[evalHistory.length - 1] = currentEval;

    // Draw
    } else if (game.in_draw()) {
        // Stalemate
        if (game.in_stalemate()) {
            status = 'Game over.<br>A draw by stalemate was reached.';
            openGameOverModal('Draw', 'Stalemate');
        // Repetition
        } else if (game.in_threefold_repetition()) {
            if (game.in_check()) highlightKingCheck();
            status = 'Game over.<br>A draw by threefold repetition was reached.';
            openGameOverModal('Draw', 'Threefold Repetition');
        // Insufficient material
        } else if (game.insufficient_material()) {
            status = 'Game over.<br>A draw by insufficient material was reached.';
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
    if (!gameActive) toggleGameControls(false);
}

// Save the current board position to the FEN history
function fenSnapshot() {
    // Save board state
    fenHistory.push(game.fen());
    viewingIndex = fenHistory.length - 1;
    // Save evaluation state
    evalHistory.push(currentEval);
}

// Trigger the engine to make a move
function makeEngineMove() {
    // Halt thinking if the game is over
    if (game.game_over()) return;

    // Remind the player that engine moves require time to 'think'
    $('#status').html("Engine thinking...");

    // Send the current game position to the engine
    botEngine.postMessage('position fen ' + game.fen());
    // Search for the best move to a certain depth
    botEngine.postMessage('go depth ' + botSearchDepth);
}

// Close the Game Over modal and return to the main menu
function exitToMenu() {
    // Close the modal
    closeGameOverModal();

    // Stop pending actions and reset flags
    window.clearTimeout(botEngineTimeout);
    gameActive = false;
    reviewingGame = false;

    // Reset visuals and game logic
    removeAllHighlights();
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
    document.getElementById('titleContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
    console.log('Returned to main menu.');
}

// Resign the game for a loss
function resignGame() {
    openYesNoModal();
}

// Undo the previous move
function undoMove() {
    // 1. Game must be in progress
    if (!gameActive) return;
    
    // 2. One move must have beeen completed by BOTH sides before the player may undo a move
    if (game.history().length < 2) return;

    // 3. It must be the players turn
    if (game.turn() !== playerColor.charAt(0)) return;

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
    removeCurrentMoveHighlights();
    selectedSquare = null;
    updateHistoryHighlights();
    updateEvalBar(currentEval);
    playHistoricalMoveSound();
}


// =============================
// ==  Player interaction  =====
// =============================

// Prevent illegal interactions and highlight legal moves
function onDragStart (source, piece) {
    // If the player prefers click-moving
    if (!dragMovesEnabled) return false;

    // No game in progress
    if (!gameActive) return false;

    // Prevent page scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    // Disable element inspection on long-press (mobile)
    window.oncontextmenu = function (event) {
        if (event.target.tagName === 'IMG' && event.target.className.includes('piece-')) {
            event.preventDefault();
            return false;
        }
    };
    document.getElementById('myBoard').oncontextmenu = function(event) {
        event.preventDefault();
        return false;
    } 

    // Prevent moving pieces when viewing previous positions
    if (viewingIndex < fenHistory.length - 1) return false;

    // Game over
    if (game.game_over()) return false;
    
    // Opponents turn
    if ((playerColor === 'white' && piece.search(/^b/) !== -1) ||
        (playerColor === 'black' && piece.search(/^w/) !== -1)) {
        return false;
    }

    // Clear previous click selections before handling this piece
    if (selectedSquare !== null) selectedSquare = null;

    // Highlight only the selected piece and it's legal moves
    removeCurrentMoveHighlights();
    highlightSquare(source);
    highlightMoves(source);

    return true;
}

// Allow piece drop interactions between chess pieces and squares
function onDrop (source, target) {
    // Enable page scrolling
    document.body.style.overflow = '';
    document.body.style.touchAction = '';

    // Clear text selections that were created during long-press (mobile)
    window.oncontextmenu = null;
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    } else if (document.selection) {
        document.selection.empty();
    }

    // Delay restoration of scrolling and context menus 
    setTimeout(() => {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.getElementById('myBoard').oncontextmenu = null;
    }, 150);

    // Classify the move as a 'click' if the piece is dragged and dropped to the same square
    if (source === target) {
        handleSquareClickInteractions(source);

        // If in drag-mode, only display legal move highlighting while holding the piece (onDrag, not onDrop)
        if (!clickMovesEnabled) removeCurrentMoveHighlights();
    
        // Visually return the piece to it's original square
        return 'snapback';
    }

    // Check if the move is legal 
    let move = game.move({
      from: source,
      to: target,
      // Queen promotion as default
      promotion: 'q' 
    });

    // If the move is illegal, return the piece to its original square
    if (move === null) {
        selectedSquare = null;
        removeCurrentMoveHighlights();
        return 'snapback';
    }

    // Clear click-moving state after a successful move
    selectedSquare = null;

    // Play a sound and wiggle the piece after the move has passed validation
    playMoveSound(move);
    wiggleAnimation(target, 50);


    // Highlight the players move for awareness
    removeCurrentMoveHighlights();
    highlightLastMove(source, target); 

    // Save the current position to the FEN history
    fenSnapshot();

    // Update the turn status text
    updateStatus();

    // Make the engine move after a short delay
    window.setTimeout(makeEngineMove, 250);
}

// Force the board to accurately reflect the game state
function onSnapEnd () {
    board.position(game.fen());
}

// Highlight the square of the piece that the player has clicked
function highlightSquare(square) {
    let $square = $('#myBoard .square-' + square);
    $square.addClass('highlight-source');
}

// Highlight the legal moves for the piece that the player has clicked
function highlightMoves(square) {
    if (legalMoveHighlightsEnabled) {
        // Get legal moves for the piece
        let moves = game.moves({
            square: square,
            verbose: true
        });

        // Highlight every legal square
        for (let i = 0; i < moves.length; i++) {
            $('#myBoard .square-' + moves[i].to).addClass('highlight-move');
        }
    }
}

// Remove highlighting of source square and legal move squares
function removeCurrentMoveHighlights() {
    // Highlights
    $('#myBoard .square-55d63').removeClass('highlight-source');
    $('#myBoard .square-55d63').removeClass('highlight-move');
    $('#myBoard .square-55d63').removeClass('highlight-hint');
    if (game.in_check() === false) removeInCheckHighlights();

    // Status bar text
    let currentText = $('#status').text();
    if (currentText.startsWith("Best move:")) updateStatus();
}

// Remove the highlights of the last move played
function removePreviousMoveHighlights() {
    $('#myBoard .square-55d63').removeClass('highlight-played');
}

// Update the highlights during previous move navigation
function updateHistoryHighlights() {
    // Don't show highlights on the first move
    if (viewingIndex === 0) {
        removePreviousMoveHighlights();
        return;
    }

    // Retrieve the full move history (verbose allows for to/from details)
    let history = game.history({verbose: true});

    // Highlight the last move's details
    let moveIndex = viewingIndex - 1
    if (history[moveIndex]) {
        let move = history[moveIndex];
        highlightLastMove(move.from, move.to);
    }
}

// Highlight the last move played
function highlightLastMove(source, target) {
    removePreviousMoveHighlights();
    $('#myBoard .square-' + source).addClass('highlight-played');
    $('#myBoard .square-' + target).addClass('highlight-played');
}


// Highlight the King when in check
function highlightKingCheck(color) {
    // Establish the target piece (wK or bK)
    let kingColor = color || game.turn();
    let kingNotation = kingColor + 'K';
    let kingSquare = null;

    // Get the board state
    let boardSquares = board.position();

    // Locate the target piece
    for (let square in boardSquares) {
        if (boardSquares[square] === kingNotation) {
            kingSquare = square;
            // King located - stop searching
            break;
        }
    }

    // Apply the class
    removeCurrentMoveHighlights();
    $('#myBoard .square-' + kingSquare).addClass('in-check');

    // Apply a wiggle animation
    wiggleAnimation(kingSquare, 250);
}

// Remove in-check highlights
function removeInCheckHighlights() {
    $('#myBoard .square-55d63').removeClass('in-check');
}

// Highlight the best move when a hint is requested
function highlightHint(source, target) {
    // Clear previous hints
    $('#myBoard .square-55d63').removeClass('highlight-hint');

    // Highlight the start and end squares of the hinted move
    $('#myBoard .square-' + source).addClass('highlight-hint');
    $('#myBoard .square-' + target).addClass('highlight-hint');
}

// Remove all highlights
function removeAllHighlights() {
    removePreviousMoveHighlights();
    removeCurrentMoveHighlights();
    removeInCheckHighlights();
}

// Enable and disable legal move highlighting ability
function toggleLegalMoveHighlights() {
    legalMoveHighlightsEnabled = !legalMoveHighlightsEnabled;
    playSound('select');
}

// Handle the logic of square clicks under different scenarios
function handleSquareClickInteractions(square) {
    // If the user prefers drag-moving
    if (!clickMovesEnabled) return;
    
    // Prevent pre-game interactions
    if (!gameActive) return;
    
    // Scenario 1 - player clicked a square to select a piece
    // Current selection is null - no piece previously selected
    if (selectedSquare === null) {
        let piece = game.get(square);
        
        // Must be a piece, and must be the players color
        if (!piece || piece.color !== game.turn()) return;

        // Reset highlights and status bar text
        removeCurrentMoveHighlights();

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
        removeCurrentMoveHighlights();
        return;
    }

    // 2B. New piece of the same color selected - change selection
    let piece = game.get(square);
    // If(piece) returns true if selection is not null - piece.color crashes on null
    if (piece && piece.color === game.turn()) {
        selectedSquare = square;
        removeCurrentMoveHighlights();
        highlightSquare(square);
        highlightMoves(square);
        return;
    }

    // 2C. Attempt to move the selected piece to the target square
    let move = game.move({
        from: selectedSquare,
        to: square,
        promotion: 'q'
    });

    // 2D. Resolve the move
    if (move === null) {
        // Illegal move
        selectedSquare = null;
        removeCurrentMoveHighlights();
    } else {
        // Legal move
        board.position(game.fen());
        fenSnapshot();
        updateStatus();
        selectedSquare = null;
        playMoveSound(move);
        wiggleAnimation(square, 250);
        if (game.in_check() === false) removeCurrentMoveHighlights();
        window.setTimeout(makeEngineMove, 250);
    }
}

// Perform an action based on the type of square clicked
function onSquareClick(event) {
    // 'this' is the specific .square-55d63 element that was clicked
    let square = $(this).attr('data-square');
    handleSquareClickInteractions(square);
}

// Navigate to a move by move-history click
function moveHistoryNavigation() {
    // Get the index of the clicked move
    let index = $(this).attr('data-index');

    // Navigate to the viewing index of the move
    viewingIndex = parseInt(index);
    navigationUpdate();
}

// =============================
// ==  Engine logic  ===========
// =============================

// ==  Bot engine  =============

// Awaken the engine
botEngine.postMessage('uci'); 

// OPTIMIZATION: Increase Hash (Memory) and Threads to speed up high-depth calculations
// Hash 64: Gives the engine 64MB of memory to store positions (prevents re-calculating)
// Threads 2: Uses 2 CPU cores instead of 1 (if supported by browser/device)
botEngine.postMessage('setoption name Hash value 64');
botEngine.postMessage('setoption name Threads value 2');

// Set up responses from the engine
botEngine.onmessage = function(event) {
    let line = event.data;

    /*
    // == Evaluation bar ===========
    Check for 'score' for use in updating the game evaluation
        1.  Determine the score based on the event data
        2.  Adjust the score to be relative to Whites position
        3.  Update the evaluation bar and evaluation score history
    */
    if (line.startsWith('info') && line.includes('score')) {
        let score = 0;

        // Depth tracker (only update evaluation score on final iteration)
        let currentDepth = 0;
        if (line.includes('depth')) {
            let depthString = line.split('depth')[1];
            currentDepth = parseInt(depthString.split(' ')[0]);
        }

        // 1-A: Mate score
        if (line.includes('mate')) {
            // Raw line example: info depth 10 seldepth 15 score mate 3 nodes 45000 nps 120000
            // Focus mate score (example output = ['3', 'nodes', ... ] )
            let mateString = line.split('mate ')[1];
            // Isolate mate score (example output = '3')
            let mateIn = parseInt(mateString.split(' ')[0]);

            // Encode mate as large centipawn value. Closer mates have higher values
            if (mateIn > 0) {
                score = 20000 - mateIn;
            } else {
                score = -20000 - mateIn;
            }
        }

        // 1-B: Centipawn score
        else if (line.includes('cp')) {
            let centipawnString = line.split('score cp ')[1];
            score = parseInt(centipawnString.split(' ')[0])
        }

        // 2: Adjust the score
        if (game.turn() === 'b') score = -score;
        

        // 3: Update the eval bar and score history
        currentEval = score;
        if (evalHistory.length > 0) {
            // Overwrite the last entry (message runs multiple times before the engine makes the best move)
            evalHistory[evalHistory.length - 1] = currentEval;
        }

        // Only update on the final search depth iteration
        if (currentDepth >= botSearchDepth) updateEvalBar(currentEval);
    }
    
    // == Best move ===========
    // Engine produces many messages - we only care about 'bestmove' messages for decision making
    if (event.data.startsWith('bestmove')) {
        // Force an update in case a 'mate' or 'draw' message is reached before reaching final depth
        updateEvalBar(currentEval);

        // Extract only the notation portion of the best move (ex: 'bestmove e1e3')
        let bestMove = event.data.split(' ')[1];

        // Convert the bestmove into a format the chess.js library understands
        // 1st index is starting point, 2nd index is "ending" point (0,2 means 0-1). 
        let source = bestMove.substring(0, 2);
        let target = bestMove.substring(2, 4);
        // 4th index is blank unless there is a promotion (ex: 'e7e8q' means pawn promotes to queen)
        let promotion = bestMove.substring(4, 5);

        // To store the move for execution after it's been determined (best or weakened)
        let engineMove = null;

        /* 
        == Move weakener ==
            Even with difficulty 0 and searchDepth 1, the engine consistently plays strong moves
            If playing on 'easy mode', we need to manually intervene by randomly selecting a move instead of using the best move
        */
        if (currentElo < 1600) {
            // X% chance of selecting a random move instead of the best move
            if (Math.random() < randomizationFactor) {
                // Retrieve all possible moves and select one at random
                let legalMoves = game.moves({ verbose: true });

                 // Loop until a LEGAL move has been randomly selected
                while (engineMove === null && legalMoves.length > 0) {
                    let randomIndex = Math.floor(Math.random() * legalMoves.length);
                    let randomMove = legalMoves[randomIndex];

                    // Attempt to make the move 
                    engineMove = game.move({
                        from: randomMove.from,
                        to: randomMove.to,
                        promotion: randomMove.promotion || ''
                    });

                    // If the move was legal, save source and target for highlighting purposes
                    if (engineMove !== null) {
                        source = randomMove.from;
                        target = randomMove.to;
                        promotion = randomMove.promotion || '';
                    // The move was illegal, remove it from the list and try again
                    } else {
                        legalMoves.splice(randomIndex, 1);
                    }
                }
            }
        }

        // == Move initiation ==
        // Use the shared game logic for the engine's move
        if (engineMove === null) {
            engineMove = game.move({
                from: source,
                to: target,
                // Queen promotion as empty string protection
                promotion: promotion || 'q'
            });
        }

        // Play a sound after the engine has played its move
        playMoveSound(engineMove);

        // Highlight the engine's move for player awareness
        removeCurrentMoveHighlights();
        highlightLastMove(source, target)

        // Save the current position to the FEN history
        fenSnapshot();

        // Update the chessboard with the engine's move
        board.position(game.fen());
        updateStatus();
    }
};

// ==  Hint engine  ============

// Same setup process as botEngine
hintEngine.postMessage('uci'); 
hintEngine.postMessage('setoption name Hash value 32');
hintEngine.postMessage('setoption name Threads value 2');
hintEngine.postMessage('setoption name Skill Level value ' + hintDifficulty); 

// Set up responses from the engine
hintEngine.onmessage = function(event) {
    let line = event.data;

    // == Capture the score ==
    if (line.startsWith('info') && line.includes('score')) {
        let score = 0;

        // Mate score
        if (line.includes('mate')) {
            // Engine produces mate in format 'score mate 5' (engine winning), 'score mate -3' (engine losing)
            let mateString = line.split('mate ')[1];
            let mateIn = parseInt(mateString.split(' ')[0]);

            // Convert mate to a large centipawn value for consistency
            if (mateIn > 0) {
                score = 20000 - mateIn;
            } else {    
                score = -20000 - mateIn;
            }   

        // Centipawn score
        } else if (line.includes('cp')) {
            let centipawnString = line.split('score cp ')[1];
            score = parseInt(centipawnString.split(' ')[0]);
        }

        // Store the score until 'bestmove' is received
        tempBestEval = score;
    }

    // == Best move ===========
    // Engine produces many messages - we only care about 'bestmove' messages for decision making
    if (event.data.startsWith('bestmove')) {
        // Extract only the notation portion of the best move (ex: 'bestmove e1e3')
        let bestMoveMessage = event.data.split(' ')[1];

        // Handle game over (no best move) 
        if (bestMoveMessage === '(none)') {
            if (reviewingGame) {
                // No hint applicable when there is no best move
                hintHistory[analysisIndex] = null;

                // Manually determine judgement for the game-ending move
                let history = game.history({ verbose: true });
                let prevMoveIndex = analysisIndex - 1;
                let prevMove = history[prevMoveIndex];
                let prevEval = evalHistory[prevMoveIndex];
                let currEval = evalHistory[analysisIndex];
                
                let judgement = determineMoveJudgement(prevMove, null, prevEval, currEval, prevMove.color);
                let judgementType = judgement.text;

                // Only count the judgement type (move summary) if the player made the move
                if (prevMove.color === playerColor.charAt(0)) analysisCounts[judgementType]++;
                moveJudgements.push({ index: analysisIndex, type: judgementType });

                // Apply the judgement class
                let dotClass = judgement.class.replace('judgement', 'dot');
                let $moveSpan = $('.move-link[data-index="' + analysisIndex + '"]');
                $moveSpan.append('<span class="move-dot ' + dotClass + '"></span>');

                // Move on to the next index (triggering the summary since the game is over)
                analysisIndex++;
                triggerMoveAnalysis();
            }
            return;
        }

        // Convert the bestmove into a format the chess.js library understands
        // 1st index is starting point, 2nd index is "ending" point (0,2 means 0-1). 
        let source = bestMoveMessage.substring(0, 2);
        let target = bestMoveMessage.substring(2, 4);

        // A: Reviewing game
        if (reviewingGame) {
            // == Evaluation score == 
            // Store the best move into the history array
            let bestMoveObject = { from: source, to: target };
            hintHistory[analysisIndex] = bestMoveObject;

            // Get the best move's evaluation score
            let bestEvalWhitePerspective = tempBestEval;
            let currentFen = fenHistory[analysisIndex];
            let turnColor = currentFen.split(' ')[1];
            if (turnColor === 'b') bestEvalWhitePerspective = -tempBestEval;

            /*
            Re-evaluate the CURRENT move
                Overwrite the lower engine depth score evaluation with the higher depth outlook
                botEngine calculates eval score with a variable search depth (lower elo < 2000), hintEngine uses a fixed high depth
            */
            evalHistory[analysisIndex] = bestEvalWhitePerspective;

            // Update the eval score with the recalculated figure
            if (analysisIndex === viewingIndex) updateEvalBar(bestEvalWhitePerspective);

            // Re-evaluate the PREVIOUS move
            if (analysisIndex > 0) {
                // Get the move played
                let history = game.history({ verbose: true });
                let prevMoveIndex = analysisIndex - 1;
                let movePlayed = history[prevMoveIndex];

                // Get evaluations
                let prevEval = evalHistory[prevMoveIndex];
                let currEval = evalHistory[analysisIndex];

                // Get the previous best move
                let prevBestMove = hintHistory[prevMoveIndex];

                // Convert evaluation score to Win Percentage
                let bestWinChance = calculateEvaluation(prevEval);
                let playedWinChance = calculateEvaluation(currEval);

                // Adjust perspective for black (if 75% for white, then 25% for black)
                if (movePlayed.color === 'b') {
                    bestWinChance = 100 - bestWinChance;
                    playedWinChance = 100 - playedWinChance;
                }

                // Calculate the accuracy of winning chance captured relative to the best move
                // (E.g. best move = 50% win chance, played move = 40% win chance -> 100 - (50 - 40) = 90% accuracy)
                let accuracy = 100 - (bestWinChance - playedWinChance);
                // The engine can sometimes rate moves above best move
                if (accuracy > 100) accuracy = 100;

                // Store the accuracy value
                accuracyList.push(accuracy);

                // == Move quality judgement dot ==
                // Determine the move quality judgement
                let judgement = determineMoveJudgement(movePlayed, prevBestMove, prevEval, currEval, movePlayed.color);

                // Increment the respective judgement count
                let type = judgement.text
                if (movePlayed.color === playerColor.charAt(0)) analysisCounts[type]++;

                // Store the judgement for later use in filtering (HTML data-index is 1-based)
                moveJudgements.push({ index: analysisIndex, type: type });

                // Apply the judgement to the dot class (ex 'judgement-best' -> 'dot-best')
                let dotClass = judgement.class.replace('judgement', 'dot');

                // Apply the judgement dot 
                let $moveSpan = $('.move-link[data-index="' + analysisIndex + '"]');
                $moveSpan.append('<span class="move-dot ' + dotClass + '"></span>');
            }

            // == If updating the hint for the viewing index that is currently in view by the user ==
            if (analysisIndex === viewingIndex - 1) navigationUpdate();
            
            // == Process the next move ==
            analysisIndex ++;
            triggerMoveAnalysis();
        }

        // B: Mid-game
        else {
            // No hint requested - the player started a new game before the move-analysis was complete
            if (!gettingHint) return;

            // Reset the flag
            gettingHint = false;

            // == Highlight the best move squares ==
            // Pulls data from the engine message, whereas status bar uses a new object for algebraic notation (ex: Bxc6)
            highlightHint(source, target);

            // == Update the status bar with the best move notation ==
            // Obtain all possible moves
            let moves = game.moves({ verbose: true });

            // Search through the  moves and find the one that matches the best move provided by the engine
            let matchedMove = moves.find(function(move) {

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

// Trigger a hint request
function getHint() {
    // State checks
    if (!gameActive) return;
    if (game.turn() !== playerColor.charAt(0)) return;
    if (viewingIndex !== fenHistory.length - 1) return;

    // Prevent residual highlights in 'else' fallback of hintEngine.onmessage when starting a new game mid move-analysis
    gettingHint = true;

    // Request the best move from the hint engine
    hintEngine.postMessage('position fen ' + game.fen());
    hintEngine.postMessage('go depth ' + hintSearchDepth);

    playSound('hint');
}

// =============================
// ==  Game analysis  ==========
// =============================

// Review the previous game
function reviewGame() {
    reviewingGame = true;

    // Play loading sound
    playSound('loading');

    // == Reset board visuals == 
    closeGameOverModal();
    navigateFirst();
    removeCurrentMoveHighlights();

    // == Reset game review visuals ==
    // Move type counts
    $('.move-dot').remove();
    analysisCounts = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    // Move judgements and accuracy
    moveJudgements = [];
    accuracyList = [];
    currentGameAccuracy = 0;
    // Analysis loading bar
    document.getElementById('analysisLoader').style.display = 'flex';
    document.getElementById('analysisResult').style.display = 'none';
    document.getElementById('analysisPercent').innerText = '0';
    document.getElementById('analysisProgressBar').style.width = '0%';

    // == Hide controls ==
    openOptionsBtn.style.display = 'none';
    undoBtn.style.display = 'none';
    hintBtn.style.display = 'none';
    resignBtn.style.display = 'none';

    // == Display move history ==
    document.getElementById('moveHistoryAnalysisContainer').style.display = 'flex';

    // == Dim opponent moves ==
    $('.move-link').each(function() {
        let index = parseInt($(this).attr('data-index'));

        // Determine whose move it is (data-index is 1-based)
        let isWhiteMove = (index % 2 !== 0);
        let isPlayerMove = (isWhiteMove && playerColor === 'white') || (!isWhiteMove && playerColor === 'black');

        // Dim moves
        if (!isPlayerMove) $(this).addClass('move-dimmed');
        
    });


    // == Trigger batch move analysis ==
    analyzeGame();
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
    tempBestEval = 0;

    // == Loading bar ==
    // Track percentage of completion
    let moveCount = game.history().length;
    if (moveCount > 0) {
        let completionPercentage = Math.round((analysisIndex / moveCount) * 100);

        // Update the visual bar
        let percentageText = document.getElementById('analysisPercent');
        let percentageFill = document.getElementById('analysisProgressBar');
        percentageText.innerText = completionPercentage;
        percentageFill.style.width = completionPercentage + '%';
    }

    // == Summary ==
    // Stop once every move has been analyzed, then generate a summary
    if (analysisIndex >= game.history().length + 1) {
        let totalAccuracy = 0;
        let myMoveCount = 0;

        // Count only the player's moves for accuracy
        for (let i = 0; i < accuracyList.length; i++) {
            let isWhiteMove = (i % 2 === 0);
            let isPlayerMove = (isWhiteMove && playerColor === 'white') || (!isWhiteMove && playerColor === 'black');
            if (isPlayerMove) {
                totalAccuracy += accuracyList[i];
                myMoveCount++;
            }
        }

        // Calculate average accuracy
        let averageAccuracy = 0;
        if (myMoveCount > 0) {
            averageAccuracy = Math.round(totalAccuracy / myMoveCount);
        }

        // Hide loading bar, show results
        document.getElementById('analysisLoader').style.display = 'none';
        document.getElementById('analysisResult').style.display = 'flex';
        renderAnalysisSummary();
        let accuracyText = document.getElementById('accuracyText');
        accuracyText.innerHTML = '<span class="analysis-footer">Average accuracy: ' + averageAccuracy + '%</span>';

        // End the loading sound
        sounds.loading.pause();
        sounds.loading.currentTime = 0;

        return;
    
    // ONLY process engine messages if the game is not over
    } else {
        // Retrieve the board state for the targeted turn
        let fen = fenHistory[analysisIndex];

        // Obtain the best move for the targeted turn
        hintEngine.postMessage('position fen ' + fen);
        hintEngine.postMessage('go depth ' + hintSearchDepth);
    }
}

// Rander the clickable badges for the analysis summary
function renderAnalysisSummary() {
    let html = '';

    // Iterate through each move judgement type
    for (let type in analysisCounts) {
        let count = analysisCounts[type];
        let isEnabled = moveFilters[type];
        let disabledClass = isEnabled ? '' : 'filter-disabled';

        // Construct the class for the badge (styling)
        let badgeClass = 'judgement-label summary-badge judgement-' + type + ' ' + disabledClass;

        // Generate the badge HTML
        html += '<span class="' + badgeClass + '" ' +
                    'onclick="toggleMoveFilter(\'' + type + '\')">' + 
                    count + ' ' + type + 
                '</span>';
        
    }

    // Update the html element
    document.getElementById('analysisSummary').innerHTML = html;

    // Match the move history display to the current filter settings
    applyMoveVisibility();
}

// Toggle the filter state for a specific move judgement type
function toggleMoveFilter(type) {
    // Invert the filter state
    moveFilters[type] = !moveFilters[type];
    // Refresh the UI
    renderAnalysisSummary();
    // Play sound effect
    playSound('select');
}

// Show or hide moves in the PGN based on the current filter settings
function applyMoveVisibility() {
    // Iterate through each move judgement - structure is { index: number, type: string }
    moveJudgements.forEach(function(judgement) {
        // Determine whose move it is (judgement list indexing is 1-based)
        let isWhiteMove = (judgement.index % 2 !== 0);
        let isPlayerMove = (isWhiteMove && playerColor === 'white') || (!isWhiteMove && playerColor === 'black');

        // Only filter the player's moves
        if (isPlayerMove) {
            // Locate the move within the table, based on the judgement list index (matches data-index)
            let $moveElement = $('.move-link[data-index="' + judgement.index + '"]');
            // Check if the move type is enabled in the filters
            if (moveFilters[judgement.type]) {
                $moveElement.removeClass('move-dimmed');
            } else {
                $moveElement.addClass('move-dimmed');
            }
        }
    });
}

// Determine the quality of the move played based on evaluation score
function determineMoveJudgement(movePlayed, bestMove, previousEvaluation, currentEvaluation, turnColor) {
    // Guard clause for final move of the game (null value)
    if (bestMove === null) {
        let judgement = '';
        if (Math.abs(currentEvaluation) > 15000) {
            judgement = { text: 'best', class: 'judgement-best' };
        } else {
            judgement = { text: 'good', class: 'judgement-good' };
        }
        return judgement;
    }

    let judgement = {};

    // == The best move was played ==
    if (movePlayed.from === bestMove.from && movePlayed.to === bestMove.to) {
        judgement = { text: 'best', class: 'judgement-best' };
        return judgement;
    }

    // == Blunder check == 
    // Define thresholds for Mate and "lost" position (7.5 pawns)
    let mateThreshold = 5000;
    let lostThreshold = 750;

    // Check for current and previous mate
    let isMateAgainstWhite = (currentEvaluation <= -mateThreshold);
    let isMateAgainstBlack = (currentEvaluation >= mateThreshold);
    let wasMateAgainstWhite = (previousEvaluation <= -mateThreshold);
    let wasMateAgainstBlack = (previousEvaluation >= mateThreshold);

    // Check if previously in lost position
    let whiteWasLost = (previousEvaluation < -lostThreshold);
    let blackWasLost = (previousEvaluation > lostThreshold);

    // Determine whether the position was blundered
    let positionBlundered = false;
    if (turnColor === 'w') {
        // 1. Wasn't previously in mate,    2. Wasn't previously in "lost" position
        if (isMateAgainstWhite && !wasMateAgainstWhite && !whiteWasLost) {
            positionBlundered = true;
        }
    } else {
        // 1. Wasn't previously in mate,    2. Wasn't previously in "lost" position
        if (isMateAgainstBlack && !wasMateAgainstBlack && !blackWasLost) {
            positionBlundered = true;
        }
    }

    // The position was blundered, no need to further analyze move quality
    if (positionBlundered) {
        judgement = { text: 'blunder', class: 'judgement-blunder' };
        return judgement;
    }

    // == Standard move judgement ==
    // Compare winning chance before and after the move (min 0, max 100)
    let previousWinningChance = calculateEvaluation(previousEvaluation);
    let currentWinningChance = calculateEvaluation(currentEvaluation);

    /*
    Calculate the loss of advantage as the difference between evaluation score
    The engine always calculates evaluation score from White's perspective
        Increase of score - favorable for White
        Decrease of score - favorable for Black
    */
    let lostAdvantage = 0;
    if (turnColor === 'w') {
        // White loses chances if the score gets smaller
        lostAdvantage = previousWinningChance - currentWinningChance;
    } else {
        // Black loses chances if the score gets bigger
        lostAdvantage = currentWinningChance - previousWinningChance;
    }

    // Categorize the loss of advantage to determine move judgement
    if (lostAdvantage <= 2) {
        judgement = { text: 'excellent', class: 'judgement-excellent' };
    } else if (lostAdvantage <= 5) {
        judgement = { text: 'good', class: 'judgement-good' };
    } else if (lostAdvantage <= 10) {
        judgement = { text: 'inaccuracy', class: 'judgement-inaccuracy' };
    } else if (lostAdvantage <= 20) {
        judgement = { text: 'mistake', class: 'judgement-mistake' };
    } else {
        judgement = { text: 'blunder', class: 'judgement-blunder' };
    }
    
    return judgement;
}

// =============================
// ==  User interface  ============
// =============================

// ==========  DOM elements  ==========

const catPreviousBtn = document.getElementById('catPrevious');
const categoryDisplay = document.getElementById('categoryDisplay');
const catNextBtn = document.getElementById('catNext');
const eloSlider = document.getElementById('eloSlider');
const eloDisplay = document.getElementById('eloDisplay');
const startNewGameBtn = document.getElementById('startBtn');
const colorRadios = document.querySelectorAll('input[name="color"]');
const gameOverModal = document.getElementById("gameOverModal");
const gameOverModalText = document.getElementById("gameResult");
const gameOverModalReason = document.getElementById("gameReason");
const exitToMenuBtn = document.getElementById("gameOverModalCloseBtn");
const rematchBtn = document.getElementById("rematchBtn");
const reviewGameBtn = document.getElementById("gameReviewBtn");
const optionsModal = document.getElementById('optionsModal');
const openOptionsBtn = document.getElementById('optionsBtn');
const closeOptionsBtn = document.getElementById('optionsModalCloseBtn');
const toggleHighlightsCheckbox = document.getElementById('optionsModalHighlightsCheckbox');
const clickMovingPreferenceRadioBtn = document.querySelector('input[name="optionsModalMovingPreference"][value="click"]');
const dragMovingPreferenceRadioBtn = document.querySelector('input[name="optionsModalMovingPreference"][value="drag"]');
const bothMovingPreferenceRadioBtn = document.querySelector('input[name="optionsModalMovingPreference"][value="both"]');
const yesNoModal = document.getElementById('yesNoModal');
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const yesNoCloseBtn = document.getElementById('yesNoCloseBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const firstBtn = document.getElementById('firstBtn');
const lastBtn = document.getElementById('lastBtn');
const evalContainer = document.getElementById('evalContainer');
const toggleEvalBarCheckbox = document.getElementById('optionsModalEvalBarCheckbox');
const blackBtn = document.querySelector('input[name="color"][value="black"]'); 
const whiteBtn = document.querySelector('input[name="color"][value="white"]');
const undoBtn = document.getElementById('undoBtn');
const hintBtn = document.getElementById('hintBtn');
const resignBtn = document.getElementById('resignBtn');

// ==========  Starting settings  ==========

// Not usable until game start
openOptionsBtn.disabled = true;
undoBtn.disabled = true;
hintBtn.disabled = true;
resignBtn.disabled = true;

// ==========  Difficulty selection  ==========

// Update the difficulty category
function updateDifficultyCategory() {
    // Get the current category
    let category = difficultyCategories[currentCategoryIndex];

    // Update the category text display
    categoryDisplay.innerText = category.name;

    // Update the Elo slider range and default position
    eloSlider.min = category.min;
    eloSlider.max = category.max;
    eloSlider.value = category.min;

    // Update the Elo value and engine settings
    updateEloValue(category.min);
    updateEngineSettings(category.min);

    // Enable/disable the previous/next buttons as appropriate
    if (currentCategoryIndex === 0) {
        catPreviousBtn.disabled = true;
    } else {
        catPreviousBtn.disabled = false;
    }
    if (currentCategoryIndex === difficultyCategories.length - 1) {
        catNextBtn.disabled = true;
    } else {
        catNextBtn.disabled = false;
    }
}

// Update the Elo value
function updateEloValue(eloValue) {
    eloDisplay.innerText = 'Elo: ' + eloValue;
    currentElo = eloValue;
}

// Update the engine profile settings based on the current Elo value
function updateEngineSettings(elo) {
    // Select the bot profile that matches the current Elo
    let profile = botProfiles[elo];

    // Set the skill level, search depth, and randomization factor
    botEngine.postMessage("setoption name Skill Level value " + profile.skill);
    botSearchDepth = profile.depth;
    randomizationFactor = profile.random;
}

// Previous category button
function previousCategory() {
    if (currentCategoryIndex > 0) {
        currentCategoryIndex--;
        updateDifficultyCategory();
        playSound('select');
    }
}

// Next category button
function nextCategory() {
    if (currentCategoryIndex < difficultyCategories.length - 1) {
        currentCategoryIndex++;
        updateDifficultyCategory();
        playSound('select');
    }
}

// Elo slider change
function eloSliderChange() {
    let newElo = parseInt(eloSlider.value);
    updateEloValue(newElo);
    updateEngineSettings(newElo);
    playSound('select');
}

// ==========  UI initialization  ==========

updateDifficultyCategory();
updateEngineSettings(currentElo);

// ==========  Updates  ==========

// Update the evaluation score bar
function updateEvalBar(centipawns) {
    let evalBar = document.getElementById('evalBar');
    let evalScore = document.getElementById('evalScore');
    let mateIncoming = Math.abs(centipawns) > 15000
    let barHeight = calculateEvaluation(centipawns);

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
    let evalScoreText = '';
    if (mateIncoming) {
        let movesToMate = 20000 - Math.abs(centipawns);
        if (movesToMate === 0) {
            evalScoreText = 'M';
        } else {
            evalScoreText = 'M' + movesToMate;
        }
    } else {
        let pawnAdvantage = Math.abs(centipawns) / 100;
        // Formatted to one decimal place
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

// Update the move history display with every move  
function updateMoveHistory() {
    // Get the history as an array: ['d4', 'd5', 'c4', 'b5']
    let history = game.history();
    
    // Create an HTML body for storing move history
    let html = '';

    // Iterate through moves in pairs (1. white, 2. black)
    for (let i = 0; i < history.length; i += 2) {
        let moveNumber = (i / 2) + 1;

        // White move is the first in the pair
        let whiteIndex = i + 1;
        let whiteMove = '<span class="move-link" data-index="' + whiteIndex + '">' + history[i] + '</span>';

        // Black move is the second in the pair
        var blackMove;
        if (history[i + 1]) {
            let blackIndex = i + 2;
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
    let moveHistoryBodyElement = document.getElementById('moveHistoryBody');
    moveHistoryBodyElement.innerHTML = html;
    
    // Auto-scroll the move history to the latest move
    let pgnElement = document.getElementById('pgn');
    pgnElement.scrollTop = pgnElement.scrollHeight;
}



// ==========  Control toggling  ==========

// Toggle on/off game controls based on game state (true = cannot be changed mid-game)
function toggleGameControls(gameInProgress) {
    // Difficulty select dropdown
    document.getElementById('catPrevious').disabled = gameInProgress;
    document.getElementById('catNext').disabled = gameInProgress;
    document.getElementById('eloSlider').disabled = gameInProgress;
    // Color radio buttons
    let colorRadios = document.querySelectorAll('input[name="color"]');
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

// Show/hide the evaluation bar 
function toggleEvalBar() {
    evalBarEnabled = !evalBarEnabled;
    if (evalBarEnabled) {
        evalContainer.style.display = "";
    } else {
        evalContainer.style.display = "none";
    }
    playSound('select');
}

// ==========  Game over modal  ==========

// Show the game over modal with the result and reason 
function openGameOverModal(result, reason) {
    // Play modal-opening sound
    playSound('modal');

    // win/loss/draw
    gameOverModalText.innerText = result;
    // checkmate/stalemate/repetition
    gameOverModalReason.innerText = reason;

    // Make the modal visible
    gameOverModal.style.display = "flex";
}

// Close the Game Over modal
function closeGameOverModal() {
    playSound('select');
    gameOverModal.style.display = "none";
}


// Determine whether the game over modal is open
function gameOverModalStatus() {
    let status = false;
    if (gameOverModal.style.display === 'flex') {
        status = true;
    }
    return status;
}

// ==========  In-game options modal  ==========

// Open the options modal
function openOptionsModal() {
    // Prevent opening options before a game starts
    if (!gameActive) return;
    
    playSound('modal');
    optionsModal.style.display = 'flex';
}

// Close the options modal
function closeOptionsModal() {
    optionsModal.style.display = 'none';
    playSound('select');
}


// Close the options module when clicking outside of it
function optionsModuleOutsideClick(event) {
    if (event.target === optionsModal) closeOptionsModal();
}


// Determine whether the options modal is open
function optionsModalStatus() {
    let status = false;
    if (optionsModal.style.display === 'flex') {
        status = true;
    }
    return status;
}



// Set clicking and dragging abilities according to user preferences
function setMovingPreference(enableClicking, enableDragging) {
    clickMovesEnabled = enableClicking;
    dragMovesEnabled = enableDragging;

    // Handle conflicts if the user changes settings while a piece is selected
    if (!clickMovesEnabled) {
        selectedSquare = null;
        removeCurrentMoveHighlights();
    }

    // Play selection sound
    playSound('select');
}


// ==========  Confirm resignation (yes/no) modal  ==========

// Open yesNoModal
function openYesNoModal() {
    playSound('modal');
    yesNoModal.style.display = 'flex';
}

// Close yesNoModal
function closeYesNoModal() {
    playSound('select');
    yesNoModal.style.display = 'none';
}

// Determine whether the YesNo modal is open
function yesNoModalStatus() {
    let status = false;
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
    let moveColor = 'White';
    if (game.turn() === 'b') moveColor = 'Black';
    $('#status').html('Game over. ' + moveColor + ' has resigned.');
    openGameOverModal('Loss', 'Resignation');
}

// Cancel resignation and return the user to the options meodal
function cancelResignation() {
    closeYesNoModal();
}

// ==========  Back / forward navigation  ==========

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

// Navigate forward to the next position
function navigateForward() {
    if (viewingIndex < fenHistory.length - 1) {
        viewingIndex++;
        navigationUpdate();
    }   
}

// Navigate back to the first move
function navigateFirst() {
    viewingIndex = 0;
    navigationUpdate();        
}

// Navigate back to the last move
function navigateLast() {
    viewingIndex = fenHistory.length - 1;
    navigationUpdate();
}

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
    // == Board ==
    // Update the board view
    board.position(fenHistory[viewingIndex]);
    document.getElementById('gameContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // == Move history markup == 
    if (reviewingGame) {
        // Clear "current move" notation highlights
        $('.move-link').removeClass('current-move');

        // Highlight "current move" notation
        if (viewingIndex > 0) {
            // Find the specific html element for the current move
            let $currentmove = $('.move-link[data-index="' + viewingIndex + '"]');
            if ($currentmove.length > 0) {
                // == Style the element == 
                $currentmove.addClass('current-move');
                // == Auto-scroll to the element == 
                // Identify the container (The div with id="pgn")
                let $container = $('#pgn');

                // Ensure both elements exist before attempting math
                if ($container.length && $currentmove.length) {
                    
                    // Calculate the exact position to center the active move
                    // Formula: Element's offset - Container's offset + Current Scroll - Half Container Height
                    let targetScrollTop = $currentmove.offset().top - $container.offset().top + $container.scrollTop() - ($container.height() / 2) + ($currentmove.height() / 2);

                    // Animate the container's internal scroll only
                    // .stop() prevents animation queue buildup if the user clicks quickly
                    $container.stop().animate({
                        scrollTop: targetScrollTop
                    }, 200); 
                }
            }
        }
    }

    // == Highlights (1) ==
    // Update previous move highlights
    updateHistoryHighlights();

    // Update in-check highlights
    removeInCheckHighlights();
    let move = (viewingIndex !== 0) ? getPreviousMove() : null;
    if (move !== null) {
        // Check for check (+) or checkmate (#)
        if (move.san.includes('+') || move.san.includes('#')) {
            // The previous move (opposite color) put THIS color in check
            let colorInCheck = (move.color === 'w') ? 'b' : 'w';
            highlightKingCheck(colorInCheck);
        }

        // == Animation ==
        // Apply the wiggle animation
        wiggleAnimation(move.to, 250);
    }

    // == Audio ==
    // Play audio based on the type of move being viewed    
    playHistoricalMoveSound();
    
    // == Evaluation bar == 
    // Update the evaluation score bar
    updateEvalBar(evalHistory[viewingIndex]);

    // == Status text ==
    // Update the move status text
    if (reviewingGame) {
        $('#status').html("Move quality:");
    } else if (viewingIndex !== fenHistory.length - 1) {
        $('#status').html("Viewing a previous move...");
    } else {
        updateStatus();
    }

    // == Highlights (2)
    // Clear existing best move highlights
    $('#myBoard .square-55d63').removeClass('highlight-hint');

    // Highlight best moves automatically if in game review mode
    if (reviewingGame && viewingIndex > 0) {
        // Clear existing move judgement
        $('#status .judgement-label').remove();

        // Get the index of the previous move
        let moveIndex = viewingIndex - 1;

        // Display the best move & judgement only if the analysis has finished loading
        if (hintHistory[moveIndex]) {
            // Best move
            let hint = hintHistory[moveIndex];
            highlightHint(hint.from, hint.to);

            // Judgement
            let prevEval = evalHistory[moveIndex];
            let currEval = evalHistory[moveIndex + 1];
            let previousMove = getPreviousMove();
            let judgement = determineMoveJudgement(previousMove, hint, prevEval, currEval, previousMove.color);
            $('#status').append('<span class="judgement-label ' + judgement.class + '">' + judgement.text + '</span>');
        }
    }

    // == Navigation == 
    // Disable/enable navigation buttons as necessary
    toggleNavigation();
}

// =============================
// ==  Helpers  ================
// =============================

/* 
Calculate the game evaluation (who is winning)
    Stockfish tracks score by centipawns
    100 centipawn = 1 pawn
    Evaluation is always relative to Whites position 
*/
function calculateEvaluation(centipawnAdvantage) {
    // 0.004 is the commonly used sensitivity factor for game evaluation in chess programs
    let sensitivityFactor = 0.004;
    // Calculate the chance of winning based on the centipawn advantage
    let winChance = 1 / (1 + Math.pow(10, -sensitivityFactor * centipawnAdvantage))
    // Return the chance of White winning as a percentage
    return winChance * 100;
}   

// Retrieve the details of the previously played move
function getPreviousMove() {
    let history = game.history({verbose: true});
    let moveIndex = viewingIndex - 1;
    let move = history[moveIndex];
    return move;
}

// Wiggle animation on piece hover/drop
function wiggleAnimation(target, delay) {
    // If no delay explicitly provided, wait 50ms for the board to finish snapping/redrawing
    let waitTime = delay || 50;

    window.setTimeout(function() {
        // Find the square and piece image
        let $targetSquare = $('#myBoard .square-' + target);
        let $targetImage = $targetSquare.find('img');

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

// Helper to play sounds safely
function playSound(name) {
    let sound = sounds[name];

    if (sound !== null) {
        // Reset the sound to the beginning
        sound.currentTime = 0;

        // Play the sound
        let soundSample = sound.play();

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

// Play a sound when hovering over a piece of the players color
function playHoverSound() {
    // Retrieve the piece data
    let piece = $(this).attr('data-piece');
    
    // Play the audio if the piece belongs to the player
    if (piece.charAt(0) === playerColor.charAt(0)) playSound('hover');
}

// Play sounds during move navigation, based on historical move data
function playHistoricalMoveSound() {
    if (viewingIndex === 0) {
        playSound('move');
        return;
    }

    // Determine the kind of move played
    let move = getPreviousMove();

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
// ==  Events  =================
// =============================

// ==========  UI element bindings  ==========

// Main menu
catPreviousBtn.addEventListener('click', previousCategory);
catNextBtn.addEventListener('click', nextCategory);
eloSlider.addEventListener('input', eloSliderChange);
colorRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
        playSound('select');
    });
});
startNewGameBtn.addEventListener('click', startNewGame);

// Board gameplay
$('#myBoard').on('mouseenter', '.square-55d63 img', playHoverSound);
$('#myBoard').on('click', '.square-55d63', onSquareClick);
// Automatically resize the board when the window size changes
window.addEventListener('resize', board.resize);

// Board controls
backBtn.addEventListener('click', navigateBack);
forwardBtn.addEventListener('click', navigateForward);
firstBtn.addEventListener('click', navigateFirst);
lastBtn.addEventListener('click', navigateLast);
undoBtn.addEventListener('click', undoMove);
hintBtn.addEventListener('click', getHint);

// In-game options modal
openOptionsBtn.addEventListener('click', openOptionsModal);
closeOptionsBtn.addEventListener('click', closeOptionsModal);
toggleHighlightsCheckbox.addEventListener('click', toggleLegalMoveHighlights);
toggleEvalBarCheckbox.addEventListener('change', toggleEvalBar);
clickMovingPreferenceRadioBtn.addEventListener('change', function() { setMovingPreference(true, false); });
dragMovingPreferenceRadioBtn.addEventListener('change', function() { setMovingPreference(false, true); });
bothMovingPreferenceRadioBtn.addEventListener('change', function() { setMovingPreference(true, true); });
resignBtn.addEventListener('click', resignGame);
window.addEventListener('click', optionsModuleOutsideClick);

// Game-over modal
exitToMenuBtn.addEventListener('click', exitToMenu);
rematchBtn.addEventListener('click', startNewGame);
reviewGameBtn.addEventListener('click', reviewGame);

// Confirm resignation modal
yesNoCloseBtn.addEventListener('click', cancelResignation);
yesBtn.addEventListener('click', confirmResignation);
noBtn.addEventListener('click', cancelResignation);

// Move history
$('#moveHistoryBody').on('click', '.move-link', moveHistoryNavigation);

// ==========  Hotkeys  ==========

document.addEventListener('keydown', function(event) {
    switch (event.key) {
        // == Special keys ==

        // Navigate back
        case 'ArrowLeft':
        case 'Home':
            if (gameActive || reviewingGame) {
                navigateBack();
            } else {

                if (catPreviousBtn === document.activeElement || catNextBtn === document.activeElement) {
                    previousCategory();
                    if (currentCategoryIndex === 0) catNextBtn.focus();   
                }
            }
            break;

        // Navigate forward
        case 'ArrowRight':
        case 'End':
            if (gameActive || reviewingGame) {
                navigateForward();
            } else {
                if (catPreviousBtn === document.activeElement || catNextBtn === document.activeElement) {
                    nextCategory();
                    if (currentCategoryIndex === difficultyCategories.length - 1) {
                        catPreviousBtn.focus();   
                    }
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

        // == Letter keys (Alphabetical) ==

        // Play as Black
        case 'b':
        case 'B':
            if (!optionsModalStatus()) {
                blackBtn.checked = true;
                blackBtn.focus();

            // Moving preference - click (Context: Options Modal)
            } else {

                if (optionsModalStatus()) {
                    setMovingPreference(true, true);
                    bothMovingPreferenceRadioBtn.checked = true;
                    bothMovingPreferenceRadioBtn.focus();
                }
            }
            break;

        // Moving preference - click
        case 'c':
        case 'C':

            if (optionsModalStatus()) {
                setMovingPreference(true, false);
                clickMovingPreferenceRadioBtn.checked = true;
                clickMovingPreferenceRadioBtn.focus();
            }
            break;

        // Difficulty selection
        case 'd':
        case 'D':
            if (!optionsModalStatus()) {
                document.getElementById('catNext').focus();

            // Moving preference - drag (Context: Options Modal)
            } else {

                if (optionsModalStatus()) {
                    setMovingPreference(false, true);
                    dragMovingPreferenceRadioBtn.checked = true;
                    dragMovingPreferenceRadioBtn.focus();
                }
            }
            break;

        // Toggle on/off evaluation score bar
        case 'e':
        case 'E':

            if (optionsModalStatus()) {
                toggleEvalBar();
                toggleEvalBarCheckbox.checked = evalBarEnabled;
            }
            break;

        // Navigate to the first move 
        case 'f':
        case 'F':
            navigateFirst();
            break;

        // Review the previous game
        case 'g':
        case 'G':
            if (gameOverModalStatus()) reviewGame();
            break;

        // Highlights / Hint
        case 'h':
        case 'H':
            // Toggle highlighting

            if (optionsModalStatus()) {
                toggleLegalMoveHighlights();
                toggleHighlightsCheckbox.checked = legalMoveHighlightsEnabled;
            }
            // Request a hint
            else {
                getHint();
            }
            break;

        // Navigate to the last move
        case 'l':
        case 'L':
            navigateLast();
            break;

        // Cancel resignation (No)
        case 'n':
        case 'N':
            if (yesNoModalStatus()) cancelResignation();
            break;

        // Open options modal
        case 'p':
        case 'P':
            openOptionsModal();
            break;

        // Resign or rematch
        case 'r':
        case 'R':
            // Resign 
            if (gameActive) {
                resignGame();
            // Rematch
            } else {
                if (gameOverModalStatus()) startNewGame();
            }
            break;

        // Start new game
        case 's':
        case 'S':
            startNewGame();
            break;

        // Undo previous move
        case 'u':
        case 'U':
            undoMove();
            break;

        // Play as White
        case 'w':
        case 'W':
            whiteBtn.checked = true;
            whiteBtn.focus();
            break;

        // Confirm resignation (Yes)
        case 'y':
        case 'Y':
            if (yesNoModalStatus()) confirmResignation();
            break;
    }
});



