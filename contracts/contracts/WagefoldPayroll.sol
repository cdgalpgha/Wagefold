// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title WagefoldPayroll
/// @notice Pays a whole payroll (many recipients, one or more ERC-20 tokens) in a single transaction.
/// @dev Funds always move from `msg.sender` straight to each recipient. The contract never holds
///      tokens and has no owner, admin or upgrade path, so an allowance granted to it can only ever
///      be spent by the wallet that granted it.
contract WagefoldPayroll {
    using SafeERC20 for IERC20;

    struct Payment {
        address token;
        address to;
        uint256 amount;
    }

    /// @notice Upper bound that keeps a run comfortably inside the block gas limit.
    uint256 public constant MAX_PAYMENTS = 500;

    /// @notice Block in which `payer` paid `runId`, or 0 if it hasn't. Each payer can pay a run once,
    ///         so a retried or replayed transaction can't pay the same payroll twice. Keyed by payer,
    ///         so nobody else can block a run by paying its id first.
    mapping(address payer => mapping(bytes32 runId => uint256 blockNumber)) public paidBlock;

    /// @param payer The treasury wallet that funded the run.
    /// @param runId Off-chain payroll run identifier, used to reconcile the run in the app.
    /// @param payments Number of transfers made.
    event PayrollPaid(address indexed payer, bytes32 indexed runId, uint256 payments);

    event PaymentSent(bytes32 indexed runId, address indexed token, address indexed to, uint256 amount);

    error NoPayments();
    error TooManyPayments(uint256 count, uint256 max);
    error ZeroRecipient(uint256 index);
    error ZeroAmount(uint256 index);
    error AlreadyPaid(bytes32 runId, uint256 blockNumber);

    /// @notice Sends every payment from the caller. Reverts as a whole if any single transfer fails,
    ///         so a run is either fully paid or not paid at all, and if the caller already paid this run.
    function pay(bytes32 runId, Payment[] calldata payments) external {
        uint256 count = payments.length;
        if (count == 0) revert NoPayments();
        if (count > MAX_PAYMENTS) revert TooManyPayments(count, MAX_PAYMENTS);
        uint256 paidIn = paidBlock[msg.sender][runId];
        if (paidIn != 0) revert AlreadyPaid(runId, paidIn);
        paidBlock[msg.sender][runId] = block.number;

        for (uint256 i; i < count; ++i) {
            Payment calldata p = payments[i];
            if (p.to == address(0)) revert ZeroRecipient(i);
            if (p.amount == 0) revert ZeroAmount(i);
            IERC20(p.token).safeTransferFrom(msg.sender, p.to, p.amount);
            emit PaymentSent(runId, p.token, p.to, p.amount);
        }

        emit PayrollPaid(msg.sender, runId, count);
    }
}
