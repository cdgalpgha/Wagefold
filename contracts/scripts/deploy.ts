import hre from "hardhat";

// Deploys WagefoldPayroll to the selected network. Requires DEPLOYER_PRIVATE_KEY in .env.
async function main() {
  const payroll = await hre.viem.deployContract("WagefoldPayroll");
  console.log(`WagefoldPayroll deployed on ${hre.network.name}: ${payroll.address}`);
  console.log(`Set NEXT_PUBLIC_PAYROLL_ADDRESS_${hre.network.config.chainId}=${payroll.address} in web/.env.local`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
