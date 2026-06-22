// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title StarchildStaking
/// @notice Stake $STARCHILD to earn governance weight for the Starchild commons.
///
/// Tokens are LOCKED, never burned — `unstake` returns them in full at any time.
/// Staking powers gasless, signature-based governance: your on-chain `stakedOf`
/// is the weight behind proposals and votes that live off-chain (the website
/// reads this contract to verify and weight each signed message).
///
/// `convictionOf` additionally tracks time-weighted conviction (stake × time),
/// rewarding long-term alignment — surfaced in the UI and available for future
/// weighting schemes.
///
/// This lives entirely in the commons layer: the Starchild app never touches it.
contract StarchildStaking {
    IERC20 public immutable token;

    struct Stake {
        uint256 amount;        // currently staked
        uint64 since;          // timestamp of last balance change
        uint256 convictionAcc; // conviction accrued up to `since`
    }

    mapping(address => Stake) private _stakes;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount, uint256 newTotal);
    event Unstaked(address indexed user, uint256 amount, uint256 newTotal);

    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address token_) {
        require(token_ != address(0), "token=0");
        token = IERC20(token_);
    }

    /// @notice Lock `amount` of $STARCHILD to gain governance weight.
    /// @dev Requires prior approve(thisContract, amount) on the token.
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        _accrue(msg.sender);
        _stakes[msg.sender].amount += amount;
        totalStaked += amount;
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Staked(msg.sender, amount, _stakes[msg.sender].amount);
    }

    /// @notice Withdraw `amount` of previously staked $STARCHILD. Never burned.
    function unstake(uint256 amount) external nonReentrant {
        Stake storage s = _stakes[msg.sender];
        require(amount > 0 && amount <= s.amount, "bad amount");
        _accrue(msg.sender);
        s.amount -= amount;
        totalStaked -= amount;
        require(token.transfer(msg.sender, amount), "transfer failed");
        emit Unstaked(msg.sender, amount, s.amount);
    }

    /// @dev Fold elapsed conviction into the accumulator and reset the clock.
    function _accrue(address user) internal {
        Stake storage s = _stakes[user];
        if (s.since != 0 && s.amount > 0) {
            s.convictionAcc += s.amount * (block.timestamp - s.since);
        }
        s.since = uint64(block.timestamp);
    }

    // ─── Views (read by the governance backend to weight signed messages) ─────

    function stakedOf(address user) external view returns (uint256) {
        return _stakes[user].amount;
    }

    /// @notice Time-weighted conviction: accrued + current stake × seconds since last change.
    function convictionOf(address user) external view returns (uint256) {
        Stake storage s = _stakes[user];
        uint256 live = (s.since != 0 && s.amount > 0) ? s.amount * (block.timestamp - s.since) : 0;
        return s.convictionAcc + live;
    }

    function stakeInfo(address user) external view returns (uint256 amount, uint64 since, uint256 conviction) {
        Stake storage s = _stakes[user];
        uint256 live = (s.since != 0 && s.amount > 0) ? s.amount * (block.timestamp - s.since) : 0;
        return (s.amount, s.since, s.convictionAcc + live);
    }
}
