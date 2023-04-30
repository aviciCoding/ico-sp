import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";

import { Token, VestingContract } from "../typechain-types";

chai.use(chaiAsPromised);

describe("Token functions", function () {
    let token: Token;
    let vesting: VestingContract;
    let deployer: SignerWithAddress;

    let teamWallet: SignerWithAddress;
    let marketingWallet: SignerWithAddress;
    let reserveWallet: SignerWithAddress;
    let developmentWallet: SignerWithAddress;
    let communityWallet: SignerWithAddress;

    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;

    let startTime: number;
    let endTime: number;

    const totalSupply = ethers.utils.parseEther("150000000");
    const tokenSaleExpenses = ethers.utils.parseEther("5000000");
    const teamSupply = ethers.utils.parseEther("15000000");
    const marketingSupply = ethers.utils.parseEther("30000000");
    const reserveSupply = ethers.utils.parseEther("30000000");
    const developmentSupply = ethers.utils.parseEther("30000000");
    const communitySupply = ethers.utils.parseEther("20000000");

    const totalSaleSupply = ethers.utils.parseEther("20000000");
    const saleBonusSupply = ethers.utils.parseEther("1000000");

    const increaseTime = async (seconds: number) => {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine", []);
    };

    before(async function () {
        [deployer, teamWallet, marketingWallet, reserveWallet, developmentWallet, communityWallet, alice, bob, carol] = await ethers.getSigners();
    });

    beforeEach(async function () {
        startTime = (await ethers.provider.getBlock("latest")).timestamp + 60;
        endTime = startTime + 60 * 60 * 24;

        const TokenFactory = await ethers.getContractFactory("Token");
        token = (await TokenFactory.deploy(startTime, endTime, [deployer.address, teamWallet.address, marketingWallet.address, reserveWallet.address, developmentWallet.address, communityWallet.address])) as Token;

        const VestingFactory = await ethers.getContractFactory("VestingContract");
        vesting = await ethers.getContractAt("VestingContract", await token.vestingContract());
    });

    describe("constructor", function () {
        it("should be correctly deployed", async function () {
            expect(await token.totalSupply()).to.equal(totalSupply);
            expect(await token.start()).to.equal(startTime);
            expect(await token.end()).to.equal(endTime);

            expect(await token.balanceOf(deployer.address)).to.equal(tokenSaleExpenses.mul(15).div(100));
            expect(await token.balanceOf(marketingWallet.address)).to.equal((marketingSupply.sub(saleBonusSupply)).mul(20).div(100));
            expect(await token.balanceOf(communityWallet.address)).to.equal(communitySupply.mul(25).div(100));
        });
    });

    describe("initializeVesting", function () {
        it("should not allow to initialize vesting twice", async function () {
            await token.initializeVesting();
            await expect(token.initializeVesting()).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("should correctly initialize vesting", async function () {
            await token.initializeVesting();

            const saleExpensesSchedule = await vesting.vestingSchedules(deployer.address, 0);
            expect(saleExpensesSchedule.amountTotal).to.equal(tokenSaleExpenses.mul(85).div(100));

            const teamSchedule = await vesting.vestingSchedules(teamWallet.address, 0);
            expect(teamSchedule.amountTotal).to.equal(teamSupply);

            const marketingSchedule = await vesting.vestingSchedules(marketingWallet.address, 0);
            expect(marketingSchedule.amountTotal).to.equal((marketingSupply.sub(saleBonusSupply)).mul(80).div(100));

            const reserveSchedule = await vesting.vestingSchedules(reserveWallet.address, 0);
            expect(reserveSchedule.amountTotal).to.equal(reserveSupply);

            const developmentSchedule = await vesting.vestingSchedules(developmentWallet.address, 0);
            expect(developmentSchedule.amountTotal).to.equal(developmentSupply);

            const communitySchedule = await vesting.vestingSchedules(communityWallet.address, 0);
            expect(communitySchedule.amountTotal).to.equal(communitySupply.mul(75).div(100));
        });
    });

    describe("buy", function () {
        it("should revert if the sale is not started", async function () {
            await expect(token.connect(alice).buy()).to.be.revertedWith("Sale has not started yet");
        });

        it("should revert if the sale is ended", async function () {
            await increaseTime(60 * 60 * 24 * 2);
            await expect(token.connect(alice).buy()).to.be.revertedWith("Sale has ended");
        });

        it("should revert if the value sent is below minimum buy", async function () {
            await increaseTime(60);
            await expect(token.connect(alice).buy()).to.be.revertedWith("Amount of ETH sent is too low");
        });

        it("should revert if the value sent is above maximum buy", async function () {
            await increaseTime(60);
            await expect(token.connect(alice).buy({ value: ethers.utils.parseEther("2.1") })).to.be.revertedWith("Amount of ETH sent is too high");
        });

        it("should correctly buy tokens", async function () {
            await increaseTime(60);
            expect(await token.connect(alice).buy({ value: ethers.utils.parseEther("1") })).to.emit(token, "EthContributed").withArgs(alice.address, ethers.utils.parseEther("1"));

            expect(await token.contributions(alice.address)).to.equal(ethers.utils.parseEther("1"));
            expect(await token.totalRaised()).to.equal(ethers.utils.parseEther("1"));
            expect(await token.eligibleForBonus(alice.address)).to.equal(ethers.utils.parseEther("1"));
            expect(await token.totalForBonus()).to.equal(ethers.utils.parseEther("1"));
        });
    });

    describe("endSale", function () {
        it("should revert if the sale is not ended", async function () {
            await expect(token.endSale()).to.be.revertedWith("Sale has not ended yet");
        });

        it("should revert if the sale is already ended", async function () {
            await increaseTime(60 * 60 * 24 * 2);
            await token.endSale();
            await expect(token.endSale()).to.be.revertedWith("Sale has already ended");
        });

        it("should correctly end the sale if softcap not reached", async function () {
            await increaseTime(60 * 60 * 24 * 2);
            expect(await token.endSale()).to.emit(token, "SaleEnded").withArgs(0, false);

            expect(await token.saleEnded()).to.equal(true);
            expect(await token.softCapReached()).to.equal(false);
        });

        it("should correctly end the sale if softcap exceeded", async function () {
            await increaseTime(60);
            for (let i = 0; i < 17; i++) {
                await token.connect(alice).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(bob).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(carol).buy({ value: ethers.utils.parseEther("2") });
            }
            await increaseTime(60 * 60 * 24 * 2);
            await expect(token.endSale()).to.changeEtherBalance(deployer, ethers.utils.parseEther("102"));

            expect(await token.saleEnded()).to.equal(true);
            expect(await token.softCapReached()).to.equal(true);
        });

        it("should correctly end the sale if hardcap exceeded", async function () {
            await increaseTime(60);
            for (let i = 0; i < 84; i++) {
                await token.connect(alice).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(bob).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(carol).buy({ value: ethers.utils.parseEther("2") });
            }
            await increaseTime(60 * 60 * 24 * 2);
            await expect(token.endSale()).to.emit(token, "SaleEnded").to.changeEtherBalance(deployer, ethers.utils.parseEther("500"));

            expect(await token.saleEnded()).to.equal(true);
            expect(await token.softCapReached()).to.equal(true);
        });
    });

    describe("airdrop", function () {
        it("should revert if the sale is not ended", async function () {
            await expect(token.airdrop([alice.address])).to.be.revertedWith("Sale has not ended yet");
        });

        it("should correctly airdrop tokens if softcap is not reached", async function () {
            await increaseTime(60);
            await token.connect(alice).buy({ value: ethers.utils.parseEther("2") });
            await token.connect(bob).buy({ value: ethers.utils.parseEther("2") });
            await token.connect(carol).buy({ value: ethers.utils.parseEther("2") });

            await increaseTime(60 * 60 * 24 * 2);
            await token.endSale();

            await expect(token.airdrop([alice.address, bob.address])).to.changeEtherBalances([alice, bob], [ethers.utils.parseEther("2"), ethers.utils.parseEther("2")]);
        });

        it("should correctly airdrop tokens if softcap is reached", async function () {
            await increaseTime(60);
            for (let i = 0; i < 17; i++) {
                await token.connect(alice).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(bob).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(carol).buy({ value: ethers.utils.parseEther("2") });
            }
            await increaseTime(60 * 60 * 24 * 2);
            await token.endSale();

            const expectedAirdrop = (totalSaleSupply.add(saleBonusSupply)).div(3);

            await expect(token.airdrop([alice.address, bob.address])).to.changeTokenBalances(token, [alice, bob], [expectedAirdrop.sub(1), expectedAirdrop.sub(1)]); // solidity rounding error
        });

        it("should correctly airdrop tokens if hardcap is exceeded", async function () {
            await increaseTime(60);
            for (let i = 0; i < 84; i++) {
                await token.connect(alice).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(bob).buy({ value: ethers.utils.parseEther("2") });
                await token.connect(carol).buy({ value: ethers.utils.parseEther("2") });
            }
            await increaseTime(60 * 60 * 24 * 2);
            await token.endSale();

            const expectedAirdrop = (totalSaleSupply.add(saleBonusSupply)).div(3);

            await expect(token.airdrop([alice.address, bob.address])).to.changeTokenBalances(token, [alice, bob], [expectedAirdrop.sub(1), expectedAirdrop.sub(1)]); // solidity rounding error
        });
    });
});
