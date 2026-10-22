import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";
import { parseUnits } from "viem";

// Local development: deploys the payroll contract plus mock USDC/USDT to a running `hardhat node`,
// funds the first Hardhat account as a treasury, and writes the addresses into web/.env.local.
async function main() {
  const [treasury] = await hre.viem.getWalletClients();
  const payroll = await hre.viem.deployContract("WagefoldPayroll");
  const usdc = await hre.viem.deployContract("MockStablecoin", ["USD Coin", "USDC"]);
  const usdt = await hre.viem.deployContract("MockStablecoin", ["Tether USD", "USDT"]);
  await usdc.write.mint([treasury.account.address, parseUnits("500000", 6)]);
  await usdt.write.mint([treasury.account.address, parseUnits("100000", 6)]);

  const values: Record<string, string> = {
    NEXT_PUBLIC_PAYROLL_ADDRESS_31337: payroll.address,
    NEXT_PUBLIC_USDC_ADDRESS_31337: usdc.address,
    NEXT_PUBLIC_USDT_ADDRESS_31337: usdt.address,
  };

  const envPath = path.resolve(__dirname, "../../web/.env.local");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const kept = existing.split("\n").filter((line) => line && !Object.keys(values).some((k) => line.startsWith(`${k}=`)));
  const next = [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)].join("\n") + "\n";
  fs.writeFileSync(envPath, next);

  console.log("Local chain ready (chain id 31337)");
  console.log(`  Treasury (Hardhat account #0): ${treasury.account.address}`);
  for (const [k, v] of Object.entries(values)) console.log(`  ${k}=${v}`);
  console.log(`  Wrote ${envPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
