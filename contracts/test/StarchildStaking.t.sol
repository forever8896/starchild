// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StarchildStaking} from "../src/StarchildStaking.sol";

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "bal"); balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "bal"); require(allowance[f][msg.sender] >= a, "allow");
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

contract StarchildStakingTest is Test {
    StarchildStaking st;
    MockERC20 tok;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        tok = new MockERC20();
        st = new StarchildStaking(address(tok));
        tok.mint(alice, 1_000_000 ether);
        tok.mint(bob, 1_000_000 ether);
    }

    function _stake(address who, uint256 amt) internal {
        vm.startPrank(who);
        tok.approve(address(st), amt);
        st.stake(amt);
        vm.stopPrank();
    }

    function test_StakeLocksTokensRecoverable() public {
        _stake(alice, 100 ether);
        assertEq(st.stakedOf(alice), 100 ether);
        assertEq(st.totalStaked(), 100 ether);
        assertEq(tok.balanceOf(address(st)), 100 ether);
        assertEq(tok.balanceOf(alice), 1_000_000 ether - 100 ether);

        vm.prank(alice);
        st.unstake(40 ether);
        assertEq(st.stakedOf(alice), 60 ether);
        assertEq(tok.balanceOf(alice), 1_000_000 ether - 60 ether); // got 40 back
        assertEq(st.totalStaked(), 60 ether);
    }

    function test_NothingBurned() public {
        _stake(alice, 100 ether);
        vm.prank(alice);
        st.unstake(100 ether);
        // full round-trip, nothing lost
        assertEq(tok.balanceOf(alice), 1_000_000 ether);
        assertEq(tok.balanceOf(address(st)), 0);
    }

    function test_ConvictionGrowsWithTime() public {
        _stake(alice, 1_000 ether);
        assertEq(st.convictionOf(alice), 0);
        vm.warp(block.timestamp + 100);
        assertEq(st.convictionOf(alice), 1_000 ether * 100);
        vm.warp(block.timestamp + 100);
        assertEq(st.convictionOf(alice), 1_000 ether * 200);
    }

    function test_ConvictionAccruesAcrossStakeChanges() public {
        _stake(alice, 1_000 ether);
        vm.warp(block.timestamp + 100);          // 1000*100 = 100k accrued
        _stake(alice, 1_000 ether);              // now 2000 staked
        vm.warp(block.timestamp + 100);          // +2000*100 = 200k
        assertEq(st.convictionOf(alice), 1_000 ether * 100 + 2_000 ether * 100);
    }

    function test_CannotUnstakeMoreThanStaked() public {
        _stake(alice, 50 ether);
        vm.prank(alice);
        vm.expectRevert("bad amount");
        st.unstake(51 ether);
    }

    function test_RejectsZero() public {
        vm.startPrank(alice);
        vm.expectRevert("amount=0");
        st.stake(0);
        vm.stopPrank();
    }

    function test_IndependentStakers() public {
        _stake(alice, 100 ether);
        _stake(bob, 300 ether);
        assertEq(st.stakedOf(alice), 100 ether);
        assertEq(st.stakedOf(bob), 300 ether);
        assertEq(st.totalStaked(), 400 ether);
    }
}
