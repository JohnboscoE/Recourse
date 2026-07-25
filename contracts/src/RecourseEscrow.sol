// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";

/// @title RecourseEscrow
/// @notice Escrowed payment for agent-executed onchain work, released only when
///         the resulting CHAIN STATE matches the promise — not merely when a
///         transaction succeeds.
///
/// The predicate is deliberately a single kind (see CLAUDE.md hard constraint):
///
///     "`subject`'s USDC balance increases by at least `minIncrease`
///      (base units) by time `deadline`."
///
/// Payment and the verified token are both USDC, fixed at deploy time. The
/// balance delta is verified ON-CHAIN against a baseline snapshotted at job
/// creation, so release is trustless — no oracle decides the outcome, the chain
/// does. The KeeperHub executionId is recorded on claim purely for audit-trail
/// provenance; it is not trusted for verification.
contract RecourseEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Open, // created & funded, no agent yet
        Claimed, // an agent has claimed and submitted a KeeperHub executionId
        Released, // delta verified on-chain, payment sent to agent
        Refunded // deadline passed without a verified delta, poster refunded
    }

    struct Job {
        address poster; // funded the payment, receives refund
        address agent; // claimed the job, receives payment on success
        address subject; // address whose USDC balance must increase
        uint256 paymentAmount; // USDC locked as payment
        uint256 minIncrease; // required increase in subject's USDC balance
        uint256 baseline; // subject's USDC balance at createJob time
        uint64 deadline; // delta must be verified at/before this timestamp
        Status status;
        string executionRef; // KeeperHub executionId (audit-trail linkage)
    }

    /// @notice The one token this escrow deals in, for both payment and predicate.
    IERC20 public immutable usdc;

    uint256 public jobCount;
    mapping(uint256 => Job) private _jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed poster,
        address indexed subject,
        uint256 paymentAmount,
        uint256 minIncrease,
        uint256 baseline,
        uint64 deadline
    );
    event Claimed(uint256 indexed jobId, address indexed agent, string executionRef);
    event Released(uint256 indexed jobId, address indexed agent, uint256 observedIncrease);
    event Refunded(uint256 indexed jobId, address indexed poster);

    error InvalidParams();
    error NotOpen();
    error NotClaimed();
    error DeadlinePassed();
    error DeadlineNotReached();
    error AlreadySettled();
    error PredicateNotMet(uint256 observedIncrease, uint256 required);

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert InvalidParams();
        usdc = IERC20(usdc_);
    }

    /// @notice Post a job: lock `paymentAmount` USDC and record the predicate.
    /// @dev Poster must have approved this contract for `paymentAmount` first.
    ///      Baseline is snapshotted now, so only increases AFTER this call count.
    function createJob(address subject, uint256 minIncrease, uint256 paymentAmount, uint64 deadline)
        external
        nonReentrant
        returns (uint256 jobId)
    {
        if (subject == address(0) || minIncrease == 0 || paymentAmount == 0 || deadline <= block.timestamp) {
            revert InvalidParams();
        }

        uint256 baseline = usdc.balanceOf(subject);

        jobId = ++jobCount;
        _jobs[jobId] = Job({
            poster: msg.sender,
            agent: address(0),
            subject: subject,
            paymentAmount: paymentAmount,
            minIncrease: minIncrease,
            baseline: baseline,
            deadline: deadline,
            status: Status.Open,
            executionRef: ""
        });

        // Pull payment AFTER recording state (CEI); nonReentrant for belt-and-braces.
        usdc.safeTransferFrom(msg.sender, address(this), paymentAmount);

        emit JobCreated(jobId, msg.sender, subject, paymentAmount, minIncrease, baseline, deadline);
    }

    /// @notice An agent claims a job and records the KeeperHub executionId that
    ///         will (be expected to) produce the promised delta.
    function claim(uint256 jobId, string calldata executionRef) external {
        Job storage job = _jobs[jobId];
        if (job.status != Status.Open) revert NotOpen();
        if (block.timestamp > job.deadline) revert DeadlinePassed();

        job.agent = msg.sender;
        job.executionRef = executionRef;
        job.status = Status.Claimed;

        emit Claimed(jobId, msg.sender, executionRef);
    }

    /// @notice Verify the on-chain balance delta and, if met, pay the agent.
    /// @dev Callable by anyone — correctness is enforced by the chain read, not
    ///      by trusting the caller. The resolver typically calls this after
    ///      observing the KeeperHub execution succeed.
    function release(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        if (job.status != Status.Claimed) revert NotClaimed();
        if (block.timestamp > job.deadline) revert DeadlinePassed();

        uint256 current = usdc.balanceOf(job.subject);
        uint256 increase = current > job.baseline ? current - job.baseline : 0;
        if (increase < job.minIncrease) {
            revert PredicateNotMet(increase, job.minIncrease);
        }

        job.status = Status.Released;
        address agent = job.agent;
        uint256 amount = job.paymentAmount;

        usdc.safeTransfer(agent, amount);

        emit Released(jobId, agent, increase);
    }

    /// @notice After the deadline, if the job was never released, refund the poster.
    /// @dev The agent's responsibility is to call `release` in time while the
    ///      delta holds; the resolver automates this. If they don't, the poster
    ///      reclaims funds once the window closes.
    function refund(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        if (job.status == Status.Released || job.status == Status.Refunded) {
            revert AlreadySettled();
        }
        if (block.timestamp <= job.deadline) revert DeadlineNotReached();

        job.status = Status.Refunded;
        address poster = job.poster;
        uint256 amount = job.paymentAmount;

        usdc.safeTransfer(poster, amount);

        emit Refunded(jobId, poster);
    }

    /// @notice Read a job's full state.
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /// @notice Current observed increase in the subject's USDC balance vs baseline.
    function observedIncrease(uint256 jobId) external view returns (uint256) {
        Job storage job = _jobs[jobId];
        uint256 current = usdc.balanceOf(job.subject);
        return current > job.baseline ? current - job.baseline : 0;
    }
}
