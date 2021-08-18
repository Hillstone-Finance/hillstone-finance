import { ethers, network } from "hardhat";
import { Contract, Signer, BigNumber, constants, ContractFactory } from "ethers";
import { expect } from "chai";

const duration = {
    seconds: function (val) { return BigNumber.from(val); },
    minutes: function (val) { return BigNumber.from(val).mul(this.seconds('60')); },
    hours: function (val) { return BigNumber.from(val).mul(this.minutes('60')); },
    days: function (val) { return BigNumber.from(val).mul(this.hours('24')); },
    weeks: function (val) { return BigNumber.from(val).mul(this.days('7')); },
    years: function (val) { return BigNumber.from(val).mul(this.days('365')); },
};
  
async function latestTime() {
    const block = await ethers.provider.getBlock('latest');
    return BigNumber.from(block.timestamp);
}
  
async function increaseTime(duration: BigNumber) {
    await ethers.provider.send("evm_increaseTime", [duration.toNumber()]);
    await ethers.provider.send("evm_mine", []);
}

const VESTING_AMOUNT = BigNumber.from(5000000).mul(BigNumber.from(10).pow(18));

describe("TokenVesting", function() {
    let HSFFactory;
    let HSF;
    let TokenVestingFactory;
    let TokenVesting;

    let recipient;
    let governance;
    let anomaly;

    beforeEach(async function () {
        HSFFactory = await ethers.getContractFactory("HillstoneFinance");
        TokenVestingFactory = await ethers.getContractFactory("TokenVesting");

        [governance, recipient, anomaly] = await ethers.getSigners();

        HSF = await HSFFactory.connect(governance).deploy();
		await HSF.deployed();
    });

    describe("#constructor()", function() {
        it("Should fail if vesting begins too early", async function() {
            const vestingStart = (await latestTime()).sub(1000);
            const vestingCliff = (await latestTime()).add(1000);
            const vestingEnd = (await latestTime()).add(2000);
            await expect(TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd)).to.be.revertedWith("TokenVesting::constructor: vesting begin too early");
        });
        it("Should fail if cliff is too early", async function() {
            const vestingStart = (await latestTime()).add(1000);
            const vestingCliff = (await latestTime()).add(300);
            const vestingEnd = (await latestTime()).add(2000);
            await expect(TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd)).to.be.revertedWith("TokenVesting::constructor: cliff is too early");
        });
        it("Should fail if vesting ends too early", async function() {
            const vestingStart = (await latestTime()).add(1000);
            const vestingCliff = (await latestTime()).add(1000);
            const vestingEnd = (await latestTime()).add(800);
            await expect(TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd)).to.be.revertedWith("TokenVesting::constructor: end is too early");
        });
        it("Should construct TokenVesting properly", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(20));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
        });
    });
    describe("#setRecipient()", function() {
        it("Should fail if called by non-receipent entity", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(20));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
            await expect(TokenVesting.connect(anomaly).setRecipient(anomaly.address)).to.be.revertedWith("TokenVesting::setRecipient: unauthorized");
        });
        it("Should set recipient properly", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(20));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
            await TokenVesting.connect(recipient).setRecipient(governance.address);
            expect(await TokenVesting.recipient()).to.be.equal(governance.address);
        });
    });
    describe("#claim()", function() {
        it("Should fail if claimed too early", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(20));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
            await expect(TokenVesting.connect(recipient).claim()).to.be.revertedWith("TokenVesting::claim: not time yet");
        });
        it("Should fail if there is no sufficient HSF token", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(20));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
            await increaseTime(duration.days(3));
            await expect(TokenVesting.connect(recipient).claim()).to.be.revertedWith("");
        });
        it("Should claim HSF token properly", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(21));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
            HSF.connect(governance).transfer(TokenVesting.address, VESTING_AMOUNT);
            await increaseTime(duration.days(3));
            await TokenVesting.connect(recipient).claim();
            expect(await HSF.balanceOf(recipient.address)).to.be.equal(BigNumber.from("500008680555555555555555"));
            await increaseTime(duration.days(1));
            await TokenVesting.connect(recipient).claim();
            expect(await HSF.balanceOf(recipient.address)).to.be.equal(BigNumber.from("750011574074074074074073"));
        });
        it("Should claim HSF token properly when vesting period ends", async function() {
            const vestingStart = (await latestTime()).add(duration.days(1));
            const vestingCliff = (await latestTime()).add(duration.days(1));
            const vestingEnd = (await latestTime()).add(duration.days(21));
            TokenVesting = await TokenVestingFactory.connect(governance).deploy(HSF.address, recipient.address, VESTING_AMOUNT, vestingStart, vestingCliff, vestingEnd);
            HSF.connect(governance).transfer(TokenVesting.address, VESTING_AMOUNT);
            await increaseTime(duration.days(23));
            await TokenVesting.connect(recipient).claim();
            expect(await HSF.balanceOf(recipient.address)).to.be.equal(BigNumber.from(5000000).mul(BigNumber.from(10).pow(18)));
        });
    });
});
