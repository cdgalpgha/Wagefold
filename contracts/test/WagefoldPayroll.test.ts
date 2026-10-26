import assert from "node:assert/strict";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { getAddress, keccak256, parseUnits, toHex, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const usd = (n: string) => parseUnits(n, 6);
const RUN_ID = keccak256(toHex("run-2026-10"));

async function expectRevert(promise: Promise<unknown>, reason: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.match(String(err), new RegExp(reason));
    return true;
  });
}

async function deployFixture() {
  const [treasury, alice, bob, carol, attacker] = await hre.viem.getWalletClients();
  const payroll = await hre.viem.deployContract("WagefoldPayroll");
  const usdc = await hre.viem.deployContract("MockStablecoin", ["USD Coin", "USDC"]);
  const usdt = await hre.viem.deployContract("MockStablecoin", ["Tether USD", "USDT"]);
  await usdc.write.mint([treasury.account.address, usd("1000000")]);
  await usdt.write.mint([treasury.account.address, usd("1000000")]);
  const publicClient = await hre.viem.getPublicClient();
  return { payroll, usdc, usdt, treasury, alice, bob, carol, attacker, publicClient };
}

describe("WagefoldPayroll", () => {
  it("pays every recipient in mixed tokens in one transaction", async () => {
    const { payroll, usdc, usdt, treasury, alice, bob, carol, publicClient } = await loadFixture(deployFixture);
    await usdc.write.approve([payroll.address, usd("21500")]);
    await usdt.write.approve([payroll.address, usd("6900")]);

    const hash = await payroll.write.pay([
      RUN_ID,
      [
        { token: usdc.address, to: alice.account.address, amount: usd("9400") },
        { token: usdc.address, to: bob.account.address, amount: usd("12100") },
        { token: usdt.address, to: carol.account.address, amount: usd("6900") },
      ],
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    assert.equal(await usdc.read.balanceOf([alice.account.address]), usd("9400"));
    assert.equal(await usdc.read.balanceOf([bob.account.address]), usd("12100"));
    assert.equal(await usdt.read.balanceOf([carol.account.address]), usd("6900"));
    assert.equal(await usdc.read.balanceOf([treasury.account.address]), usd("978500"));
    assert.equal(await usdc.read.balanceOf([payroll.address]), 0n, "contract never holds funds");

    const [paid] = await payroll.getEvents.PayrollPaid({}, { fromBlock: receipt.blockNumber });
    assert.equal(paid.args.payer, getAddress(treasury.account.address));
    assert.equal(paid.args.runId, RUN_ID);
    assert.equal(paid.args.payments, 3n);

    const sent = await payroll.getEvents.PaymentSent({}, { fromBlock: receipt.blockNumber });
    assert.equal(sent.length, 3);
  });

  it("is all-or-nothing: one failing transfer reverts the whole run", async () => {
    const { payroll, usdc, alice, bob } = await loadFixture(deployFixture);
    // Approve less than the run needs, so the second transfer fails.
    await usdc.write.approve([payroll.address, usd("100")]);
    await expectRevert(
      payroll.write.pay([
        RUN_ID,
        [
          { token: usdc.address, to: alice.account.address, amount: usd("100") },
          { token: usdc.address, to: bob.account.address, amount: usd("1") },
        ],
      ]),
      "ERC20InsufficientAllowance",
    );
    assert.equal(await usdc.read.balanceOf([alice.account.address]), 0n, "first transfer rolled back");
  });

  it("only spends the caller's own funds, never another wallet's approval", async () => {
    const { payroll, usdc, treasury, attacker } = await loadFixture(deployFixture);
    await usdc.write.approve([payroll.address, usd("50000")]); // treasury approves the contract

    const asAttacker = await hre.viem.getContractAt("WagefoldPayroll", payroll.address, {
      client: { wallet: attacker },
    });
    // The attacker has no USDC and no allowance of their own, so this must fail.
    await expectRevert(
      asAttacker.write.pay([RUN_ID, [{ token: usdc.address, to: attacker.account.address, amount: usd("50000") }]]),
      "ERC20InsufficientAllowance",
    );
    assert.equal(await usdc.read.balanceOf([treasury.account.address]), usd("1000000"));
  });

  it("rejects empty runs, zero recipients and zero amounts", async () => {
    const { payroll, usdc, alice } = await loadFixture(deployFixture);
    await usdc.write.approve([payroll.address, usd("10")]);

    await expectRevert(payroll.write.pay([RUN_ID, []]), "NoPayments");
    await expectRevert(
      payroll.write.pay([RUN_ID, [{ token: usdc.address, to: zeroAddress, amount: usd("1") }]]),
      "ZeroRecipient",
    );
    await expectRevert(
      payroll.write.pay([RUN_ID, [{ token: usdc.address, to: alice.account.address, amount: 0n }]]),
      "ZeroAmount",
    );
  });

  it("caps a run at MAX_PAYMENTS", async () => {
    const { payroll, usdc, alice } = await loadFixture(deployFixture);
    const max = await payroll.read.MAX_PAYMENTS();
    const tooMany = Array.from({ length: Number(max) + 1 }, () => ({
      token: usdc.address,
      to: alice.account.address,
      amount: 1n,
    }));
    await expectRevert(payroll.write.pay([RUN_ID, tooMany]), "TooManyPayments");
  });

  it("pays 100 people in one transaction within a sane gas budget", async () => {
    const { payroll, usdc, publicClient } = await loadFixture(deployFixture);
    const wallets = await hre.viem.getWalletClients();
    const recipients = Array.from({ length: 100 }, (_, i) => wallets[i % wallets.length].account.address);
    await usdc.write.approve([payroll.address, usd("100000")]);
    const hash = await payroll.write.pay([
      RUN_ID,
      recipients.map((to) => ({ token: usdc.address, to, amount: usd("1000") })),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    assert.ok(receipt.gasUsed < 5_000_000n, `gas used ${receipt.gasUsed}`);
    console.log(`      100 payments used ${receipt.gasUsed} gas`);
  });

  it("uses less gas than paying the same 100 people with separate transfers", async () => {
    const { payroll, usdc, publicClient } = await loadFixture(deployFixture);
    // Fresh recipients for each approach, so every transfer writes to a new balance slot in both cases.
    const fresh = () => Array.from({ length: 100 }, () => privateKeyToAccount(generatePrivateKey()).address);

    let separate = 0n;
    for (const to of fresh()) {
      const hash = await usdc.write.transfer([to, usd("1000")]);
      separate += (await publicClient.waitForTransactionReceipt({ hash })).gasUsed;
    }

    await usdc.write.approve([payroll.address, usd("100000")]);
    const hash = await payroll.write.pay([RUN_ID, fresh().map((to) => ({ token: usdc.address, to, amount: usd("1000") }))]);
    const batched = (await publicClient.waitForTransactionReceipt({ hash })).gasUsed;

    console.log(`      100 separate transfers: ${separate} gas · one Wagefold run: ${batched} gas`);
    assert.ok(batched < separate, "one run must beat separate transfers");
  });
  it("pays a run once per treasury: a retry or replay reverts", async () => {
    const { payroll, usdc, treasury, alice, publicClient } = await loadFixture(deployFixture);
    await usdc.write.approve([payroll.address, usd("200")]);
    const run = [{ token: usdc.address, to: alice.account.address, amount: usd("100") }];
    const hash = await payroll.write.pay([RUN_ID, run]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(await payroll.read.paidBlock([treasury.account.address, RUN_ID]), receipt.blockNumber);
    await expectRevert(payroll.write.pay([RUN_ID, run]), "AlreadyPaid");
    assert.equal(await usdc.read.balanceOf([alice.account.address]), usd("100"), "paid exactly once");
  });

  it("doesn't let someone else block a run by paying its id first", async () => {
    const { payroll, usdc, treasury, alice, attacker } = await loadFixture(deployFixture);
    await usdc.write.mint([attacker.account.address, usd("1")]);
    await usdc.write.approve([payroll.address, usd("1")], { account: attacker.account });
    await payroll.write.pay([RUN_ID, [{ token: usdc.address, to: attacker.account.address, amount: usd("1") }]], { account: attacker.account });
    await usdc.write.approve([payroll.address, usd("100")]);
    await payroll.write.pay([RUN_ID, [{ token: usdc.address, to: alice.account.address, amount: usd("100") }]]);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), usd("100"));
    assert.ok((await payroll.read.paidBlock([treasury.account.address, RUN_ID])) > 0n);
  });
});
