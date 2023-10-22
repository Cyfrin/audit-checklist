# Beirao's Checklist

## Summary

**Author:**
[@0xBeirao](https://twitter.com/0xBeirao)

**Source:**
[Automated brain process for smart contract auditing](https://www.beirao.xyz/blog/automatedBrainProcess).

**Info**
The list is more likely to be used as a reminder of the most common vulnerabilities and questions to ask yourself during an audit. It is not a complete list of all possible vulnerabilities.

> My aim with this article is to equip you with a comprehensive checklist of questions that auditors should be asking themselves during their smart contract audits. Each lines is voluntary short and can be used as a reminder. ~ Beirao

## Checklist

**external\*\*** / \***\*public\*\*** functions\*\*

- Are the inputs checked ?
- Is there any front run opportunities ?

- Merkle trees are front-runnable
- Be aware of sandwich attack on Vaults and DEXes
- Tx must not be order dependent

- Is this function making a **call()** or transfering ERC20 tokens ?

- Is the call address white listed ?
- Reentrance ?

- Is that function payable or transfering funds ?

- Check if **msg.value == amount**

- Is the code comments coherent with the implementation ?
- Can edge case inputs (0, max) result of an unexpected behaviour ?
- Requirement check for external call parameters can be to strong and not allowing all good possible inputs

**Maths**

- Is the calculation even correct ?
- Are the fees correctly calculated ?
- Is there precision lost ? (especially for year/month/day calculation)
- Regular expression like **1 day** is a **uint24** meaning that operation with these expression will be cast on **uint24** and potentially overflow
- Always \* before /
- Is a library use to round results ?
- Div by 0 ?
- Even in **>0.8.0** take care that a variable can not find themselves in under or overflow that will cause revert
- Assign a negative value to an uint reverts
- **unchecked{}** need to be check
- When < or > check if it should not be ≤ or ≥

**Mapping**

- Having twice the same address can be an issue ?
- When deleting a structure you should delete mapping inside first

**When for/while loop**

- Is the first iteration a problem ?
- Gas

- Is the **++i** unchecked ?
- Is the stop condition using a cached variable ?

- DOS

- Is there a call inside the loop ?
- Is the number of iteration limited ? ⇒ can an attacker add elements at no cost ?

**Control access**

- Centralization risk

- Executors can perform token transfers on behalf of user ?
- Reclaiming / withdrawing any tokens ?
- Total upgradeability ?
- Instant parameters change (no timelock) ?
- Can pause freely ?
- Can rug user and steal assets ?

- Can corrupted owner destroy the protocol ?
- Is a features lacking access controls ?
- Some addresses need a whitelist ?
- Is the owner change a two step process ?
- Are critical functions accesible ? (like **mint()**)

**Vault**

- Can transferring ERC20 or ETH directly break something ?
- Are the vault balance tracked internally ?
- Can the 1st deposit raise a problem ?
- How the vault behave when locked fund are put in a strategy
- Is this vault taking into consideration that some ERC20 token are not 18 decimals ?
- Is the fee calculation correct ?
- What if only 1 wei remain in the pool ?
- On vault with strategies implemented : flash deposit-harvest-withdraw attacks are possible [reaperVaultV2](https://github.com/code-423n4/2023-02-ethos/blob/73687f32b934c9d697b97745356cdf8a1f264955/Ethos-Vault/contracts/ReaperVaultV2.sol#L155) handle that scenario.

**ERC20**

- Using Safe functions ?
- Is the USDT approve race condition a problem ? (especially on DEXes)
- Is the decimals difference between ERC20 a problem ?
- The contract implement a white/blacklist ? or some kind of addresses check ?

- Multiple-address token can be a problem

- Are fees on transfer raising an issue ?
- When their is a **balanceOf(address(this))** check if manually sending tokens can break something ?
- ERC777 tokens can hook bad things on transfert
- Solmate **ERC20.sageTransferLib** do not check the contract existence
- Some token can revert when 0 Token transfert and cause DOS
- **IERC20(address(0)).decimals()** will revert and cause DOS
- Flash mint increase the token supply
- More edge cases here : [weird-erc20](https://github.com/d-xo/weird-erc20)

**ERC721**

- **SafeMint()** from the ERC721 OpenZepplin contract as a callback that can reenter

**External call**

- Is the address called whitelisted ?
- Mistrust when there is a fixed gas amount in a **.call()** and check if the gas left is enough
- Grief attack is possible when calling a unknown address by passing huge amount of data into the call ⇒ use inline assembly.
- A call to an address that do not exist return true : is the existence of the address checked ?
- Use the check, effect, interaction pattern. Only If necessary use a reentrancyGuard but be aware of cross contract reentrancy
- For sending ETH don't use **transfer()** or **send()** and instead use **call()**
- msg.value not checked can have result in unexpected behaviour
- Delegate calls that do not interact with stateless type of contract (library) should be triple check and never delegate call to an untrusted contract

**Proxies**

- Is the modifier **initializer** added on constructor function
- No constructors
- if any contract inheritance has a constructor (erc20, reentrancyGuard, Pausable...) is used : use the upgreadable version for **initialize**
- Check that **authorizeUpgrade()** is properly secured if UUPS
- Can the new implementation cause storage collision with the old one ?

- If children inherit from parents ⇒ set a gap

- Was **disableInitializers()** called ?

**Locktime for staking**

- Check if a user can help other users to reduce the time lock by stacking their by stacking the tokens for them
- Check if a contract can wrap the collateral token to sell 100% liquid already stacked tokens

**Chainlink**

- When chainlink VRF is call, make sure that all parameters passed are verified else fullfillRandomWord will not revert and return a bad value
- Chainlink vrf get in pending if there is not enough LINK in the subscription. Meaning that when the subscription operates again the tx can be frontrun
- **[VRF Security Considerations](https://docs.chain.link/vrf/v2/security)**

**Uniswap :**

- Hard coded slippage is forbidden
- [Proper slippage strategy should be implemented](https://defihacklabs.substack.com/p/solidity-security-lesson-6-defi-slippage?utm_source=profile&utm_medium=reader2)

- No Expiration Deadline ?
- Incorrect Slippage Calculation ?
- Mismatched Slippage Precision ?

**AAVE/Compound**

- What happen if the utilisation rate is to high and collateral can't be retrieved ?
- What happen if the protocol is paused ?
- What happen if the pool become deprecated ?

**General tips**

- For logic implemented several times, see if there are any differences and then standardize the logic.
- Be aware of Dos

- Never **call()**into for loop ⇒ pull payments
- Sensible withdraw logic should be done externally by the user
- Be aware of Block Stuffing attack when the contract need to do an action within a certain time period.
- Maybe if there is a timelock a attacker can brick the logic at no cost

- Be aware of Oracle manipulation
- Take care **if (receiver == caller)** can have unexpected behaviour
- Check if the Pause mechanism can brick the contract
- When seftdestruct be aware of**CREATE2**reinitialize trick ([here](https://x9453.github.io/2020/01/04/Balsn-CTF-2019-Creativity/))
- Signature [Malleability](https://twitter.com/0xOwenThurm/status/1619151598877577216?ref_src=twsrc%5Etfw%7Ctwcamp%5Etweetembed%7Ctwterm%5E1619151598877577216%7Ctwgr%5E4e340d96baf399dc298c2f60a38a08f6ad9c8a44%7Ctwcon%5Es1_&ref_url=https%3A%2F%2Fcdn.iframe.ly%2FuMd8XiD%3Fapp%3D1) : do not use **escrevover()** but use the **openzepplin/ECDSA.sol** (The last version should be used [here](https://github.com/OpenZeppelin/openzeppelin-contracts/security/advisories/GHSA-4h98-2769-gh6h))
- [Semantic Overload](https://forum.openzeppelin.com/t/watch-out-for-semantic-overloading/1088) need to be avoided or checked intensively
- Check the doc and the code searching for inconsistencies
- If available deployment script should but checked
- It's possible to bypass contract size check by implementing the logic in the constructor.
- Hash collisions are possible with abi.encodePacked ([here](https://medium.com/swlh/new-smart-contract-weakness-hash-collisions-with-multiple-variable-length-arguments-dc7b9c84e493))
- Check if there is problematic bug in the version used at this ([here](https://github.com/ethereum/solidity/blob/develop/Changelog.md))
- NoReentrance modifier should be placed before every other modifiers
- **try/catch** block can always fail by not suppling enough gas ([here](https://forum.openzeppelin.com/t/a-brief-analysis-of-the-new-try-catch-functionality-in-solidity-0-6/2564))
- Reorg can create a loss of fund (use create2 instead of create) ([here](https://code4rena.com/reports/2023-04-frankencoin#note-the-following-have-some-caveats-we-can-reduce-the-deployment-size-and-deployment-cost-at-the-expense-of-execution-cost))
- Be aware of cross contract reentrancy ([here](https://medium.com/valixconsulting/solidity-smart-contract-security-by-example-05-cross-contract-reentrancy-30f29e2a01b9))
