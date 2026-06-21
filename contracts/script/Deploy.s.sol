// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StarchildBurnGoals} from "../src/StarchildBurnGoals.sol";

/// @notice Deploys StarchildBurnGoals on Base and seeds a few starter goals.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url https://mainnet.base.org \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast --verify
///
/// $STARCHILD on Base: 0x980e9f2061487376ab1438e965ad276a1d36fba3
contract Deploy is Script {
    // Amounts are in token wei (18 decimals). Tune targets to taste before deploy.
    function run() external {
        address token = vm.envOr("STARCHILD_TOKEN", address(0x980E9F2061487376ab1438E965Ad276a1D36Fba3));

        vm.startBroadcast();
        StarchildBurnGoals goals = new StarchildBurnGoals(token);

        // Starter goals — edit/replace these for your real roadmap.
        goals.addGoal("Spanish localization", "Full es-ES translation of the companion, shipped free to all", 5_000_000 ether);
        goals.addGoal("New mood animation", "A fresh creature mood video added to the open-source app", 3_000_000 ether);
        goals.addGoal("Linux AppImage", "One-click Linux build so the companion runs everywhere", 2_000_000 ether);

        vm.stopBroadcast();

        console2.log("StarchildBurnGoals deployed at:", address(goals));
        console2.log("Token:", token);
    }
}
