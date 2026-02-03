// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BarrelToken.sol";
import "../src/BarrelConsensus.sol";
import "../src/BarrelVault.sol";

contract BarrelConsensusTest is Test {
    BarrelToken token;
    BarrelConsensus consensus;
    BarrelVault vault;

    address owner = address(this);
    address mo = address(0x1);      // Momentum agent
    address vox = address(0x2);     // Sentiment agent
    address degen = address(0x3);   // YOLO agent
    address targetToken = address(0x100);

    uint256 constant INITIAL_SUPPLY = 1_000_000 ether;
    uint256 constant AGENT_ALLOCATION = 100_000 ether;

    function setUp() public {
        // Deploy contracts
        token = new BarrelToken();
        vault = new BarrelVault(address(0)); // Temporary, will update
        consensus = new BarrelConsensus(address(token), address(vault));
        
        // Update vault to point to consensus
        vault.setConsensus(address(consensus));
        consensus.setVault(address(vault));

        // Mint initial supply
        token.mint(owner, INITIAL_SUPPLY);

        // Register agents
        consensus.registerAgent(mo);
        consensus.registerAgent(vox);
        consensus.registerAgent(degen);

        // Fund agents
        token.transfer(mo, AGENT_ALLOCATION);
        token.transfer(vox, AGENT_ALLOCATION);
        token.transfer(degen, AGENT_ALLOCATION);

        // Approve consensus contract
        vm.prank(mo);
        token.approve(address(consensus), type(uint256).max);
        vm.prank(vox);
        token.approve(address(consensus), type(uint256).max);
        vm.prank(degen);
        token.approve(address(consensus), type(uint256).max);
    }

    // ============ Token Tests ============

    function test_TokenDeployment() public view {
        assertEq(token.name(), "Barrel");
        assertEq(token.symbol(), "BARREL");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function test_TokenMinting() public {
        uint256 mintAmount = 1000 ether;
        token.mint(address(0x999), mintAmount);
        assertEq(token.balanceOf(address(0x999)), mintAmount);
    }

    function test_TokenMintingFinished() public {
        token.finishMinting();
        vm.expectRevert(BarrelToken.MintingFinished.selector);
        token.mint(address(0x999), 1000 ether);
    }

    // ============ Agent Registration Tests ============

    function test_AgentRegistration() public view {
        BarrelConsensus.AgentInfo memory moInfo = consensus.getAgentInfo(mo);
        assertTrue(moInfo.registered);
    }

    function test_UnregisteredAgentCannotPropose() public {
        address randomUser = address(0x999);
        vm.prank(randomUser);
        vm.expectRevert(BarrelConsensus.NotRegisteredAgent.selector);
        consensus.createProposal(targetToken, BarrelConsensus.TradeDirection.Long, 1000 ether);
    }

    // ============ Proposal Tests ============

    function test_CreateProposal() public {
        uint256 stakeAmount = 10_000 ether;
        
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            stakeAmount
        );

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(proposal.token, targetToken);
        assertEq(uint256(proposal.direction), uint256(BarrelConsensus.TradeDirection.Long));
        assertEq(proposal.totalStakeFor, stakeAmount);
        assertEq(proposal.totalStakeAgainst, 0);
        assertEq(uint256(proposal.status), uint256(BarrelConsensus.ProposalStatus.Pending));
        assertEq(proposal.creator, mo);
    }

    function test_StakeOnProposal() public {
        // Mo creates proposal
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Vox stakes FOR
        vm.prank(vox);
        consensus.stake(proposalId, 15_000 ether, true);

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(proposal.totalStakeFor, 25_000 ether);
    }

    function test_StakeAgainstProposal() public {
        // Mo creates proposal
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Vox stakes AGAINST
        vm.prank(vox);
        consensus.stake(proposalId, 15_000 ether, false);

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(proposal.totalStakeFor, 10_000 ether);
        assertEq(proposal.totalStakeAgainst, 15_000 ether);
    }

    function test_CannotStakeTwice() public {
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        vm.prank(mo);
        vm.expectRevert(BarrelConsensus.AlreadyStaked.selector);
        consensus.stake(proposalId, 5_000 ether, true);
    }

    // ============ Consensus Tests ============

    function test_ConsensusReachedWithQuorum() public {
        // Mo creates proposal with 10k
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Vox stakes FOR with 20k (total: 30k FOR, 0 AGAINST = 100% FOR)
        vm.prank(vox);
        consensus.stake(proposalId, 20_000 ether, true);

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(uint256(proposal.status), uint256(BarrelConsensus.ProposalStatus.Executed));
    }

    function test_ConsensusRejectedWithQuorum() public {
        // Mo creates proposal with 10k
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Vox stakes AGAINST with 25k
        // Total: 10k FOR, 25k AGAINST = 71% AGAINST > 66% — immediate rejection
        vm.prank(vox);
        consensus.stake(proposalId, 25_000 ether, false);

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(uint256(proposal.status), uint256(BarrelConsensus.ProposalStatus.Rejected));
    }

    function test_NoConsensusWithoutQuorum() public {
        // Mo creates proposal with 10k
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Vox stakes FOR with 5k (50-50 split, neither has 66%)
        vm.prank(vox);
        consensus.stake(proposalId, 10_000 ether, false);

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(uint256(proposal.status), uint256(BarrelConsensus.ProposalStatus.Pending));
    }

    // ============ Expiry Tests ============

    function test_ProposalExpiry() public {
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Fast forward past timeout
        vm.warp(block.timestamp + 31 seconds);

        consensus.expireProposal(proposalId);

        BarrelConsensus.Proposal memory proposal = consensus.getProposal(proposalId);
        assertEq(uint256(proposal.status), uint256(BarrelConsensus.ProposalStatus.Expired));
    }

    function test_CannotExpireBeforeTimeout() public {
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        vm.expectRevert(BarrelConsensus.ProposalNotFinalized.selector);
        consensus.expireProposal(proposalId);
    }

    // ============ Reward/Slash Tests ============

    function test_WinnerClaimsReward() public {
        // Setup: Mo proposes, Vox supports, consensus reached
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        vm.prank(vox);
        consensus.stake(proposalId, 20_000 ether, true);

        // Proposal should be executed now
        uint256 moBalanceBefore = token.balanceOf(mo);
        
        vm.prank(mo);
        consensus.claimRewards(proposalId);

        uint256 moBalanceAfter = token.balanceOf(mo);
        // Mo should get stake back + 5% bonus
        uint256 expectedPayout = 10_000 ether + (10_000 ether * 500 / 10000);
        assertEq(moBalanceAfter - moBalanceBefore, expectedPayout);
    }

    function test_LoserGetsSlashed() public {
        // Setup: Mo proposes, Vox rejects with enough to hit quorum
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        // Vox stakes AGAINST with 25k (71% AGAINST = rejected)
        vm.prank(vox);
        consensus.stake(proposalId, 25_000 ether, false);

        // Proposal rejected, Mo is a loser
        uint256 moBalanceBefore = token.balanceOf(mo);
        
        vm.prank(mo);
        consensus.claimRewards(proposalId);

        uint256 moBalanceAfter = token.balanceOf(mo);
        // Mo gets stake back minus 10% slash
        uint256 expectedPayout = 10_000 ether - (10_000 ether * 1000 / 10000);
        assertEq(moBalanceAfter - moBalanceBefore, expectedPayout);
    }

    function test_ExpiredProposalFullRefund() public {
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        vm.warp(block.timestamp + 31 seconds);
        consensus.expireProposal(proposalId);

        uint256 moBalanceBefore = token.balanceOf(mo);
        
        vm.prank(mo);
        consensus.claimRewards(proposalId);

        uint256 moBalanceAfter = token.balanceOf(mo);
        // Full refund on expiry
        assertEq(moBalanceAfter - moBalanceBefore, 10_000 ether);
    }

    // ============ Cooldown Tests ============

    function test_LoserOnCooldown() public {
        // Mo proposes and loses
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        vm.prank(vox);
        consensus.stake(proposalId, 30_000 ether, false);

        vm.prank(mo);
        consensus.claimRewards(proposalId);

        // Mo should be on cooldown
        vm.prank(mo);
        vm.expectRevert(BarrelConsensus.AgentOnCooldown.selector);
        consensus.createProposal(targetToken, BarrelConsensus.TradeDirection.Long, 5_000 ether);

        // After cooldown period, Mo can propose again
        vm.warp(block.timestamp + 61 seconds);
        vm.prank(mo);
        consensus.createProposal(targetToken, BarrelConsensus.TradeDirection.Long, 5_000 ether);
    }

    // ============ View Function Tests ============

    function test_GetProposalStakers() public {
        vm.prank(mo);
        bytes32 proposalId = consensus.createProposal(
            targetToken,
            BarrelConsensus.TradeDirection.Long,
            10_000 ether
        );

        vm.prank(vox);
        consensus.stake(proposalId, 15_000 ether, true);

        address[] memory stakers = consensus.getProposalStakers(proposalId);
        assertEq(stakers.length, 2);
        assertEq(stakers[0], mo);
        assertEq(stakers[1], vox);
    }

    function test_GetActiveProposalCount() public {
        vm.prank(mo);
        consensus.createProposal(targetToken, BarrelConsensus.TradeDirection.Long, 10_000 ether);
        
        vm.prank(vox);
        consensus.createProposal(targetToken, BarrelConsensus.TradeDirection.Short, 10_000 ether);

        assertEq(consensus.getActiveProposalCount(), 2);
    }
}
