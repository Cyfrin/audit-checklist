# Jeffrey's Checklist

## Summary

**Author:**
[Jeffrey Scholz](https://www.linkedin.com/in/jeffreyscholz)

**Source:**
[The Ultimate 100+ Point Checklist Before Sending Your Smart Contract for Audit](https://betterprogramming.pub/the-ultimate-100-point-checklist-before-sending-your-smart-contract-for-audit-af9a5b5d95d0)

**Info**

## Checklist

The Basics
==========

100% line and branch coverage
-----------------------------

If there is a small bug in the frontend code, an animation may be slightly off. If there is a bug in a smart contract, the results could end the company. 100% coverage is annoying, but it's a price worth paying.

Mutation Test
-------------

A code is 100% covered doesn't mean the corner cases are tested. If you swap a `<`with a `≤`, this should cause your tests to break if they are genuinely testing your code. Mutation tests will automatically mutate your code and re-run your tests to inform you how effective your tests are.

Code formatted
--------------

Use prettier to maintain consistent code formatting. This makes it easier to read.

Static analysis with solhint, slither, and mythX
------------------------------------------------

These tools will automatically flag issues in this list. While they may have false positives and miss critical errors, it's a low-effort, high-payoff investment to include these tools in your development pipeline. Don't pay an auditor thousands to bring to your attention something one of these tools can catch automatically.

Access control makes sense (SWC-105, SWC-106)
---------------------------------------------

This relates to forgetting to put modifiers like `onlyOwner` on functions. This is what leads to the parity wallet freeze. Go through each function, and think about who is allowed to call it and who should be allowed to call it.

Inputs properly validated
-------------------------

What is a sensible minimum or maximum for the input integers? (Note that require `x >= 0` is a necessary check as discussed later.) Are arrays or bytes expected to have a certain length?

Overpowered admin
-----------------

The most common way I see this is with standalone pausable tokens. If the admin address is compromised, the tokens will stop transferring. Nothing is gained from this feature if the tokens are not part of an ecosystem. Admins need privileges, but ideally, the privileges should be ephemeral.

Admin activities should be logged
---------------------------------

This makes it easier to validate the admin isn't abusing privileges before interacting with the application.

Sensible deployment strategy in place
-------------------------------------

Many deployment tools require private keys to be loaded unencrypted onto the hard drive. If this must be done, steps must be taken to isolate the computer or to transfer ownership of the contract right after deployment. Flattening and deploying with a hardware wallet is a good strategy too.

Readability
===========

Fixed pragma (SWC-103)
----------------------

Don't do `pragma solidity ^0.8.7` when you set the compiler version yourself. This makes it ambiguous to verifiers which version of solidity was used. Only use this pattern for library code where you are not the one to compile it. Do `pragma solidity 0.8.7` instead.

No magic numbers
----------------

Don't have unexplained constants in code. It's better to have constant variables that describe the value, for example:

`public uint256 constant MAXIMUM_QUORUM_SIZE = 1_000;`

Proper use of readability keywords (hours, days, ether, 1_000_000, etc.)
------------------------------------------------------------------------

In solidity, `1 days` will automatically convert to 86400 seconds which is much more readable. Similarly, I prefer `1_000_000` over `1000000` for readability and use the ether keyword when dealing with powers of `10**18` in the context of Ethereum quantity. See more[ here](https://docs.soliditylang.org/en/v0.8.14/units-and-global-variables.html).

Missing require messages
------------------------

Require statements should have an explanation. Instead of `require(numTokens < MAX_TOKENS_TO_STAKE)` do `require(numTokens < MAX_TOKENS_TO_STAKE, "numTokens exceeds stake limit")`.

Left-to-right character (SWC-130)
---------------------------------

The unicode `U+202E` character should be absent as that changes the order in which text is rendered. This is frequently used for obfuscation purposes.

Undescriptive or misleading variable names, function names, or comments
-----------------------------------------------------------------------

Avoid names like `mapping3` or `data` as they are very ambiguous. Ensure that variable names are precise, accurate, and descriptive. Inaccurate or outdated comments should also be flagged.

Unused variables (SWC-131)
--------------------------

The tools above will catch this, but unused variables hinder readability.

Code with no effects (SWC-135)
------------------------------

The function below doesn't do anything even though it is valid solidity.

function setPoolAddress(address _address) external onlyOwner {\
    poolAddress == _address;\
}

Use inclusive language in naming
--------------------------------

I'm not advocating for being politically correct language police, but be aware that your code is stored forever and can be read by anyone in the world: exercise decency, politeness, and respect.

Security Essentials
===================

Tx.origin (SWC-115)
-------------------

`tx.origin`'s only real use case is to check if a smart contract is calling your code. Using it for verification can lead to phishing hacks.

encodePacked can result in a hash collision for variable length variables (SWC-133)
-----------------------------------------------------------------------------------

The two values will have the same hash. Use `abi.encode` instead of `abi.encodePacked` in this circumstance:

`keccack256(abi.encodePacked("HelloW", "orld");`

`keccack256(abi.encodePacked("Hello", "World");`

Calling multiple functions in a solidity function has undefined order
---------------------------------------------------------------------

Solidity doesn't specify which function gets called first in this situation:

`myFunction(Interface(0x5cb...).method1(), method2());`

`method1` may be called before `method2`, or `method2` before `method1` depending on the solidity version. This is highly problematic if they might cause a state change or reference the same location in memory.

Double check the code can tolerate the functions being called in either order.

Exact ether balances or assuming smart contract balance doesn't change (SWC-132)
--------------------------------------------------------------------------------

Anybody can change the balance of a smart contract by directly sending ether to it. Even if you override the receive and fallback functions by reverting it, if `msg.value` is not zero, another smart contract can `selfdestruct` and forcibly send ether to another address, bypassing those checks.

So if your logic expects a balance of an address to have a precise value or remains static, that assumption can be violated.

Insecure Delegate call (SWC 112)
--------------------------------

A delegate call gives the delegated address unlimited power. This should only be used with contracts you control, and it is critical to ensure the address to delegate to cannot be altered by an unauthorized user.

Upgrade doesn't use trusted tooling
-----------------------------------

There is a lot that can go wrong with smart contract upgrades, and it would not make sense to list them here. 99% of the time, you should use OpenZeppelin's upgraded plug-in tools for hardhat or truffle. But if you want a preview, this can help:

-   storage slots can clash
-   information stored via constructors or immutable variables won't be available in the next contract
-   initializers need to be protected
-   `selfdestruct `can prevent upgrades

Not checking the return value of contracts (SWC-104)
----------------------------------------------------

If a function returns a value, it should be captured in a variable and checked. The solidity compiler does not enforce this, so pay attention to functions that have no return values, for example

function parent() external {\
    doSomething(); // does this return something?\
}

Not checking for reverts from untrusted contracts (SWC-113)
-----------------------------------------------------------

This function can experience denial of service if it doesn't account for the possibility that an external function call can revert.

function dos() external {\
    IOtherContract(addr).makeCall(); // does this revert?\
    payable(addr).call{value: 1 ether}(); // this can revert too doMyStuff(); // this will never happen\
}

If you make a call to an external contract, that function may revert. If this is done intentionally, your contract will not be able to complete its transaction. The most common way this pops up is automatic refunds to various addresses. The addresses might be a smart contract that reverts upon receiving ether. This means everyone inside the loop is not able to get their refund.

Unprotected SSTORE and SLOAD (SWC-124)
--------------------------------------

It used to be the case that you could underflow an array length variable and access storage above the array, but this is no longer an issue in solidity 0.8.0. However, this hack can still occur if the Yul codes `sstore` or `sload` are used, and the storage they access is not restricted.

Unprotected control flow (SWC-127)
----------------------------------

Although the jump statement is not part of the yul specification, you should be aware that it is still possible to have arbitrary jumps with the verbatim keyword or by editing the jump target. If an attacker can manipulate where the control flow will jump to, they can completely control the smart contract.

Explicit variable and function visibility (SWC-100)
---------------------------------------------------

This function is public and can be called by anyone.

function claimReward(uint256 rewardId) {\
    // ...\
}

It should be explicitly labeled as public (or set to internal or private if that is not the intent.

Some solidity compiler versions have security bugs (SWC-102)
------------------------------------------------------------

Before using a certain version of the solidity compiler, check soliditylang.org to see if it has known bugs. It is constructive to read through the release announcements here:[ https://blog.soliditylang.org/category/releases/](https://blog.soliditylang.org/category/releases/) to see what kind of bugs come up and what gets fixed. (And learn about subtle features in the language).

SWC-122
-------

This is a difficult-to-understand vulnerability, but it was caught by a Consensys audit of 0x. It boils down to the fact that you shouldn't blindly trust your own contracts if untrusted users can change their state. Depending on the contract logic, someone may be able to manipulate the "trusted" smart contracts. This is especially true for contracts that forward arbitrary function calls like relayers. Essentially, be aware of privilege escalation when users use a contract with special privileges.

Ensure information sources cannot be manipulated
------------------------------------------------

The most common manifestation of this vulnerability is flash loan attacks. If your contract checks the price of an asset in a pool, someone can use a flash loan to manipulate that asset price and cause unexpected behavior in your contract. Enumerate how the contract depends on outside information and ask how those sources of information can be tampered with.

Time-Based Security Issues
==========================

Too granular use of timestamps
------------------------------

The block time is between 12 and 20 seconds (before the merge). The application should not measure time intervals smaller than that. If your application needs to measure time on that scale, you need a different solution than a smart contract on Ethereum.

Using block numbers for timestamps (SWC-116)
--------------------------------------------

Block time varies with difficulty and will change substantially after the merge. Timestamps are far more accurate measures of time (over several minutes, not seconds). Block numbers should be used for commit-reveal schemes, not for measuring time.

Re-entrancy
===========

Re-entrancy (SWC-107)
---------------------

We can't do justice to the topic of re-entrancy here. It's arguably behind billions of dollars in stolen money, yet it is still a common mistake. Watch out for function calls or ether transfers to contracts you didn't create. Also, be aware that `safeMint` and `safeTransfer`, while not external calls, activate functionality on the receiving contracts, which can cause re-entrancy.

Don't trust innocuous-looking functions like transfer in ERC20. A malicious token can change deviate from the ERC 20 spec.

Signature-Related Vulnerabilities
=================================

Recovery to zero address
------------------------

See documentation [here](https://docs.openzeppelin.com/contracts/2.x/api/cryptography#ECDSA).

The check

bytes32(data).toEthSignedMessageHash().recover(signature) == verifyingAccount;

can "succeed" if `verfyingAccount` hasn't been set yet. Make sure that `verifyingAccount` is set before this line of code can be executed (such as in the constructor or initializer)

Verifier doesn't hash message, malleable signature attack (SWC-117)
-------------------------------------------------------------------

`bytes32(data).recover(signature) == verifyingAccount`

is vulnerable because an attacker can create combinations of data and signatures that result in `verifyingAccount`. If the data is hashed before signature recovery, then the attacker won't be able to pull off this attack. See [here](https://docs.openzeppelin.com/contracts/2.x/api/cryptography#ECDSA)

Missing protection against replay attacks (SWC-121)
---------------------------------------------------

This function is vulnerable because an attacker can send the transaction again.

function transferToVulnerable(address _from, address _to, uint256 _amount, bytes calldata signature) external { require(abi.encodePacked(_from, _to, _amount).toEthSignedMessageHash().recover(signature) == _from);}

This is fixed. Here's the code:

function transferToFixed(address _from, address _to, uint256 _amount, uint256 _nonce, bytes calldata signature) external { require(usedNonces[_nonce] == false, "nonce used"); usedNonces[_nonce] = true; require(abi.encodePacked(_from, _to, _amount, _nonce).toEthSignedMessageHash().recover(signature) == _from);}

Arithmetic Bugs
===============

Multiply before divide
----------------------

This will result is zero, not 30, in Solidity:
----------------------------------------------

`10 / 100 * 300`

Off-by-one errors
-----------------

This is a very common error in programming in general. It frequently happens with the writer confuses about whether comparison or strict comparison should be used (e.g. `<` or `≤`). See more on the Wikipedia [page](https://en.wikipedia.org/wiki/Off-by-one_error):

Off-Contract Vulnerabilities
============================

Not using commit-reveal
-----------------------

All transactions are visible while they are pending in the mempool. In a commit reveal scheme, someone commits a hash of their action (a vote or a bid), and when all votes are bids are in, everyone reveals the pre-image of the hash. This prevents people from acting on information that is assumed to be secret.

Using blockchain data for randomness (SWC-120)
----------------------------------------------

All data on the blockchain can be manipulated by miners to a certain extent (for example, by changing the timestamp by a few seconds), so if the miners want to manipulate the outcome of a lottery, they can. Even if commit-reveal is used, the miner can still influence it if they are a participant that can commit values. Here are the solutions:

-   If a miner is participating in a lottery, use chainlink
-   If the prize is less than the block rewards, the miner doesn't have an incentive to manipulate it
-   If you know the miners cannot participate or won't be bribed, then it isn't an issue.

Allowing users to store arbitrary strings can result in XSS
-----------------------------------------------------------

If your website displays strings stored on a smart contract, and the smart contract allows users to set arbitrary strings (such as giving NFTs nicknames), then they can inject malicious javascript into the website via a <script> tag.

Regulations may require the ability to sanction addresses
---------------------------------------------------------

If you look into the USDC implementation, you will see that it allows an administrator to prevent certain addresses from sending tokens. This may be required by your application if law enforcement decides criminals are using it. If your application is totally decentralized, you may be able to get away without it, but don't consider this legal advice.

Miner Extracted Value, MEV (SWC-114)
------------------------------------

Miner extracted value is a big topic that we can't cover here. Depending on the tokenomics of your system, miners can re-order transactions in a way that is advantageous to them. Ideally, the system should be designed such that the profit from doing this is minimized.

Unencrypted private data (SWC-136)
----------------------------------

Nothing on the blockchain is private, including private variables.

Good Design
===========

Use idempotence over toggling
-----------------------------

Although you can save contract size by toggling variables with one function, this leads to an ambiguous situation if the blockchain is congested and transactions may or may not be getting dropped. It's better to have a separate turn-on and turn-off function for smart contract states.

Excessively strict validation (SWC-123)
---------------------------------------

You can read a real-life story about losing 34 million dollars because of unnecessary `require` statements [here](https://decrypt.co/98530/aku-ethereum-nft-launch-ends-with-34m-locked-in-flawed-smart-contract). The flip side of not properly validating inputs is that having too many require statements that inadvertently lock up the contract.

Don't block smart contracts without a good reason
-------------------------------------------------

You can make it hard for a contract to call your contract's functions with `extcodesize` or impossible by requiring `msg.sender == tx.origin`. However, this blocks multi-signature wallets, so don't do it unless there is a very good reason.

Don't use deprecated solidity functions (SWC-111)
-------------------------------------------------

A good editor will warn you if you use a deprecated solidity function. Examples include `throw`, `suicide`, `msg.gas`, `block.blockhash`, and so forth.

Prefer EIP-712
--------------

If your dapp asks the user for a signature, it is helpful for them to know what they are signing rather than displaying a cryptic hexadecimal string. See this blog [post](https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26) for more details.

Check token balance before self-destructing
-------------------------------------------

If a contract intends to hold tokens like ERC20, NFTs, etc., and it can `selfdestruct`, then it should make sure those tokens are removed first, or they will be removed from circulation without being burned to lead to a misleading count of the total supply.

Nested mappings need an explicit getter function
------------------------------------------------

Solidity automatically creates getter functions for public variables, which is the case for nested mappings, but current javascript libraries don't interface with them very well. It is recommended to make them private and add a public getter function.

Use of Assert (SWC-110)
-----------------------

Assert is for testing purposes or ending the transaction if the contract ends in an illegal state. It should not be used to validate inputs as it consumes all of the gas without refund.

Solidity Surprises
==================

Nested arrays behave strangely
------------------------------

Nested arrays are read in the opposite direction from how they are declared.

Structs always exist
--------------------

Solidity does not have null, so this code will return the zero address; it will not fail.

contract ExampleContract {\
    struct Foo {\
        address owner;\
        uint256 amount;\
    } mapping(uint256 => Foo) mapz; function get() public view returns(address) {\
        return mapz[1].owner;\
    }}

Don't shadow state variables (SWC-119)
--------------------------------------

Giving the same name to a variable declared inside a function and at the storage level is confusing. At the very least, prepend the function variable with an underscore.

Avoid functions and variables with the same name when using multiple inheritances (SWC-125)
-------------------------------------------------------------------------------------------

Solidity uses C3 inheritance resolve when parent classes have matching names which is confusing. It's best to avoid matching names entirely if possible.

Accidentally overriding the fallback function
---------------------------------------------

If you create a function with a function selector of all zeros, you may be unable to send ether directly to the contract depending on what that function does. Sending a normal transaction in Ethereum will cause a smart contract to interpret it as calling a function selector with all zeros.

Fatal gas errors
================

*For a complete explanation of solidity and gas, check out my *[*Udemy course*](https://www.udemy.com/course/advanced-solidity-understanding-and-optimizing-gas-costs/?referralCode=C4684D6872713525E349)*.*

Deleting arbitrarily long arrays
--------------------------------

Before the London Hardfork, deleting arrays resulted in a refund. Now it has a net cost, so if the array is long enough, the gas cost could be very high, possibly more than what fits in the gas limit of a single block. You are not deleting the array but every single item inside of it one by one.

Unbounded loops
---------------

Looping over an array that users can push an arbitrary amount of entries to can result in a function that can no longer be executed when the gas requirement is bigger than the block limit.

Unbounded memory allocation
---------------------------

Solidity memory costs grow quadratically past a certain point, so very long arrays in memory can hit the gas block limit.

State changes in a loop
-----------------------

Even if the loop is bounded, loops can cause expensive operations to become prohibitively expensive. Be careful if the contract transfers ether, creates other smart contracts, sets storage variables, or other expensive operations inside of a loop.

Untrusted contracts could have indeterminate gas costs
------------------------------------------------------

Your contract should be able to handle calls to contracts that are designed to exhaust the gas resources. For example, a malicious ERC20 token could have the transfer function set to consume a very high amount of gas. This is related to a contract reverting as a form of denial of service.

Hardcoded gas (SWC-134)
-----------------------

Gas costs can change as Ethereum upgrades through hard forks. Hardcoding gas costs in function calls can lead to breaking forward compatibility.

Don't use .transfer or .send unless the recipient is certain to be an EOA (SWC-134)
-----------------------------------------------------------------------------------

See more here:[ https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/](https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/)

Gas Griefing SWC-126
--------------------

A griefing attack doesn't benefit the attacker financially, but because they have some other motive for causing people grief, they commence the attack anyway. The specific attack mentioned in SWC-126 is the case of a transaction forwarder that limits the amount of gas for the transactions it is relaying, causing them to revert. The griefer here still loses money on the transaction fees for the reverted transactions, but the person sending the transactions is griefed because their transactions are censored.

A more general example of griefing is reverting when a contract distributes money to addresses, so none of the addresses (including the griefer) can receive the money.

Unlimited or large growth of data structures (SWC-128)
------------------------------------------------------

It's best to avoid creating large data structures in the first place. If an array (or queue or stack) can grow with no limit, it can cause headaches down the line.

Meaningful Gas Improvements
===========================

Set the optimizer as high as possible
-------------------------------------

Most tooling presets the optimizer to be 200, but gas can continue to be improved in most applications by increasing it. Uniswap sets the optimizer to 1 million, and I think that is a better default. Only lower the optimizer if the contract is too large to deploy.

Prefer logging over storage if the value isn't needed onchain
-------------------------------------------------------------

Logs only cost a couple to a few thousand gases, but setting a new storage variable can cost over 20,000 gas. If the information isn't needed on the chain, use logs.

Avoid non-orthogonal state
--------------------------

Non-orthogonal state means storing information that can be derived from existing sources. For example, if you store the principal and interest of a loan, it is redundant to also store the total amount owed.

This doesn't mean non-orthogonal state should always be avoided. It may be easier to cache the sum of an array of integers than to recalculate it if that information is needed on the chain. Use good judgment.

Pack related variables
----------------------

If two variables are affected in the same transaction, placing them in the same slot will improve gas. For example, if you check if a public sale is open, then increment the number of tokens minted; the transaction will be cheaper if they live in the same slot.

Place booleans or uint96 or smaller under addresses for packing purposes
------------------------------------------------------------------------

We discuss later that using integers smaller than 256 costs more gas, but if your application requires smaller numbers anyway, put them next to each other.

Unnecessary re-entrancy protection
----------------------------------

Using OpenZeppelin's non-reentrant modifier on functions that don't transfer ether or make external calls is a waste of gas.

Use clones over multiple deploys
--------------------------------

If your contract deploys many copies of the same contract, use the clone pattern ([eips.ethereum.org/EIPS/eip-1167](https://eips.ethereum.org/EIPS/eip-1167)) instead of deploying the same bytecode over and over.

Prefer multi-call
-----------------

If your users need to make a sequence of transactions, giving them a mechanism to do it with multi-call can save a lot of gas.

Read and write storage once
---------------------------

Don't read from the same storage variable twice in one transaction. Cache it in a local variable. An example of this is getting the length of an array in storage (as discussed later). The exception is if you are doing bookkeeping while dealing with untrusted contracts.

Moderate Gas Improvements
=========================

cache array.length
------------------

When looping over an array, don't check the array length every iteration because that is a storage read which costs extra gas. Here's the code:

// less efficientfor (uint256 x = 0; x < array.length; i++) {\
    // do stuff\
}// efficientarrayLength = array.length;\
for (uint256 x = 0; x < arrayLength; ) {\
    // do stuff\
    unchecked {\
        ++i;\
    }\
}

Cheap require statements should go before expensive ones
--------------------------------------------------------

Storage reads cost more, so check the function arguments (which is cheap) before checking the storage variables (which is expensive). If the user supplies bad arguments, they won't pay for the storage read. Reverts only cost gas up until the revert, not what the transaction would have hypothetically cost.

Don't use safemath on solidity 0.8.0 or later
---------------------------------------------

Solidity 0.8.0 has overflow protection built in. That is, it reverts if the sum of two numbers is smaller than one of the terms and has a similar check for other kinds of math. Using the SafeMath library just wastes more gas.

Prefer calldata over memory
---------------------------

The memory keyword in a function argument causes the underlying code to copy the argument into memory. Calldata causes the code to read the transaction without copying it directly.

Compare strings with a hash rather than character by character
--------------------------------------------------------------

This trick may depend on how long the strings are, but it's worth benchmarking both approaches in your application.

Use custom errors if the error is parameterizable
-------------------------------------------------

It is somewhat debatable if custom errors are better than required statements. But they are a clear winner if the error message is parameterizable.

Prefer bytes32 over bytes if possible
-------------------------------------

If you are storing strings that are short, bytes32 will be a more efficient way to store them.

Unnecessary getter functions on public variables
------------------------------------------------

Except for nested mappings, getter functions on public variables is redundant. Solidity creates a getter function for public variables, and your IDE will generate an ABI showing that function.

Short circuit booleans to avoid expensive checks
------------------------------------------------

It's cheaper to avoid boolean expressions in require statements and have separate `require` statements, as discussed later. But if you need a boolean expression, use [short-circuiting](https://en.wikipedia.org/wiki/Short-circuit_evaluation) to save gas.

Unnecessary safeMint or safeTransfer
------------------------------------

If you know for sure you will be minting or transferring to an EOA instead of a smart contract. Then these functions are going to be a waste of gas because they check if the address is a smart contract before interacting with them.

If you aren't sure, then yes, use them, but do it safely because they can be re-entrant as noted earlier.

Variables set once should be immutable unless contract is upgradeable
---------------------------------------------------------------------

Immutable variables are stored in the bytecode instead of storage, which is far cheaper from a gas perspective.

Incrementing should be unchecked
--------------------------------

If a variable is incremented from 0, 1, 2,... and once per transaction, then it can't get incremented to 2²⁵⁶-1 before the universe dies of heat death. Making this unchecked will save gas.

Minor Gas Improvements
======================

Uint256 is more efficient than boolean and small uints
------------------------------------------------------

A boolean is a uint256 with 255 of the bits masked out. The extra masking costs gas. Only reduce the size if this will save gas by packing the variables. There is rarely a good reason to use less than uint256 for non-storage variables.

Bitshift rather than divide or multiply by two unless overflow is a possibility
-------------------------------------------------------------------------------

Bit shifting costs three gas, but multiplication and division cost five gas.

Use bitmaps if the contract has a lot of boolean variables
----------------------------------------------------------

A boolean under the hood is actually the same as a uint8. This means a `uint256` can hold up to 32 boolean variables. If you have more than 32 boolean variables, it may be better to store them as single bits inside of a uint256.

Optimize function names for gas-sensitive functions
---------------------------------------------------

Functions with leading zeros save gas in two ways. The first is that they are sorted to the top of the bytecode resulting in fewer checks to see if that function is called. Second, leading zeros save gas as part of the transaction data. This can lead to goofy function names, so only do this where the savings matter.

Pack function arguments for gas-sensitive functions
---------------------------------------------------

Representing two 128 bits numbers as a single 256 number and splitting them into two numbers contract side can save gas. This generalizes to smaller numbers. Because this makes the function less readable, it is only recommended for gas-sensitive functions.

require(x >= 0, "...") for uints should be avoided
------------------------------------------------

Unsigned integers cannot be negative, so this check just wastes gas.

Split require statements rather than using boolean operators
------------------------------------------------------------

`require(a && b, "message");` is less efficient than `require(a, "message a"); require(b, "message b");`

comparing boolean literals
--------------------------

`if(condition)` is the same as `if(condition == true)` when`condition` is a boolean variable, but the former is more gas efficient.

Prefer x = x + y over x += y
----------------------------

Although these operations are mathematically identical, the compiler doesn't treat them the same way.

Prefer ++x over x++
-------------------

If a variable is incremented in isolation, then prefix incrementing is preferred, again because of compiler quirks.

Use unchecked { ++x } when using a loop
---------------------------------------

If a loop uses uint256 (which it should), then it will not overflow. So it can be incremented with `unchecked`. Removing the overflow checks discussed earlier will save gas.

Don't initialize storage variables to default values
----------------------------------------------------

Initializing storage variables to zero, false, the zero address, and so on just waste gas. They are zero by default. Solidity doesn't have null.

Swap variables in a single line
-------------------------------

If you need to swap variables, you can do it gas efficiently without an explicit temporary variable like this:

`(x, y) = (y, x);`

Use > or < instead of ≤ or ≥ if possible
----------------------------------------

Under the hood, solidity represents `≥` as `not <`. The extra not operation costs three gas.

Use encodePacked over encode for fixed-length arguments
-------------------------------------------------------

Encode costs more gas because it pads the inputs. This is a useless extra cost for fixed-length inputs.

Admin functions can be payable
------------------------------

Payable functions save gas because non-payable functions explicitly check if `msg.value` is non-zero and then revert if so. The extra check costs gas. For functions the general public uses, it may still be desirable to make them non-payable to guard against unexpected state transitions. But when an admin can make dangerous changes to a contract, adding ether as part of the transaction is a minor threat.

Declare the return variable in the function signature
-----------------------------------------------------

You can save a little bit of gas by doing this:

function plusOne(uint256 x) external returns (uint256 y) {\
    y = x + 1;\
}

Outdated SWC
============

SWC-101
-------

As of solidity 0.8.0, integers do not overflow or underflow unless the `unchecked` keyword is used.

SWC-109
-------

Solidity 0.4.0 allowed you to declare variables of indeterminate size without specifying if they would be in memory or storage. This is no longer the case as of 0.5.0.

SWC-118
-------

It used to be the case that the constructor function was determined by it having the same name as the contract, but this led to issues if the function name was misspelled. As of solidity 0.4.22, a constructor must be referred to by the function name constructor.

SWC-129
-------

The statement `x =+ 1` used to be valid, but later versions of solidity make this syntax invalid. In the past, this could be misread as an increment.