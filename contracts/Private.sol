// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";



contract PrivateSale {
    uint256 public constant TOTAL_SALE_AMOUNT = 94_156_666_666 * 10 ** 18;
    uint256 public constant PRICE = HARD_CAP * 1e18 / TOTAL_SALE_AMOUNT;
    uint256 public constant SOFT_CAP = 5 ether;
    uint256 public constant HARD_CAP = 15 ether;
    bytes32 public merkleRoot; 

    /**
     * @notice The address of the deployer, which will receive the raised ETH.
     */
    address public immutable owner;

    /**
     * @notice The address of the recipient, which will receive the raised ETH.
     */
    address public immutable recipient = 0x8BE0699B10aaAD8BEE1cE3B746712ACd796C6039;


    /**
     * @notice Whether the soft cap has been reached.
     */
    bool public softCapReached;

    /**
     * @notice Whether the sale has ended.
     */
    bool public saleEnded;

    /**
     * @notice The total amount of tokens bought.
     */
    uint256 public totalTokensBought;

    /**
     * @notice The start date of the sale in unix timestamp.
     */
    uint256 public start;

    /**
     * @notice The end date of the sale in unix timestamp.
     */
    uint256 public end;

    

    /**
     * @notice The amount of tokens bought by each address.
     */
    mapping(address => uint256) public amountBought;

    /**
     * @notice Emits when tokens are bought.
     * @param buyer The address of the buyer.
     * @param amount The amount of tokens bought.
     */

    event TokensBought(address indexed buyer, uint256 amount);


    /**
     * @notice Emits when the root change.
     * @param newRoot The address of the buyer.
     */

    event MerkleRootChanged(bytes32 indexed newRoot);

    /**
     * @notice Emits when tokens are claimed.
     * @param claimer The address of the claimer.
     * @param amount The amount of tokens claimed.
     */
    event TokensClaimed(address indexed claimer, uint256 amount);

    /**
     * @notice Emits when ETH is refunded.
     * @param buyer The address of the buyer.
     * @param amount The amount of ETH refunded.
     */
    event EthRefunded(address indexed buyer, uint256 amount);

    /**
     * @notice Emits when the sale is ended.
     * @param totalAmountBought The total amount of tokens bought.
     * @param softCapReached Whether the soft cap has been reached and the sale is successful.
     */
    event SaleEnded(uint256 totalAmountBought, bool softCapReached);

    constructor( uint256 _start, uint256 _end, bytes32 _merkleRoot) {
        require(_merkleRoot != bytes32(0), "Merkle root cannot be empty");
        start = _start;
        end = _end;
        owner = msg.sender;
        merkleRoot = _merkleRoot;
    }

    
    /**
     * @notice Change the root by owner
     */


    function changeRoot(bytes32 _newRoot ) public{
        require(owner == msg.sender,"Only owner can change the root");
        require(_newRoot != bytes32(0), "Merkle root cannot be empty");
        merkleRoot = _newRoot;
        emit MerkleRootChanged(_newRoot);
    }

    /**
     * @notice Buys tokens with ETH.
     */
    function buy(bytes32[] calldata _proof) external payable {
        require(block.timestamp >= start, "Sale has not started yet");
        require(block.timestamp <= end, "Sale has ended");
        require(msg.value > 0, "Amount must be greater than 0");
        require(!saleEnded, "Sale has ended");

        bytes32 node = keccak256(abi.encodePacked(msg.sender));
        require(MerkleProof.verify(_proof, merkleRoot, node), "Invalid proof");

        // Compute the amount of tokens bought
        uint256 tokensBought = msg.value * 10 ** 18 / PRICE;

        require(totalTokensBought + tokensBought < TOTAL_SALE_AMOUNT, "Hard cap reached");

        // Update the storage variables
        amountBought[msg.sender] += tokensBought;
        totalTokensBought += tokensBought;

        emit TokensBought(msg.sender, tokensBought);
    }

    /**
     * @notice If the soft cap is reached, sens the TGE tokens to the user and creates a vesting schedule for the rest.
     * If the soft cap is not reached, sends the ETH back to the user.
     * @param _buyers The addresses of the buyers.
     */
    function airdrop(address[] calldata _buyers) external {
        require(saleEnded, "Sale has not ended yet");

        for (uint256 i = 0; i < _buyers.length; i++) {
            // Check if the buyer has bought tokens
            uint256 tokensBought = amountBought[_buyers[i]];
            if (tokensBought == 0) continue;

            // Reset the amount bought
            amountBought[_buyers[i]] = 0;

            // Check if the soft cap is reached
            if (!softCapReached) {
              // Compute the amount of ETH to refund and send it back to the buyer
                uint256 amountToRefund = tokensBought * PRICE / 10 ** 18;

                (bool sc,) = payable(_buyers[i]).call{value: amountToRefund}("");
                require(sc, "Transfer failed");

                emit EthRefunded(_buyers[i], amountToRefund);  
            }
        }
    }

    /**
     * @notice Ends the sale.
     */
    function endSale() external {
        require(block.timestamp > end, "Sale has not ended yet");
        require(!saleEnded, "Sale has already ended");

        // Mark the sale as ended
        saleEnded = true;

        // If the soft cap is reached, send the raised ETH and the unsold tokens to the recipient
        if (address(this).balance >= SOFT_CAP) {
            softCapReached = true;

            // Send the raised ETH to the recipient
            (bool sc,) = payable(recipient).call{value: address(this).balance}("");
            require(sc, "Transfer failed");
        } 

        emit SaleEnded(totalTokensBought, softCapReached);
    }
}
