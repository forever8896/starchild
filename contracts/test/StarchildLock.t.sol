// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StarchildLock} from "../src/StarchildLock.sol";

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

contract StarchildLockTest is Test {
    StarchildLock lk;
    MockERC20 tok;
    address alice = address(0xA11CE);

    function setUp() public {
        tok = new MockERC20();
        lk = new StarchildLock(address(tok));
        tok.mint(alice, 1_000_000 ether);
    }

    function _lock(address who, uint256 amt, uint64 dur) internal {
        vm.startPrank(who);
        tok.approve(address(lk), amt);
        lk.lock(amt, dur);
        vm.stopPrank();
    }

    function test_lock_records_amount_and_unlock() public {
        _lock(alice, 100 ether, 30 days);
        assertEq(lk.lockedOf(alice), 100 ether);
        assertEq(lk.totalLocked(), 100 ether);
        (uint256 amt, uint64 unlockAt) = lk.lockInfo(alice);
        assertEq(amt, 100 ether);
        assertEq(unlockAt, uint64(block.timestamp) + 30 days);
        assertEq(tok.balanceOf(address(lk)), 100 ether);
    }

    function test_cannot_withdraw_before_unlock() public {
        _lock(alice, 100 ether, 30 days);
        vm.prank(alice);
        vm.expectRevert("still locked");
        lk.withdraw();
    }

    function test_withdraw_after_unlock_returns_full() public {
        _lock(alice, 100 ether, 30 days);
        vm.warp(block.timestamp + 30 days);
        vm.prank(alice);
        lk.withdraw();
        assertEq(lk.lockedOf(alice), 0);
        assertEq(lk.totalLocked(), 0);
        assertEq(tok.balanceOf(alice), 1_000_000 ether); // got it all back, never burned
    }

    function test_topup_adds_amount_and_extends() public {
        _lock(alice, 100 ether, 10 days);
        (, uint64 u1) = lk.lockInfo(alice);
        vm.warp(block.timestamp + 1 days);
        _lock(alice, 50 ether, 30 days); // top up + longer
        assertEq(lk.lockedOf(alice), 150 ether);
        (, uint64 u2) = lk.lockInfo(alice);
        assertGt(u2, u1); // extended
    }

    function test_topup_never_shortens() public {
        _lock(alice, 100 ether, 60 days);
        (, uint64 u1) = lk.lockInfo(alice);
        _lock(alice, 10 ether, 1 days); // shorter duration must not shorten
        (, uint64 u2) = lk.lockInfo(alice);
        assertEq(u2, u1);
    }

    function test_zero_reverts() public {
        vm.startPrank(alice);
        tok.approve(address(lk), 100 ether);
        vm.expectRevert("amount=0");
        lk.lock(0, 30 days);
        vm.expectRevert("duration=0");
        lk.lock(100 ether, 0);
        vm.stopPrank();
    }

    function test_withdraw_nothing_reverts() public {
        vm.prank(alice);
        vm.expectRevert("nothing locked");
        lk.withdraw();
    }
}
