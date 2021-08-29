import { ethers, network } from "hardhat";
import { Contract, Signer, BigNumber, constants, ContractFactory } from "ethers";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";

use(solidity);

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

const FUND_MAX = BigNumber.from("100000000000");
const FUND_MIN = BigNumber.from("70000000000");

describe("InvestorV1", function() {
    let HSFFactory;
    let TetherFactory;
    let FactoryFactory;
    let PoolFactory;

    let USDT;
    let HSF;
    let SOMETOKEN;
    let InvestorV1Factory;
    let pool;

    let usdtInvestor;
    let hsfInvestor;
    let hybridInvestor;
    let owner;
    let operator;
    let anomaly;

    let pastTime;
    let startTime;
    let stageTime;
    let endTime;

    beforeEach(async function () {
        HSFFactory = await ethers.getContractFactory("HillstoneFinance");
        TetherFactory = await ethers.getContractFactory("TetherToken");
        FactoryFactory = await ethers.getContractFactory("InvestorV1Factory");
        PoolFactory = await ethers.getContractFactory("InvestorV1Pool");

        [owner, operator, usdtInvestor, hsfInvestor, hybridInvestor, anomaly] = await ethers.getSigners();

        HSF = await HSFFactory.connect(owner).deploy();
        USDT = await TetherFactory.connect(owner).deploy(BigNumber.from("30000000000000000"), "Tether USD", "USDT", 6);
        SOMETOKEN = await TetherFactory.connect(owner).deploy(BigNumber.from("30000000000000000"), "Some Token", "SMT", 6);
        InvestorV1Factory = await FactoryFactory.connect(owner).deploy();

		await HSF.deployed();
        await USDT.deployed();
        await InvestorV1Factory.deployed();
    });
    describe("InvestorV1Factory", function() {
        describe("#createPool()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.days(1));
                startTime = (await latestTime()).add(await duration.days(1));
                stageTime = (await latestTime()).add(await duration.days(5));
                endTime = (await latestTime()).add(await duration.days(20));
            });
            
            it("Should fail if msg.sender is not owner", async function() {
                await expect(InvestorV1Factory.connect(anomaly)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, stageTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: not owner");
            });
            it("Should fail if operator is zero address", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(constants.AddressZero, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, stageTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: operator is zero address");
            });
            it("Should fail if maxCapacity is zero", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", 0, FUND_MIN, 2, startTime, stageTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: maxCapacity is zero");
            });
            it("Should fail if startTime is before now", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, pastTime, stageTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: startTime before now");
            });
            it("Should fail if endTime is before startTime", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, endTime, stageTime, startTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: startTime after endTime");
            });
            it("Should fail if stageTime is before startTime", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, stageTime, startTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: startTime after stageTime");
            });
            it("Should fail if endTime is before stageTime", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, endTime, stageTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: stageTime after endTime");
            });
            it("Should fail if fee is over 10000", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, stageTime, endTime, 150000, 1000))
                    .to.be.revertedWith("InvestorV1Factory: fee over 10000");
            });
            it("Should fail if oraclePrice is zero", async function() {
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 0, startTime, stageTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: zero oraclePrice");
            });
            it("Should fail if pool exists", async function() {
                await InvestorV1Factory.connect(owner).
                    createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, stageTime, endTime, 150, 1000);
                await expect(InvestorV1Factory.connect(owner)
                    .createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, stageTime, endTime, 150, 1000))
                    .to.be.revertedWith("InvestorV1Factory: pool exists");
            });

            describe("Vaild Actions", function() {
                beforeEach(async function () {
                    pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 2, startTime, stageTime, endTime, 150, 1000);
                    const poolList = await InvestorV1Factory.poolList;
                    pool = new ethers.Contract(await poolList(0), PoolFactory.interface, owner);
                });
                it("Should deploy pool properly", async function() {
                    expect(await pool.factory()).to.be.equal(InvestorV1Factory.address);
                    expect(await pool.operator()).to.be.equal(operator.address);
                    expect(await pool.maxCapacity()).to.be.equal(FUND_MAX);
                    expect(await pool.minCapacity()).to.be.equal(FUND_MIN);
                    expect(await pool.name()).to.be.equal("Hillstone Fund I");
                    expect(await pool.oraclePrice()).to.be.equal(2);
                    expect(await pool.startTime()).to.be.equal(startTime);
                    expect(await pool.stageTime()).to.be.equal(stageTime);
                    expect(await pool.endTime()).to.be.equal(endTime);
                    expect(await pool.fee()).to.be.equal(150);
                    expect(await pool.interestRate()).to.be.equal(1000);
                });
                it("Should update poolList properly", async function() {
                    expect(await InvestorV1Factory.poolList(0)).to.be.equal(pool.address);
                });
                it("Should update getPool properly", async function() {
                    expect(await InvestorV1Factory.getPool(operator.address, "Hillstone Fund I", startTime)).to.be.equal(pool.address);
                });
            });
        });
        
        describe("#setOwner()", function() {
            it("Should fail if msg.sender is not owner", async function() {
                await expect(InvestorV1Factory.connect(anomaly)
                    .setOwner(operator.address))
                    .to.be.revertedWith("InvestorV1Factory: not owner");
            });
            it("Should update owner", async function() {
                await InvestorV1Factory.connect(owner).setOwner(operator.address);
                expect(await InvestorV1Factory.owner()).to.be.equal(operator.address);
            });
        });
    });
    describe("InvestorV1Pool", function() {
        beforeEach(async function () {
            pastTime = (await latestTime()).sub(await duration.hours(1));
            startTime = (await latestTime()).add(await duration.hours(1));
            stageTime = (await latestTime()).add(await duration.hours(5));
            endTime = (await latestTime()).add(await duration.hours(20));

            pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
            const poolList = await InvestorV1Factory.poolList;
            pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
            await pool.connect(operator).setUSDT(USDT.address);
            await pool.connect(operator).setHSF(HSF.address);
        });
        describe("#openPool()", function() {
            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(anomaly).openPool()).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should fail if operator approves proper amount of HSF", async function() {
                await expect(pool.connect(operator).openPool()).to.be.reverted;
            });
            it("Should fail if poolState is reverted", async function() {
                await pool.connect(operator).revertPool();
                await expect(pool.connect(operator).openPool()).to.be.revertedWith("InvestorV1Pool: not create state");
            });
            it("Should update poolState", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                expect(await pool.getPoolState()).to.be.equal("Opened");
            });
            it("Should transfer HSF", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                expect(await HSF.balanceOf(pool.address)).to.be.equal(BigNumber.from("33333333334").mul(BigNumber.from(10).pow(12)));
            });
        });
        describe("#deposit()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });
            it("Should fail if pool not opened", async function() {
                await expect(pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)))).to.be.revertedWith("InvestorV1Pool: pool not opened");
            });
            it("Should fail if deposit before startTime", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("1000000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await expect(pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)))).to.be.revertedWith("InvestorV1Pool: not started yet");
            });
            it("Should fail if deposit more than capacity", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("1000000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("50000").mul(BigNumber.from(10).pow(6)))
                await expect(pool.connect(usdtInvestor).deposit(BigNumber.from("50001").mul(BigNumber.from(10).pow(6)))).to.be.revertedWith("InvestorV1Pool: deposit over capacity");
            });
            it("Should fail if pool capacity already fullfilled", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(usdtInvestor).deposit(BigNumber.from("1000000").mul(BigNumber.from(10).pow(6)))).to.be.revertedWith("InvestorV1Pool: deposit over capacity");
            });
            it("Should fail if depositor approves proper amount of USDT", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)))).to.be.reverted;
            });
            it("Should update transfer USDT properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                expect(await USDT.balanceOf(pool.address)).to.be.equal(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                expect(await USDT.balanceOf(usdtInvestor.address)).to.be.equal(0);
            });
            it("Should update funded properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                expect(await pool.funded()).to.be.equal(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
            });
            it("Should update pooledAmt properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                expect(await pool.pooledAmt(usdtInvestor.address)).to.be.equal(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
            });
        });

        describe("#withdraw()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if pool not opened", async function() {
                await expect(pool.connect(usdtInvestor).withdraw(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not opened");
            });

            it("Should fail if withdraw before startTime", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await expect(pool.connect(usdtInvestor).withdraw(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: not started yet");
            });

            it("Should fail if withdraw more than deposited", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)));
                await expect(pool.connect(usdtInvestor).withdraw(BigNumber.from("10001").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: not enough deposit");
            });
            it("Should update transfer USDT properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)));
                await pool.connect(usdtInvestor).withdraw(BigNumber.from("8888").mul(BigNumber.from(10).pow(6)), anomaly.address);
                expect(await USDT.balanceOf(pool.address)).to.be.equal(BigNumber.from("1112").mul(BigNumber.from(10).pow(6)));
                expect(await USDT.balanceOf(anomaly.address)).to.be.equal(BigNumber.from("8888").mul(BigNumber.from(10).pow(6)));
            });
            it("Should update funded properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)));
                await pool.connect(usdtInvestor).withdraw(BigNumber.from("9999").mul(BigNumber.from(10).pow(6)), anomaly.address);
                expect(await pool.funded()).to.be.equal(BigNumber.from("1").mul(BigNumber.from(10).pow(6)));
            });
            it("Should update pooledAmt properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)));
                await pool.connect(usdtInvestor).withdraw(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                expect(await pool.pooledAmt(usdtInvestor.address)).to.be.equal(0);
            });
        });

        describe("#exit()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(usdtInvestor).exit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(usdtInvestor).exit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is reverted", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await expect(pool.connect(usdtInvestor).exit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not active");
            });

            it("Should fail if exit more than deposits", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await expect(pool.connect(usdtInvestor).exit(BigNumber.from("70001").mul(BigNumber.from(10).pow(6)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: not enough deposit");
            });

            it("Should update poolAmt properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                expect(await pool.pooledAmt(usdtInvestor.address)).to.be.equal(BigNumber.from("40000").mul(BigNumber.from(10).pow(6)));
            });
            it("Should update exited properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                expect(await pool.exited()).to.be.equal(BigNumber.from("60000").mul(BigNumber.from(10).pow(6)));
            });
            it("Should transfer HSF properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("1").mul(BigNumber.from(10).pow(6)), anomaly.address);
                expect(await HSF.balanceOf(anomaly.address)).to.be.equal(BigNumber.from("333333333333333333"));
                expect(await HSF.balanceOf(pool.address)).to.be.equal(BigNumber.from("33333000000666666666667"));
            });
        });

        describe("#restake()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)))).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)))).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is reverted", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await expect(pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)))).to.be.revertedWith("InvestorV1Pool: pool not active");
            });

            it("Should fail if there is no capacity", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await expect(pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)))).to.be.revertedWith("InvestorV1Pool: no capacity for restake");
            });

            it("Should update restakeAmt properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                expect(await pool.restakeAmt(hsfInvestor.address)).to.be.equal(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
            });

            it("Should update restaked properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                expect(await pool.restaked()).to.be.equal(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
            });

            it("Should transfer HSF properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                expect(await HSF.balanceOf(hsfInvestor.address)).to.be.equal(BigNumber.from("40000").mul(BigNumber.from(10).pow(18)));
                expect(await HSF.balanceOf(pool.address)).to.be.equal(BigNumber.from("33333333334").mul(BigNumber.from(10).pow(12)));
            });
        });

        describe("#unstake()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(hsfInvestor).unstake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(hsfInvestor).unstake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not active");
            });

            it("Should fail if unstake more than staked", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await expect(pool.connect(hsfInvestor).unstake(BigNumber.from("12000").mul(BigNumber.from(10).pow(18)), anomaly.address)).to.be.revertedWith("InvestorV1Pool: not enough restake");
            });

            it("Should update restakeAmt properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).unstake(BigNumber.from("1000").mul(BigNumber.from(10).pow(18)), anomaly.address);
                expect(await pool.restakeAmt(hsfInvestor.address)).to.be.equal(BigNumber.from("9000").mul(BigNumber.from(10).pow(18)));
            });

            it("Should update restaked properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).unstake(BigNumber.from("1000").mul(BigNumber.from(10).pow(18)), anomaly.address);
                expect(await pool.restaked()).to.be.equal(BigNumber.from("9000").mul(BigNumber.from(10).pow(18)));
            });

            it("Should transfer HSF properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(usdtInvestor).exit(BigNumber.from("30000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).unstake(BigNumber.from("1000").mul(BigNumber.from(10).pow(18)), hsfInvestor.address);
                expect(await HSF.balanceOf(hsfInvestor.address)).to.be.equal(BigNumber.from("41000").mul(BigNumber.from(10).pow(18)));
                expect(await HSF.balanceOf(pool.address)).to.be.equal(BigNumber.from("32333333334").mul(BigNumber.from(10).pow(12)));
            });
        });

        describe("#pullDeposit()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });
            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(hsfInvestor).pullDeposit()).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(operator).pullDeposit()).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(operator).pullDeposit()).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is reverted", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await expect(pool.connect(operator).pullDeposit()).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should transfer USDT properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).pullDeposit();
                expect(await USDT.balanceOf(operator.address)).to.be.equal(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)))
            });
        });

        describe("#liquidate()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(hsfInvestor).liquidate()).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(operator).liquidate()).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(operator).liquidate()).to.be.revertedWith("InvestorV1Pool: pool not active");
            });
            it("Should fail if poolState is reverted", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await expect(pool.connect(operator).liquidate()).to.be.revertedWith("InvestorV1Pool: pool not active");
            });

            it("Should fail if operator approve proper amount of USDT", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).pullDeposit();
                await expect(pool.connect(operator).liquidate()).to.be.reverted;
            });
            it("Should transfer proper amount of USDT", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(hsfInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(operator).liquidate();
                expect(await USDT.balanceOf(operator.address)).to.be.equal(BigNumber.from("71650").mul(BigNumber.from(10).pow(6)));
                expect(await USDT.balanceOf(pool.address)).to.be.equal(BigNumber.from("108350").mul(BigNumber.from(10).pow(6)));
            });
            it("Should transfer proper amount of USDT (no restake)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).liquidate();
                expect(await USDT.balanceOf(operator.address)).to.be.equal(BigNumber.from("104155").mul(BigNumber.from(10).pow(6)));
                expect(await USDT.balanceOf(pool.address)).to.be.equal(BigNumber.from("75845").mul(BigNumber.from(10).pow(6)));
            });
            it("Should do nothing when already balance fullfilled", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).pullDeposit();
                await pool.connect(operator).liquidate();
                expect(await USDT.balanceOf(operator.address)).to.be.equal(BigNumber.from("104155").mul(BigNumber.from(10).pow(6)));
                expect(await USDT.balanceOf(pool.address)).to.be.equal(BigNumber.from("75845").mul(BigNumber.from(10).pow(6)));
                await pool.connect(operator).liquidate();
                expect(await USDT.balanceOf(operator.address)).to.be.equal(BigNumber.from("104155").mul(BigNumber.from(10).pow(6)));
            });
        });

        describe("#claim()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(hsfInvestor).claim(anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(hsfInvestor).claim(anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if poolState is reverted", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await expect(pool.connect(hsfInvestor).claim(anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if poolState is active", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await expect(pool.connect(hsfInvestor).claim(anomaly.address)).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if there is no claim", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).pullDeposit();
                await pool.connect(operator).liquidate();
                await increaseTime(duration.hours(15));
                await expect(pool.connect(hsfInvestor).claim(anomaly.address)).to.be.revertedWith("InvestorV1Pool: no claim for you");
            });
            it("Should fail if already claimed", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hybridInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(hybridInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("1").mul(BigNumber.from(10).pow(6)));
                await pool.connect(hybridInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(hybridInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).restake(BigNumber.from("1").mul(BigNumber.from(10).pow(18)));
                await pool.connect(operator).pullDeposit();
                await pool.connect(operator).liquidate();
                await increaseTime(duration.hours(15));
                await pool.connect(hsfInvestor).claim(anomaly.address)
                await expect(pool.connect(hsfInvestor).claim(anomaly.address)).to.be.revertedWith("InvestorV1Pool: already claimed");
            });
            it("Should transfer USDT properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hybridInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(hybridInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("1").mul(BigNumber.from(10).pow(6)));
                await pool.connect(hybridInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(hybridInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).restake(BigNumber.from("1").mul(BigNumber.from(10).pow(18)));
                await pool.connect(operator).pullDeposit();
                await pool.connect(operator).liquidate();
                await increaseTime(duration.hours(15));
                await pool.connect(hsfInvestor).claim(hsfInvestor.address);
                await pool.connect(hybridInvestor).claim(hybridInvestor.address);
                await pool.connect(usdtInvestor).claim(usdtInvestor.address);
                expect(await USDT.balanceOf(hsfInvestor.address)).to.be.equal(BigNumber.from("3250066"));
                expect(await USDT.balanceOf(hybridInvestor.address)).to.be.equal(BigNumber.from("138345666433"));
                expect(await USDT.balanceOf(usdtInvestor.address)).to.be.equal(BigNumber.from("100000083500"));
            });
        });

        describe("#closePool()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(hsfInvestor).closePool()).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should fail if poolState is created", async function() {
                await expect(pool.connect(operator).closePool()).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if poolState is opened", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await expect(pool.connect(operator).closePool()).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if poolState is reverted", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await expect(pool.connect(operator).closePool()).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should fail if poolState is active", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await expect(pool.connect(operator).closePool()).to.be.revertedWith("InvestorV1Pool: pool not finalized");
            });
            it("Should transfer HSF properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hybridInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(hybridInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("1").mul(BigNumber.from(10).pow(6)));
                await pool.connect(hybridInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(hybridInvestor).exit(BigNumber.from("10000").mul(BigNumber.from(10).pow(6)), anomaly.address);
                await pool.connect(hybridInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).restake(BigNumber.from("1").mul(BigNumber.from(10).pow(18)));
                await pool.connect(operator).pullDeposit();
                await pool.connect(operator).liquidate();
                await increaseTime(duration.hours(15));
                await pool.connect(operator).closePool();
                expect(await HSF.balanceOf(operator.address)).to.be.equal(BigNumber.from("56667666666666666666667"));
            });

        });
        describe("#revertPool()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });

            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(hsfInvestor).revertPool()).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should fail if poolState is active", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await expect(pool.connect(operator).revertPool()).to.be.revertedWith("InvestorV1Pool: not revertable state");
            });
            it("Should transfer HSF properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(operator).revertPool();
                expect(await HSF.balanceOf(operator.address)).to.be.equal(BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
            });
        });

        describe("#getPoolState()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });
            it("Should get pool state properly (Created)", async function() {
                expect(await pool.getPoolState()).to.be.equal("Created");
            });
            it("Should get pool state properly (Opened)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(operator).update();
                expect(await pool.getPoolState()).to.be.equal("Opened");
            });
            it("Should get pool state properly (Active)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).update();
                expect(await pool.getPoolState()).to.be.equal("Active");
            });
            it("Should get pool state properly (Reverted)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(6));
                await pool.connect(operator).update();
                expect(await pool.getPoolState()).to.be.equal("Reverted");
            });
            it("Should get pool state properly (Liquidated)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hybridInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(hybridInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("1").mul(BigNumber.from(10).pow(6)));
                await pool.connect(hybridInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(hybridInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).restake(BigNumber.from("1").mul(BigNumber.from(10).pow(18)));
                await pool.connect(operator).pullDeposit();
                await pool.connect(operator).liquidate();
                await increaseTime(duration.hours(15));
                await pool.connect(operator).update();
                expect(await pool.getPoolState()).to.be.equal("Liquidated");
            });
            it("Should get pool state properly (Dishonored)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hybridInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(hybridInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await USDT.connect(owner).transfer(operator.address, BigNumber.from("110000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(hybridInvestor).approve(pool.address, constants.MaxUint256);
                await USDT.connect(operator).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("1").mul(BigNumber.from(10).pow(6)));
                await pool.connect(hybridInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(hybridInvestor).restake(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)));
                await pool.connect(hsfInvestor).restake(BigNumber.from("1").mul(BigNumber.from(10).pow(18)));
                await pool.connect(operator).pullDeposit();
                await increaseTime(duration.hours(15));
                await pool.connect(operator).update();
                expect(await pool.getPoolState()).to.be.equal("Dishonored");
            });
        });

        describe("#setOraclePrice()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
            });
            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(hsfInvestor).setOraclePrice(4)).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should set oracle price properly (decrease)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(operator).update();
                await pool.connect(operator).setOraclePrice(2);
                expect(await pool.oraclePrice()).to.be.equal(2);
                expect(await HSF.balanceOf(operator.address)).to.be.equal(BigNumber.from("0").mul(BigNumber.from(10).pow(18)));
            });
            it("Should set oracle price properly (increase)", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(owner).transfer(hsfInvestor.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await HSF.connect(hsfInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(operator).update();
                await pool.connect(operator).setOraclePrice(5);
                expect(await pool.oraclePrice()).to.be.equal(5);
                expect(await HSF.balanceOf(operator.address)).to.be.equal(BigNumber.from("30000").mul(BigNumber.from(10).pow(18)));
            });
        });

        describe("#rescue()", function() {
            beforeEach(async function () {
                pastTime = (await latestTime()).sub(await duration.hours(1));
                startTime = (await latestTime()).add(await duration.hours(1));
                stageTime = (await latestTime()).add(await duration.hours(5));
                endTime = (await latestTime()).add(await duration.hours(20));
    
                pool = await InvestorV1Factory.connect(owner).createPool(operator.address, "Hillstone Fund I", FUND_MAX, FUND_MIN, 3, startTime, stageTime, endTime, 150, 1000);
                const poolList = await InvestorV1Factory.poolList;
                pool = new ethers.Contract(await poolList(0), PoolFactory.interface, ethers.provider);
                await pool.connect(operator).setUSDT(USDT.address);
                await pool.connect(operator).setHSF(HSF.address);
                await SOMETOKEN.connect(owner).transfer(pool.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
            });
            it("Should fail if msg.sender is not operator", async function() {
                await expect(pool.connect(hsfInvestor).rescue(SOMETOKEN.address)).to.be.revertedWith("InvestorV1Pool: not operator");
            });
            it("Should fail if target is USDT", async function() {
                await expect(pool.connect(operator).rescue(USDT.address)).to.be.revertedWith("InvestorV1Pool: USDT and HSF cannot be rescued");
            });
            it("Should fail if target is HSF", async function() {
                await expect(pool.connect(operator).rescue(HSF.address)).to.be.revertedWith("InvestorV1Pool: USDT and HSF cannot be rescued");
            });
            it("Should transfer target token properly", async function() {
                await pool.connect(operator).rescue(SOMETOKEN.address);
                expect(await SOMETOKEN.balanceOf(operator.address)).to.be.equal(BigNumber.from("50000").mul(BigNumber.from(10).pow(6)));
            });
        });

        describe("#expectedRestakeRevenue()", function() {
            it("Should calculate restake revenue properly", async function() {
                await HSF.connect(owner).transfer(operator.address, BigNumber.from("50000").mul(BigNumber.from(10).pow(18)));
                await USDT.connect(owner).transfer(usdtInvestor.address, BigNumber.from("100000").mul(BigNumber.from(10).pow(6)));
                await HSF.connect(operator).approve(pool.address, constants.MaxUint256);
                await USDT.connect(usdtInvestor).approve(pool.address, constants.MaxUint256);
                await pool.connect(operator).openPool();
                await increaseTime(duration.hours(2));
                await pool.connect(usdtInvestor).deposit(BigNumber.from("70000").mul(BigNumber.from(10).pow(6)));
                await increaseTime(duration.hours(4));
                await pool.connect(operator).update();
                expect(await pool.expectedRestakeRevenue(BigNumber.from("10000").mul(BigNumber.from(10).pow(18)))).to.be.equal(BigNumber.from("32505000000"));
            });
        });
    });
});
