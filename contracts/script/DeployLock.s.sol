// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StarchildLock} from "../src/StarchildLock.sol";

/// @notice Deploys StarchildLock on Base. Holders lock $STARCHILD → claim a
/// funded, capped, expiring Venice inference key (docs/inference-access-spec.md).
/// Ownerless; the only way tokens leave is the locker withdrawing their own after
/// their unlock time. Report the deployed address to Blockaid proactively.
///
/// Usage:
///   cd contracts && forge script script/DeployLock.s.sol \
///     --rpc-url https://mainnet.base.org \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
///
/// Then set NEXT_PUBLIC_STARCHILD_LOCK to the printed address in the token Vercel env.
/// $STARCHILD on Base: 0x980e9f2061487376ab1438e965ad276a1d36fba3
contract DeployLock is Script {
    function run() external {
        address token = vm.envOr("STARCHILD_TOKEN", address(0x980E9F2061487376ab1438E965Ad276a1D36Fba3));

        vm.startBroadcast();
        StarchildLock lock = new StarchildLock(token);
        vm.stopBroadcast();

        console2.log("StarchildLock deployed at:", address(lock));
        console2.log("Token:", token);
        console2.log("-> Set NEXT_PUBLIC_STARCHILD_LOCK to the address above (token Vercel env).");
    }
}
