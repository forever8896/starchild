// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title StarchildLock
/// @notice Lock $STARCHILD for a duration to unlock funded, private Starchild
/// inference (an *external access option* — the app stays free for anyone with
/// their own Venice key).
///
/// Tokens are LOCKED, never burned — `withdraw` returns them in full once the
/// lock expires. A locked balance still counts as governance weight (the website
/// reads `lockedOf` and sums it with your wallet balance), so **locking never
/// costs you your vote**.
///
/// Ownerless by design: no owner, no admin, no pause, no upgrade. The only way
/// tokens leave is the locker withdrawing their own, after their own unlock time.
/// This lives entirely in the commons layer; the Starchild app never touches it.
contract StarchildLock {
    IERC20 public immutable token;

    struct Lock {
        uint256 amount;   // currently locked
        uint64 unlockAt;  // timestamp it becomes withdrawable
    }

    mapping(address => Lock) private _locks;
    uint256 public totalLocked;

    event Locked(address indexed user, uint256 amount, uint256 newTotal, uint64 unlockAt);
    event Withdrawn(address indexed user, uint256 amount);

    uint256 private _g = 1;
    modifier nonReentrant() {
        require(_g == 1, "reentrant");
        _g = 2;
        _;
        _g = 1;
    }

    constructor(address token_) {
        require(token_ != address(0), "token=0");
        token = IERC20(token_);
    }

    /// @notice Lock `amount` for at least `duration` seconds. Tops up the amount
    /// and extends the unlock time (never shortens it). Requires prior
    /// approve(thisContract, amount) on the token.
    function lock(uint256 amount, uint64 duration) external nonReentrant {
        require(amount > 0, "amount=0");
        require(duration > 0, "duration=0");
        Lock storage l = _locks[msg.sender];
        l.amount += amount;
        uint64 newUnlock = uint64(block.timestamp) + duration;
        if (newUnlock > l.unlockAt) l.unlockAt = newUnlock;
        totalLocked += amount;
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Locked(msg.sender, amount, l.amount, l.unlockAt);
    }

    /// @notice Withdraw your full locked balance once the lock has expired. Never burned.
    function withdraw() external nonReentrant {
        Lock storage l = _locks[msg.sender];
        uint256 amt = l.amount;
        require(amt > 0, "nothing locked");
        require(block.timestamp >= l.unlockAt, "still locked");
        l.amount = 0;
        l.unlockAt = 0;
        totalLocked -= amt;
        require(token.transfer(msg.sender, amt), "transfer failed");
        emit Withdrawn(msg.sender, amt);
    }

    /// @notice Amount currently locked by `user`. Counts as governance weight.
    function lockedOf(address user) external view returns (uint256) {
        return _locks[user].amount;
    }

    /// @notice (amount, unlockAt) for `user`. The backend mints an inference key
    /// scaled by `amount` and expiring at `unlockAt`.
    function lockInfo(address user) external view returns (uint256 amount, uint64 unlockAt) {
        Lock storage l = _locks[user];
        return (l.amount, l.unlockAt);
    }
}
