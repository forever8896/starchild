// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 surface this contract relies on.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title StarchildBurnGoals
/// @notice Crowd-patronage of the Starchild commons via *burning* $STARCHILD.
///
/// Supporters burn $STARCHILD toward public funding goals. When a goal's target
/// is reached, the maintainer ships that work free and open-source to everyone.
///
/// Trustless by construction: `contribute` moves tokens straight to the dead
/// address (`0x…dEaD`). This contract NEVER custodies contributed tokens — the
/// maintainer cannot withdraw, redirect, or rug them. It only tallies per-goal
/// totals and per-contributor amounts, and emits events the website reads.
///
/// The token is fixed at deploy. The only privileged actions are adding goals
/// and marking them shipped — neither can touch funds.
contract StarchildBurnGoals {
    /// @dev Canonical burn sink. Tokens sent here are irretrievable.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice The $STARCHILD token being burned.
    IERC20 public immutable token;

    /// @notice The maintainer (solo dev) who curates goals.
    address public owner;

    struct Goal {
        string title;       // short name, e.g. "Spanish localization"
        string detail;      // one-line description of what ships when funded
        uint256 target;     // amount of $STARCHILD (wei) to fully fund
        uint256 raised;     // amount burned toward this goal so far
        bool shipped;       // maintainer flips this once the work is delivered
        uint64 createdAt;   // block timestamp when the goal was opened
    }

    Goal[] private _goals;

    /// @notice goalId => contributor => amount burned (for the leaderboard).
    mapping(uint256 => mapping(address => uint256)) public contributed;

    /// @notice Total $STARCHILD burned across all goals, ever.
    uint256 public totalBurned;

    // ─── Events ──────────────────────────────────────────────────────────────
    event GoalAdded(uint256 indexed goalId, string title, uint256 target);
    event Contributed(uint256 indexed goalId, address indexed contributor, uint256 amount, uint256 goalRaised);
    event GoalFunded(uint256 indexed goalId, uint256 raised);
    event GoalShipped(uint256 indexed goalId);
    event OwnerTransferred(address indexed from, address indexed to);

    // ─── Reentrancy guard ────────────────────────────────────────────────────
    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// @param token_ the $STARCHILD token to burn
    /// @param owner_ the maintainer wallet (explicit, so ownership is independent
    ///        of the deployer — e.g. when deployed via a CREATE2 factory).
    constructor(address token_, address owner_) {
        require(token_ != address(0), "token=0");
        require(owner_ != address(0), "owner=0");
        token = IERC20(token_);
        owner = owner_;
        emit OwnerTransferred(address(0), owner_);
    }

    // ─── Maintainer actions (never touch funds) ──────────────────────────────

    /// @notice Open a new funding goal.
    function addGoal(string calldata title, string calldata detail, uint256 target) external onlyOwner returns (uint256 goalId) {
        require(target > 0, "target=0");
        goalId = _goals.length;
        _goals.push(Goal({title: title, detail: detail, target: target, raised: 0, shipped: false, createdAt: uint64(block.timestamp)}));
        emit GoalAdded(goalId, title, target);
    }

    /// @notice Mark a goal's work as delivered (shipped free to everyone).
    function markShipped(uint256 goalId) external onlyOwner {
        require(goalId < _goals.length, "no goal");
        _goals[goalId].shipped = true;
        emit GoalShipped(goalId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Supporter action ────────────────────────────────────────────────────

    /// @notice Burn `amount` of $STARCHILD toward `goalId`.
    /// @dev Requires the caller to have approved this contract for `amount` first.
    ///      Tokens go directly to BURN_ADDRESS; this contract never holds them.
    function contribute(uint256 goalId, uint256 amount) external nonReentrant {
        require(goalId < _goals.length, "no goal");
        require(amount > 0, "amount=0");
        Goal storage g = _goals[goalId];
        require(!g.shipped, "shipped");

        // Effects
        bool crossed = g.raised < g.target && g.raised + amount >= g.target;
        g.raised += amount;
        contributed[goalId][msg.sender] += amount;
        totalBurned += amount;

        // Interaction: pull straight to the burn sink (contract never custodies)
        require(token.transferFrom(msg.sender, BURN_ADDRESS, amount), "transferFrom failed");

        emit Contributed(goalId, msg.sender, amount, g.raised);
        if (crossed) emit GoalFunded(goalId, g.raised);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function goalCount() external view returns (uint256) {
        return _goals.length;
    }

    function getGoal(uint256 goalId)
        external
        view
        returns (string memory title, string memory detail, uint256 target, uint256 raised, bool shipped, bool funded, uint64 createdAt)
    {
        require(goalId < _goals.length, "no goal");
        Goal storage g = _goals[goalId];
        return (g.title, g.detail, g.target, g.raised, g.shipped, g.raised >= g.target, g.createdAt);
    }

    /// @notice Lightweight snapshot of all goals for the website.
    function allGoals() external view returns (Goal[] memory) {
        return _goals;
    }
}
