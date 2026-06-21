// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StarchildBurnGoals, IERC20} from "../src/StarchildBurnGoals.sol";

/// @dev Minimal mock ERC20 with approve/transferFrom for testing.
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract StarchildBurnGoalsTest is Test {
    StarchildBurnGoals goals;
    MockERC20 token;
    address dead = 0x000000000000000000000000000000000000dEaD;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        token = new MockERC20();
        goals = new StarchildBurnGoals(address(token), address(this));
        token.mint(alice, 1_000_000 ether);
        token.mint(bob, 1_000_000 ether);
    }

    function _addGoal() internal returns (uint256) {
        return goals.addGoal("Spanish localization", "Full es-ES translation ships free to all", 100 ether);
    }

    function test_AddGoalOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("not owner");
        goals.addGoal("x", "y", 1 ether);
    }

    function test_ContributeBurnsToDeadAndTallies() public {
        uint256 id = _addGoal();

        vm.startPrank(alice);
        token.approve(address(goals), 40 ether);
        goals.contribute(id, 40 ether);
        vm.stopPrank();

        // tokens actually left alice and landed at the dead address
        assertEq(token.balanceOf(dead), 40 ether);
        assertEq(token.balanceOf(alice), 1_000_000 ether - 40 ether);
        // contract holds nothing — it never custodies
        assertEq(token.balanceOf(address(goals)), 0);

        (, , uint256 target, uint256 raised, , bool funded, ) = goals.getGoal(id);
        assertEq(target, 100 ether);
        assertEq(raised, 40 ether);
        assertFalse(funded);
        assertEq(goals.contributed(id, alice), 40 ether);
        assertEq(goals.totalBurned(), 40 ether);
    }

    function test_GoalFundedEventOnCrossing() public {
        uint256 id = _addGoal();
        vm.startPrank(alice);
        token.approve(address(goals), 100 ether);
        goals.contribute(id, 60 ether);
        vm.expectEmit(true, false, false, true);
        emit StarchildBurnGoals.GoalFunded(id, 100 ether);
        goals.contribute(id, 40 ether);
        vm.stopPrank();

        (, , , uint256 raised, , bool funded, ) = goals.getGoal(id);
        assertEq(raised, 100 ether);
        assertTrue(funded);
    }

    function test_MultipleContributorsLeaderboard() public {
        uint256 id = _addGoal();
        vm.startPrank(alice);
        token.approve(address(goals), 30 ether);
        goals.contribute(id, 30 ether);
        vm.stopPrank();
        vm.startPrank(bob);
        token.approve(address(goals), 70 ether);
        goals.contribute(id, 70 ether);
        vm.stopPrank();

        assertEq(goals.contributed(id, alice), 30 ether);
        assertEq(goals.contributed(id, bob), 70 ether);
        assertEq(token.balanceOf(dead), 100 ether);
    }

    function test_CannotContributeToShippedGoal() public {
        uint256 id = _addGoal();
        goals.markShipped(id);
        vm.startPrank(alice);
        token.approve(address(goals), 10 ether);
        vm.expectRevert("shipped");
        goals.contribute(id, 10 ether);
        vm.stopPrank();
    }

    function test_RejectsBadInputs() public {
        vm.expectRevert("target=0");
        goals.addGoal("x", "y", 0);

        uint256 id = _addGoal();
        vm.startPrank(alice);
        token.approve(address(goals), 10 ether);
        vm.expectRevert("amount=0");
        goals.contribute(id, 0);
        vm.expectRevert("no goal");
        goals.contribute(99, 1 ether);
        vm.stopPrank();
    }
}
