<img src="img/logo.png" alt="Blockfish logo" width="125"/>

# **Blockfish** 
A highly responsive chess web application with professional-grade game-analysis.

## Play ##
[![Static Badge](https://img.shields.io/badge/Play%20Blockfish-Click_here-brightgreen)](https://maxximillionthomas.github.io/blockfish/) 

## Overview
**Blockfish is a Minecraft-themed chess platform** built for players who want to lock in on their improvement while having fun.       
It combines a friendly pixel aesthetic with modern engine analysis, focusing on mathematical accuracy in move judgement.  
The application offers a smooth user experience across both desktop and mobile devices.

## Key Features
- **Stockfish Integration**: Powered by a Stockfish 16 Web Worker for near-instant move generation and high-depth analysis.
- **Adaptive Difficulty**: Offers bot profiles ranging from "Very Easy" (100 Elo) to "Grandmaster" (3000 Elo) with randomized sub-optimal move generation for lower levels.
- **Accuracy 2.0 System**: Mimics Chess.com accuracy using a 1000cp sigmoid function and exponential decay, punishing blunders and rewarding precision.
- **Batch Game Review**: Provides a full post-game breakdown, including best-move hints, accuracy percentages, and move quality badges (Best, Excellent, Good, Inaccuracy, Mistake, Blunder).

## Technical Stack
**Frontend**: HTML5, CSS3, JavaScript.

**Libraries**:
- **Chess.js**: For game logic, move validation, and FEN/PGN handling.
- **Chessboard.js**: For board visualization and piece interaction.

**Engine**: Stockfish.js (Web Worker implementation).

## Installation & Setup
1. Clone the repository
2. Open index.html

*No server is required; the engines run locally in your browser via Web Workers.*

## Author
Maxximillion Thomas