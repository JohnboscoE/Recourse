// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RecourseEscrow} from "../src/RecourseEscrow.sol";

/// @notice Deploys RecourseEscrow bound to Base mainnet native USDC.
/// @dev Run from Git Bash / WSL:
///   forge script script/Deploy.s.sol \
///     --rpc-url base --broadcast --verify --private-key $DEPLOYER_KEY
contract Deploy is Script {
    // Base mainnet native USDC (6 decimals).
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external returns (RecourseEscrow escrow) {
        vm.startBroadcast();
        escrow = new RecourseEscrow(BASE_USDC);
        vm.stopBroadcast();
        console2.log("RecourseEscrow deployed at:", address(escrow));
        console2.log("Bound USDC:", BASE_USDC);
    }
}
