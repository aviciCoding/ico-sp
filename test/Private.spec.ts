import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
// import { ethers } from "ethers";



import {  PrivateSale } from "../typechain-types";
import { ethers } from 'hardhat';
import { getRoot } from "../utils/getRoot";
import { getProof } from './../utils/getProof';

chai.use(chaiAsPromised);



describe("PrivateSale", () => {
    let privateSale: PrivateSale;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dan: SignerWithAddress;
    let eve: SignerWithAddress;
    let mark: SignerWithAddress;

    let startTime: number;
    let endTime: number;
    let markleRoot: string;
    let whitelistArray: string[]
    let aliceProof:any
    let bobProof:any
    let carolProof:any
    let danProof:any
    let eveProof:any
    let markProof:any
    

    const privateSaleSupply = ethers.utils.parseEther("1800000");
    const recipient = "0x8BE0699B10aaAD8BEE1cE3B746712ACd796C6039"
    

    const increaseTime = async (seconds: number) => {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine", []);
    }

    before(async () => {
        [deployer, alice, bob, carol, dan, eve, mark] = await ethers.getSigners();
        whitelistArray = [deployer.address, alice.address, bob.address, carol.address, dan.address, eve.address, mark.address]
        markleRoot = getRoot(whitelistArray)
        aliceProof = getProof(alice.address, whitelistArray)
        bobProof = getProof(bob.address, whitelistArray)
        carolProof = getProof(carol.address, whitelistArray)
        danProof = getProof(dan.address, whitelistArray)
        eveProof = getProof(eve.address, whitelistArray)
        markProof = getProof(mark.address,whitelistArray)
    });
    
    beforeEach(async () => {
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 60;
        endTime = startTime + 86400;
        const privateSaleFactory = await ethers.getContractFactory("PrivateSale");
        privateSale = (await privateSaleFactory.deploy( startTime, endTime, markleRoot )) as PrivateSale;

        
    });

    describe("constructor", () => {
        it("should correctly initialize the contract", async () => {
            expect(await privateSale.start()).to.equal(startTime);
            expect(await privateSale.end()).to.equal(endTime);
            expect(await privateSale.owner()).to.equal(deployer.address);
        });
    });

    describe("testMrekleRoot", () => {
        it("owner change merkle root", async () => {
            const newWhitelistArray = [deployer.address, alice.address, bob.address, carol.address]
            const newMarkleRoot = getRoot(newWhitelistArray)
            await expect(privateSale.connect(deployer).changeRoot(newMarkleRoot)).to.emit(privateSale, "MerkleRootChanged").withArgs(newMarkleRoot);
        });


        it("shoud revert if the proof is not valid", async () => {

            await increaseTime(60);
            await expect(privateSale.connect(alice).buy(markProof, { value: ethers.utils.parseEther("0.2") })).to.be.revertedWith("Invalid proof");
        }); 
    })

    describe("buyTokens", () => {
        it("should revert if not started", async function () {
            await expect(privateSale.connect(alice).buy(aliceProof)).to.be.revertedWith("Sale has not started yet");
        });

        it("should revert if ended", async function () {
            await increaseTime(60 * 60 * 24 + 61);
            await expect(privateSale.connect(alice).buy(aliceProof)).to.be.revertedWith("Sale has ended");
        });

        it("should revert if amount is 0", async function () {
            await increaseTime(60);
            
            await expect(privateSale.connect(alice).buy(aliceProof,{ value: 0 })).to.be.revertedWith("Amount must be greater than 0");
        });

      

   

        it("should correctly buy tokens", async function () {
            await increaseTime(60);
            const expectedToeknsBought = ethers.utils.parseEther("0.2").mul(ethers.utils.parseEther("1")).div(await privateSale.PRICE())
            
            await expect(privateSale.connect(alice).buy(aliceProof,{ value: ethers.utils.parseEther("0.2") })).to.emit(privateSale, "TokensBought").withArgs(alice.address, expectedToeknsBought)
            expect(await privateSale.totalTokensBought()).to.equal(expectedToeknsBought)
            expect(await privateSale.amountBought(alice.address)).to.equal(expectedToeknsBought);
            
        });
    });

    describe("airdrop", function () {
    
        it("should revert if the sale has not ended", async function () {
            await increaseTime(60);
            await privateSale.connect(alice).buy(aliceProof,{ value: ethers.utils.parseEther("0.2") });
            await expect(privateSale.connect(alice).airdrop([])).to.be.revertedWith("Sale has not ended yet");
        });

        it("should correctly claim ETH", async function () {
            await increaseTime(60);
            await privateSale.connect(alice).buy(aliceProof,{ value: ethers.utils.parseEther("0.2") });
            await increaseTime(60 * 60 * 24 + 1);
            await privateSale.endSale();
            await expect(privateSale.connect(alice).airdrop([alice.address])).to.changeEtherBalance(alice, ethers.utils.parseEther("0.2").sub(1));
        });

      

      
    });

    describe("endSale", function () {
      

        it("should revert if the sale has not ended", async function () {
            await expect(privateSale.endSale()).to.be.revertedWith("Sale has not ended yet");
        });

        it("should revert if the sale has already ended", async function () {
            await increaseTime(60);
            await privateSale.connect(alice).buy(aliceProof,{ value: ethers.utils.parseEther("0.2") });
            await increaseTime(60 * 60 * 24 + 1);
            await privateSale.endSale();
            await expect(privateSale.endSale()).to.be.revertedWith("Sale has already ended");
        });

        it("should correctly end the sale if softcap is not reached", async function () {
            await increaseTime(60);
            await privateSale.connect(alice).buy(aliceProof,{ value: ethers.utils.parseEther("2") });
            await increaseTime(60 * 60 * 24 + 1);
            await expect(privateSale.endSale()).to.emit(privateSale, "SaleEnded");
            expect(await privateSale.saleEnded()).to.be.true;

            expect(await privateSale.softCapReached()).to.be.false;

        });

        it("should correctly send ETH and Token to the recipient", async function () {
            await increaseTime(60);
            await privateSale.connect(alice).buy(aliceProof, { value: ethers.utils.parseEther("2") });
            await privateSale.connect(bob).buy(bobProof,{ value: ethers.utils.parseEther("2") });
            await privateSale.connect(carol).buy(carolProof,{ value: ethers.utils.parseEther("2") });
            await privateSale.connect(dan).buy(danProof,{ value: ethers.utils.parseEther("3") });
            await privateSale.connect(eve).buy(eveProof,{ value: ethers.utils.parseEther("5") });
            await increaseTime(60 * 60 * 24 + 1);

            await expect(privateSale.endSale()).to.emit(privateSale, "SaleEnded").to.changeEtherBalance(recipient, ethers.utils.parseEther("14"));
            expect(await privateSale.saleEnded()).to.be.true;
        });
    });

    
});