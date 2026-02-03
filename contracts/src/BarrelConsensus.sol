// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

interface IBarrelVault {
    function executeSimpleTrade(bytes32 proposalId, address tokenIn, address tokenOut, uint256 amountIn) external;
}

/**
 * @title BarrelConsensus
 * @notice Stake-weighted consensus mechanism for trading decisions
 * @dev Agents stake tokens on trade proposals, consensus triggers execution
 */
contract BarrelConsensus {
    // ============ Types ============

    enum ProposalStatus { Pending, Executed, Expired, Rejected }
    enum TradeDirection { Long, Short, Hold }

    struct Proposal {
        bytes32 id;
        address token;           // Token to trade
        TradeDirection direction;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 totalStakeFor;
        uint256 totalStakeAgainst;
        ProposalStatus status;
        address creator;
    }

    struct Stake {
        uint256 amount;
        bool isFor;
        bool claimed;
    }

    struct AgentInfo {
        bool registered;
        uint256 totalStaked;
        uint256 wins;
        uint256 losses;
        uint256 cooldownUntil;
    }

    // ============ State ============

    IERC20 public immutable barrelToken;
    IBarrelVault public vault;
    address public owner;
    
    uint256 public constant QUORUM_BPS = 6600;  // 66% for consensus
    uint256 public constant PROPOSAL_TIMEOUT = 30 seconds;
    uint256 public constant COOLDOWN_PERIOD = 60 seconds;
    uint256 public constant SLASH_BPS = 1000;   // 10% slash on wrong side
    uint256 public constant REWARD_BPS = 500;   // 5% bonus for winners
    
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(address => Stake)) public stakes;
    mapping(bytes32 => address[]) public proposalStakers;
    mapping(address => AgentInfo) public agents;
    
    bytes32[] public activeProposalIds;
    bytes32[] public allProposalIds;

    // ============ Events ============

    event ProposalCreated(bytes32 indexed id, address indexed token, TradeDirection direction, address indexed agent);
    event StakePlaced(bytes32 indexed proposalId, address indexed agent, uint256 amount, bool isFor);
    event ConsensusReached(bytes32 indexed proposalId, TradeDirection direction, uint256 totalStake);
    event ProposalExpired(bytes32 indexed proposalId);
    event ProposalRejected(bytes32 indexed proposalId);
    event AgentRegistered(address indexed agent);
    event AgentSlashed(address indexed agent, uint256 amount);
    event RewardClaimed(address indexed agent, bytes32 indexed proposalId, uint256 amount);
    event VaultUpdated(address indexed newVault);

    // ============ Errors ============

    error NotOwner();
    error NotRegisteredAgent();
    error AgentOnCooldown();
    error ProposalNotActive();
    error ProposalNotFinalized();
    error AlreadyStaked();
    error AlreadyClaimed();
    error InsufficientStake();
    error ZeroAddress();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (!agents[msg.sender].registered) revert NotRegisteredAgent();
        _;
    }

    // ============ Constructor ============

    constructor(address _barrelToken, address _vault) {
        barrelToken = IERC20(_barrelToken);
        vault = IBarrelVault(_vault);
        owner = msg.sender;
    }

    // ============ Agent Functions ============

    /**
     * @notice Create a new trade proposal
     * @param token The token to trade
     * @param direction Long, Short, or Hold
     * @param initialStake Amount to stake on this proposal
     */
    function createProposal(
        address token,
        TradeDirection direction,
        uint256 initialStake
    ) external onlyAgent returns (bytes32 proposalId) {
        AgentInfo storage agent = agents[msg.sender];
        if (block.timestamp < agent.cooldownUntil) revert AgentOnCooldown();
        if (initialStake == 0) revert InsufficientStake();

        proposalId = keccak256(abi.encodePacked(token, direction, block.timestamp, msg.sender));
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            token: token,
            direction: direction,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + PROPOSAL_TIMEOUT,
            totalStakeFor: initialStake,
            totalStakeAgainst: 0,
            status: ProposalStatus.Pending,
            creator: msg.sender
        });

        stakes[proposalId][msg.sender] = Stake({
            amount: initialStake,
            isFor: true,
            claimed: false
        });

        proposalStakers[proposalId].push(msg.sender);
        agent.totalStaked += initialStake;

        barrelToken.transferFrom(msg.sender, address(this), initialStake);
        activeProposalIds.push(proposalId);
        allProposalIds.push(proposalId);

        emit ProposalCreated(proposalId, token, direction, msg.sender);
        emit StakePlaced(proposalId, msg.sender, initialStake, true);

        return proposalId;
    }

    /**
     * @notice Stake on an existing proposal
     * @param proposalId The proposal to stake on
     * @param amount Amount to stake
     * @param isFor Whether you agree with the proposal
     */
    function stake(bytes32 proposalId, uint256 amount, bool isFor) external onlyAgent {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.status != ProposalStatus.Pending) revert ProposalNotActive();
        if (block.timestamp >= proposal.expiresAt) revert ProposalNotActive();
        if (stakes[proposalId][msg.sender].amount > 0) revert AlreadyStaked();
        if (amount == 0) revert InsufficientStake();

        stakes[proposalId][msg.sender] = Stake({
            amount: amount,
            isFor: isFor,
            claimed: false
        });

        proposalStakers[proposalId].push(msg.sender);
        agents[msg.sender].totalStaked += amount;

        if (isFor) {
            proposal.totalStakeFor += amount;
        } else {
            proposal.totalStakeAgainst += amount;
        }

        barrelToken.transferFrom(msg.sender, address(this), amount);

        emit StakePlaced(proposalId, msg.sender, amount, isFor);

        // Check if consensus reached
        _checkConsensus(proposalId);
    }

    /**
     * @notice Claim rewards/stake after proposal is finalized
     * @param proposalId The finalized proposal
     */
    function claimRewards(bytes32 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        Stake storage userStake = stakes[proposalId][msg.sender];
        
        if (proposal.status == ProposalStatus.Pending) revert ProposalNotFinalized();
        if (userStake.amount == 0) revert InsufficientStake();
        if (userStake.claimed) revert AlreadyClaimed();

        userStake.claimed = true;

        bool wasWinner = (proposal.status == ProposalStatus.Executed && userStake.isFor) ||
                         (proposal.status == ProposalStatus.Rejected && !userStake.isFor);

        uint256 payout;
        if (wasWinner) {
            // Winners get stake back + bonus from losers
            uint256 bonus = (userStake.amount * REWARD_BPS) / 10000;
            payout = userStake.amount + bonus;
            agents[msg.sender].wins++;
            emit RewardClaimed(msg.sender, proposalId, payout);
        } else if (proposal.status == ProposalStatus.Expired) {
            // Expired = full refund
            payout = userStake.amount;
        } else {
            // Losers get slashed
            uint256 slash = (userStake.amount * SLASH_BPS) / 10000;
            payout = userStake.amount - slash;
            agents[msg.sender].losses++;
            agents[msg.sender].cooldownUntil = block.timestamp + COOLDOWN_PERIOD;
            emit AgentSlashed(msg.sender, slash);
        }

        if (payout > 0) {
            barrelToken.transfer(msg.sender, payout);
        }
    }

    /**
     * @notice Expire a proposal that has timed out
     * @param proposalId The proposal to expire
     */
    function expireProposal(bytes32 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.status != ProposalStatus.Pending) revert ProposalNotActive();
        if (block.timestamp < proposal.expiresAt) revert ProposalNotFinalized();

        proposal.status = ProposalStatus.Expired;
        _removeFromActive(proposalId);
        
        emit ProposalExpired(proposalId);
    }

    // ============ Internal Functions ============

    function _checkConsensus(bytes32 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        uint256 totalStake = proposal.totalStakeFor + proposal.totalStakeAgainst;
        
        if (totalStake == 0) return;

        uint256 forPercentage = (proposal.totalStakeFor * 10000) / totalStake;
        uint256 againstPercentage = (proposal.totalStakeAgainst * 10000) / totalStake;

        if (forPercentage >= QUORUM_BPS) {
            proposal.status = ProposalStatus.Executed;
            _removeFromActive(proposalId);
            emit ConsensusReached(proposalId, proposal.direction, proposal.totalStakeFor);
            
            // Trigger vault execution (if not Hold)
            if (proposal.direction != TradeDirection.Hold && address(vault) != address(0)) {
                // In production, would pass actual trade params
                // vault.executeSimpleTrade(proposalId, proposal.token, address(0), 0);
            }
        } else if (againstPercentage >= QUORUM_BPS) {
            proposal.status = ProposalStatus.Rejected;
            _removeFromActive(proposalId);
            emit ProposalRejected(proposalId);
        }
    }

    function _removeFromActive(bytes32 proposalId) internal {
        uint256 len = activeProposalIds.length;
        for (uint256 i = 0; i < len; i++) {
            if (activeProposalIds[i] == proposalId) {
                activeProposalIds[i] = activeProposalIds[len - 1];
                activeProposalIds.pop();
                break;
            }
        }
    }

    // ============ Admin Functions ============

    function registerAgent(address agent) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        agents[agent].registered = true;
        emit AgentRegistered(agent);
    }

    function setVault(address _vault) external onlyOwner {
        vault = IBarrelVault(_vault);
        emit VaultUpdated(_vault);
    }

    function renounceOwnership() external onlyOwner {
        owner = address(0);
    }

    // ============ View Functions ============

    function getProposal(bytes32 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getStake(bytes32 proposalId, address agent) external view returns (Stake memory) {
        return stakes[proposalId][agent];
    }

    function getAgentInfo(address agent) external view returns (AgentInfo memory) {
        return agents[agent];
    }

    function getActiveProposalCount() external view returns (uint256) {
        return activeProposalIds.length;
    }

    function getAllProposalCount() external view returns (uint256) {
        return allProposalIds.length;
    }

    function getProposalStakers(bytes32 proposalId) external view returns (address[] memory) {
        return proposalStakers[proposalId];
    }
}
