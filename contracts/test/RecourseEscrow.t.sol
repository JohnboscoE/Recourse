// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RecourseEscrow} from "../src/RecourseEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract RecourseEscrowTest is Test {
    RecourseEscrow escrow;
    MockUSDC usdc;

    address poster = makeAddr("poster");
    address agent = makeAddr("agent");
    address subject = makeAddr("subject"); // e.g. a treasury that must receive USDC

    uint256 constant PAYMENT = 5e6; // 5 USDC
    uint256 constant MIN_INCREASE = 100e6; // subject must receive >= 100 USDC
    uint64 deadline;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new RecourseEscrow(address(usdc));
        deadline = uint64(block.timestamp + 1 days);

        usdc.mint(poster, PAYMENT);
        vm.prank(poster);
        usdc.approve(address(escrow), PAYMENT);
    }

    function _createJob() internal returns (uint256 jobId) {
        vm.prank(poster);
        jobId = escrow.createJob(subject, MIN_INCREASE, PAYMENT, deadline);
    }

    // Simulate the agent doing the work: subject's USDC balance goes up.
    function _fulfil(uint256 amount) internal {
        usdc.mint(subject, amount);
    }

    function test_createJob_locksPaymentAndSnapshotsBaseline() public {
        // Give the subject a pre-existing balance to prove baseline is captured.
        _fulfil(42e6);
        uint256 jobId = _createJob();

        assertEq(usdc.balanceOf(address(escrow)), PAYMENT, "payment locked");
        RecourseEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.baseline, 42e6, "baseline snapshot");
        assertEq(uint256(job.status), uint256(RecourseEscrow.Status.Open));
    }

    function test_happyPath_deltaMet_releasesToAgent() public {
        uint256 jobId = _createJob();

        vm.prank(agent);
        escrow.claim(jobId, "kh_exec_abc123");

        _fulfil(MIN_INCREASE); // agent executed via KeeperHub; balance went up

        escrow.release(jobId); // anyone can call; chain read enforces correctness

        assertEq(usdc.balanceOf(agent), PAYMENT, "agent paid");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow drained");
        assertEq(uint256(escrow.getJob(jobId).status), uint256(RecourseEscrow.Status.Released));
    }

    function test_release_revertsWhenDeltaNotMet() public {
        uint256 jobId = _createJob();
        vm.prank(agent);
        escrow.claim(jobId, "kh_exec_abc123");

        _fulfil(MIN_INCREASE - 1); // one base unit short

        vm.expectRevert(
            abi.encodeWithSelector(RecourseEscrow.PredicateNotMet.selector, MIN_INCREASE - 1, MIN_INCREASE)
        );
        escrow.release(jobId);
    }

    function test_release_revertsAfterDeadline() public {
        uint256 jobId = _createJob();
        vm.prank(agent);
        escrow.claim(jobId, "kh_exec_abc123");
        _fulfil(MIN_INCREASE);

        vm.warp(deadline + 1);
        vm.expectRevert(RecourseEscrow.DeadlinePassed.selector);
        escrow.release(jobId);
    }

    function test_refund_afterDeadline_whenUnfulfilled() public {
        uint256 jobId = _createJob();
        vm.prank(agent);
        escrow.claim(jobId, "kh_exec_abc123");
        // no fulfilment

        vm.warp(deadline + 1);
        escrow.refund(jobId);

        assertEq(usdc.balanceOf(poster), PAYMENT, "poster refunded");
        assertEq(uint256(escrow.getJob(jobId).status), uint256(RecourseEscrow.Status.Refunded));
    }

    function test_refund_revertsBeforeDeadline() public {
        uint256 jobId = _createJob();
        vm.expectRevert(RecourseEscrow.DeadlineNotReached.selector);
        escrow.refund(jobId);
    }

    function test_refund_revertsAfterRelease() public {
        uint256 jobId = _createJob();
        vm.prank(agent);
        escrow.claim(jobId, "kh_exec_abc123");
        _fulfil(MIN_INCREASE);
        escrow.release(jobId);

        vm.warp(deadline + 1);
        vm.expectRevert(RecourseEscrow.AlreadySettled.selector);
        escrow.refund(jobId);
    }

    function test_claim_revertsAfterDeadline() public {
        uint256 jobId = _createJob();
        vm.warp(deadline + 1);
        vm.prank(agent);
        vm.expectRevert(RecourseEscrow.DeadlinePassed.selector);
        escrow.claim(jobId, "kh_exec_abc123");
    }

    function test_release_revertsIfNotClaimed() public {
        uint256 jobId = _createJob();
        _fulfil(MIN_INCREASE);
        vm.expectRevert(RecourseEscrow.NotClaimed.selector);
        escrow.release(jobId);
    }
}
