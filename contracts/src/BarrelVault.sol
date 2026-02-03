// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

/**
 * @title BarrelVault
 * @notice Treasury contract that holds trading capital and executes approved trades
 * @dev Called by BarrelConsensus when consensus is reached
 */
contract BarrelVault {
    // ============ State ============

    address public consensus;
    address public owner;
    
    // Supported trading tokens
    mapping(address => bool) public supportedTokens;
    
    // Trade execution records
    struct Trade {
        bytes32 proposalId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 executedAt;
    }
    
    Trade[] public trades;
    mapping(bytes32 => bool) public executedProposals;

    // ============ Events ============

    event TradeExecuted(
        bytes32 indexed proposalId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event TokenSupported(address indexed token, bool supported);
    event ConsensusUpdated(address indexed newConsensus);
    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // ============ Errors ============

    error NotOwner();
    error NotConsensus();
    error UnsupportedToken();
    error AlreadyExecuted();
    error InsufficientBalance();
    error ZeroAddress();
    error ZeroAmount();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyConsensus() {
        if (msg.sender != consensus) revert NotConsensus();
        _;
    }

    // ============ Constructor ============

    constructor(address _consensus) {
        owner = msg.sender;
        consensus = _consensus;
    }

    // ============ Trading Functions ============

    /**
     * @notice Execute a trade approved by consensus
     * @param proposalId The proposal that was approved
     * @param tokenIn Token to sell
     * @param tokenOut Token to buy
     * @param amountIn Amount to sell
     * @param minAmountOut Minimum amount to receive (slippage protection)
     * @param swapData Encoded swap calldata for DEX aggregator
     * @param swapTarget DEX aggregator contract to call
     */
    function executeTrade(
        bytes32 proposalId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapData,
        address swapTarget
    ) external onlyConsensus returns (uint256 amountOut) {
        if (executedProposals[proposalId]) revert AlreadyExecuted();
        if (!supportedTokens[tokenIn] || !supportedTokens[tokenOut]) revert UnsupportedToken();
        if (amountIn == 0) revert ZeroAmount();

        // Mark as executed before external call (reentrancy protection)
        executedProposals[proposalId] = true;

        // Get balance before
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // Approve DEX to spend tokenIn
        IERC20(tokenIn).approve(swapTarget, amountIn);

        // Execute swap via DEX aggregator
        (bool success,) = swapTarget.call(swapData);
        require(success, "Swap failed");

        // Calculate amount received
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        require(amountOut >= minAmountOut, "Slippage too high");

        // Record trade
        trades.push(Trade({
            proposalId: proposalId,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: amountOut,
            executedAt: block.timestamp
        }));

        emit TradeExecuted(proposalId, tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Simple swap without external DEX (for testing/simple cases)
     * @dev In production, use executeTrade with DEX aggregator
     */
    function executeSimpleTrade(
        bytes32 proposalId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external onlyConsensus {
        if (executedProposals[proposalId]) revert AlreadyExecuted();
        if (!supportedTokens[tokenIn]) revert UnsupportedToken();
        if (amountIn == 0) revert ZeroAmount();

        executedProposals[proposalId] = true;

        // Record trade (no actual swap, just mark position change)
        trades.push(Trade({
            proposalId: proposalId,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: 0, // Filled later or marked as pending
            executedAt: block.timestamp
        }));

        emit TradeExecuted(proposalId, tokenIn, tokenOut, amountIn, 0);
    }

    // ============ Admin Functions ============

    function setConsensus(address _consensus) external onlyOwner {
        if (_consensus == address(0)) revert ZeroAddress();
        consensus = _consensus;
        emit ConsensusUpdated(_consensus);
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedTokens[token] = supported;
        emit TokenSupported(token, supported);
    }

    function deposit(address token, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount);
    }

    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).transfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    function renounceOwnership() external onlyOwner {
        owner = address(0);
    }

    // ============ View Functions ============

    function getTradeCount() external view returns (uint256) {
        return trades.length;
    }

    function getTrade(uint256 index) external view returns (Trade memory) {
        return trades[index];
    }

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
