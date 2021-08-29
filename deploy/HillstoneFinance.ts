import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BigNumber } from "ethers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;

    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();
    const HILLSTONE_OPERATION = "0x5EB6D55809E52f85fb642a84D2F6D530f79c3e5e";
    const HILLSTONE_OPERATION_FUND = BigNumber.from(5000000).mul(BigNumber.from(10).pow(18));
    const HILLSTONE_COMMITTEE = "0x0789E14935Eb742Dd95d0989728CE64f0F97B7F8";
    const HILLSTONE_COMMITTEE_FUND = BigNumber.from(3000000).mul(BigNumber.from(10).pow(18));
    const HILLSTONE_TEAM = "0x531994a404cAFAbA3100e299E4b9DC476F2047Bd";
    const HILLSTONE_TEAM_FUND = BigNumber.from(5000000).mul(BigNumber.from(10).pow(18));
    const HSF_ADDR = "0xba6b0dbb2ba8daa8f5d6817946393aef8d3a4487";
    /*
    await deploy('HillstoneFinance', {
        from: deployer,
        log: true,
    });
    */

    /*
    // OPERATION 2021-08-19 ~ 2023-04-19
    await deploy('TokenVesting', {
        from: deployer,
        log: true,
        args: [HSF_ADDR, HILLSTONE_OPERATION, HILLSTONE_OPERATION_FUND, 1629298800, 1629298800, 1681830000]
    });
    // COMMITEE 2023-08-19 ~ 2026-02-19
    await deploy('TokenVesting', {
        from: deployer,
        log: true,
        args: [HSF_ADDR, HILLSTONE_COMMITTEE, HILLSTONE_COMMITTEE_FUND, 1692370800, 1692370800, 1771426800]
    });
    // TEAM 2023-08-19 ~ 2025-04-19
    await deploy('TokenVesting', {
        from: deployer,
        log: true,
        args: [HSF_ADDR, HILLSTONE_TEAM, HILLSTONE_TEAM_FUND, 1692370800, 1692370800, 1744988400]
    });
    */

    /*
    await deploy('TetherToken', {
        from: deployer,
        log: true,
        args: [BigNumber.from("30000000000000000"), "Tether USD", "USDT", 6]
    });
    */

    await deploy('InvestorV1Factory', {
        from: deployer,
        log: true
    });
};
export default func;
func.tags = ['Hillstone.Finance'];