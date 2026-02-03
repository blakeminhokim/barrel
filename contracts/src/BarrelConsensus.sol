// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

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
    }

    struct Stake {
        uint256 amount;
        bool isFor;              // true = agrees with proposal
        bool claimed;
    }

    // ============ State ============

    IERC20 public immutable barrelToken;
    address public vault;
    
    uint256 public constant QUORUM_BPS = 6600;  // 66% for consensus
    uint256 public constant PROPOSAL_TIMEOUT = 30 seconds;
    uint256 public constant COOLDOWN_PERIOD = 60 seconds;
    
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(address => Stake)) public stakes;
    mapping(address => bool) public registeredAgents;
    mapping(address => uint256) public agentCooldowns;
    
    bytes32[] public activeProposalIds;

    // ============ Events ============

    event ProposalCreated(bytes32 indexed id, address token, TradeDirection direction, address agent);
    event StakePlaced(bytes32 indexed proposalId, address indexed agent, uint256 amount, bool isFor);
    event ConsensusReached(bytes32 indexed proposalId, TradeDirection direction, uint256 totalStake);
    event ProposalExpired(bytes32 indexed proposalId);
    event AgentRegistered(address indexed agent);
    event AgentSlashed(address indexed agent, uint256 amount);

    // ============ Errors ============

    error NotRegisteredAgent();
    error AgentOnCooldown();
    error ProposalNotActive();
    error AlreadyStaked();
    error InsufficientStake();
    error ConsensusNotReached();

    // ============ Constructor ============

    constructor(address _barrelToken, address _vault) {
        barrelToken = IERC20(_barrelToken);
        vault = _vault;
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
    ) external returns (bytes32 proposalId) {
        if (!registeredAgents[msg.sender]) revert NotRegisteredAgent();
        if (block.timestamp < agentCooldowns[msg.sender]) revert AgentOnCooldown();
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
            status: ProposalStatus.Pending
        });

        stakes[proposalId][msg.sender] = Stake({
            amount: initialStake,
            isFor: true,
            claimed: false
        });

        barrelToken.transferFrom(msg.sender, address(this), initialStake);
        activeProposalIds.push(proposalId);

        emit ProposalCreated(proposalId, token, direction, msg.sender);
        emit StakePlaced(proposalId, msg.sender, initialStake, true);
    }

    /**
     * @notice Stake on an existing proposal
     * @param proposalId The proposal to stake on
     * @param amount Amount to stake
     * @param isFor Whether you agree with the proposal
     */
    function stake(bytes32 proposalId, uint256 amount, bool isFor) external {
        if (!registeredAgents[msg.sender]) revert NotRegisteredAgent();
        if (proposals[proposalId].status != ProposalStatus.Pending) revert ProposalNotActive();
        if (block.timestamp >= proposals[proposalId].expiresAt) revert ProposalNotActive();
        if (stakes[proposalId][msg.sender].amount > 0) revert AlreadyStaked();
        if (amount == 0) revert InsufficientStake();

        stakes[proposalId][msg.sender] = Stake({
            amount: amount,
            isFor: isFor,
            claimed: false
        });

        if (isFor) {
            proposals[proposalId].totalStakeFor += amount;
        } else {
            proposals[proposalId].totalStakeAgainst += amount;
        }

        barrelToken.transferFrom(msg.sender, address(this), amount);

        emit StakePlaced(proposalId, msg.sender, amount, isFor);

        // Check if consensus reached
        _checkConsensus(proposalId);
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
            emit ConsensusReached(proposalId, proposal.direction, proposal.totalStakeFor);
            // TODO: Trigger vault execution
        } else if (againstPercentage >= QUORUM_BPS) {
            proposal.status = ProposalStatus.Rejected;
        }
    }

    // ============ Admin Functions ============

    function registerAgent(address agent) external {
        // TODO: Add access control
        registeredAgents[agent] = true;
        emit AgentRegistered(agent);
    }

    // ============ View Functions ============

    function getProposal(bytes32 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getStake(bytes32 proposalId, address agent) external view returns (Stake memory) {
        return stakes[proposalId][agent];
    }
}
