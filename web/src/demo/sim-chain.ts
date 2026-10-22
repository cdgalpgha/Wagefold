/**
 * A tiny in-browser blockchain for the artifact demo. It speaks enough EIP-1193 / JSON-RPC for wagmi
 * and viem, and executes the two contracts Wagefold uses (ERC-20 approve/transfer and
 * WagefoldPayroll.pay) with the same rules as the Solidity code: funds move only from the caller,
 * allowances are spent, and a run is all-or-nothing.
 */
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  getAddress,
  hexToString,
  keccak256,
  numberToHex,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { payrollAbi, MAX_PAYMENTS } from "@/lib/abi";
import { formatAmount } from "@/lib/money";
import { ask } from "./wallet-bus";

export const CHAIN_ID = 31337;
export const ADDRESSES = {
  payroll: getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3"),
  USDC: getAddress("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512"),
  USDT: getAddress("0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0"),
};
// Hardhat's public test key #0. It only exists inside this simulation.
const treasury = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
export const TREASURY = treasury.address;
const START = { USDC: 250_000_000_000n, USDT: 60_000_000_000n };

type Log = { address: Address; topics: Hex[]; data: Hex };
type Tx = { hash: Hex; from: Address; to: Address; data: Hex; block: number; status: "success" | "reverted"; logs: Log[] };
export type ChainState = {
  block: number;
  authorized: boolean;
  balances: Record<string, string>;
  allowances: Record<string, string>;
  txs: Record<string, Tx>;
};

export function freshChain(): ChainState {
  return {
    block: 1,
    authorized: false,
    balances: { [key(ADDRESSES.USDC, TREASURY)]: START.USDC.toString(), [key(ADDRESSES.USDT, TREASURY)]: START.USDT.toString() },
    allowances: {},
    txs: {},
  };
}

const key = (...parts: string[]) => parts.map((p) => p.toLowerCase()).join(":");
const symbolOf = (token: string) => (token.toLowerCase() === ADDRESSES.USDT.toLowerCase() ? "USDT" : "USDC");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Revert extends Error {}
function rpcError(code: number, message: string) {
  return Object.assign(new Error(message), { code });
}

export class SimChain {
  private listeners: Record<string, Set<(...args: unknown[]) => void>> = {};
  constructor(public state: ChainState, private persist: () => void) {}

  // EIP-1193 events ---------------------------------------------------------------------------
  on(event: string, fn: (...args: unknown[]) => void) {
    (this.listeners[event] ??= new Set()).add(fn);
  }
  removeListener(event: string, fn: (...args: unknown[]) => void) {
    this.listeners[event]?.delete(fn);
  }
  private emit(event: string, ...args: unknown[]) {
    this.listeners[event]?.forEach((fn) => fn(...args));
  }

  // Execution ---------------------------------------------------------------------------------
  balance(token: Address, owner: Address): bigint {
    return BigInt(this.state.balances[key(token, owner)] ?? "0");
  }

  /** Runs calls against a copy of the balances and only commits if every call succeeds. */
  private execute(from: Address, calls: { to: Address; data: Hex }[], commit: boolean): Log[] {
    const balances = { ...this.state.balances };
    const allowances = { ...this.state.allowances };
    const get = (m: Record<string, string>, k: string) => BigInt(m[k] ?? "0");
    const logs: Log[] = [];

    const transferFrom = (token: Address, owner: Address, to: Address, amount: bigint, spender: Address) => {
      const aKey = key(token, owner, spender);
      if (get(allowances, aKey) < amount) throw new Revert("ERC20InsufficientAllowance");
      if (get(balances, key(token, owner)) < amount) throw new Revert("ERC20InsufficientBalance");
      allowances[aKey] = (get(allowances, aKey) - amount).toString();
      balances[key(token, owner)] = (get(balances, key(token, owner)) - amount).toString();
      balances[key(token, to)] = (get(balances, key(token, to)) + amount).toString();
    };

    for (const call of calls) {
      const to = getAddress(call.to);
      if (to === ADDRESSES.USDC || to === ADDRESSES.USDT) {
        const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: call.data });
        if (functionName === "approve") {
          const [spender, amount] = args as [Address, bigint];
          allowances[key(to, from, spender)] = amount.toString();
        } else if (functionName === "transfer") {
          const [recipient, amount] = args as [Address, bigint];
          allowances[key(to, from, from)] = amount.toString();
          transferFrom(to, from, recipient, amount, from);
        } else throw new Revert(`Unsupported token call ${functionName}`);
      } else if (to === ADDRESSES.payroll) {
        const { args } = decodeFunctionData({ abi: payrollAbi, data: call.data });
        const [runId, payments] = args as [Hex, readonly { token: Address; to: Address; amount: bigint }[]];
        if (payments.length === 0) throw new Revert("NoPayments");
        if (payments.length > MAX_PAYMENTS) throw new Revert("TooManyPayments");
        payments.forEach((p, i) => {
          if (BigInt(p.to) === 0n) throw new Revert(`ZeroRecipient(${i})`);
          if (p.amount === 0n) throw new Revert(`ZeroAmount(${i})`);
          transferFrom(getAddress(p.token), from, getAddress(p.to), p.amount, ADDRESSES.payroll);
          logs.push({
            address: ADDRESSES.payroll,
            topics: encodeEventTopics({ abi: payrollAbi, eventName: "PaymentSent", args: { runId, token: p.token, to: p.to } }) as Hex[],
            data: encodeAbiParameters([{ type: "uint256" }], [p.amount]),
          });
        });
        logs.push({
          address: ADDRESSES.payroll,
          topics: encodeEventTopics({ abi: payrollAbi, eventName: "PayrollPaid", args: { payer: from, runId } }) as Hex[],
          data: encodeAbiParameters([{ type: "uint256" }], [BigInt(payments.length)]),
        });
      } else throw new Revert("No contract at that address");
    }

    if (commit) {
      this.state.balances = balances;
      this.state.allowances = allowances;
    }
    return logs;
  }

  private record(from: Address, calls: { to: Address; data: Hex }[]): Hex {
    const logs = this.execute(from, calls, true);
    this.state.block += 1;
    const hash = keccak256(stringToHex(`wagefold-demo-tx:${this.state.block}:${Date.now()}`));
    this.state.txs[hash] = { hash, from, to: calls.at(-1)!.to, data: calls.at(-1)!.data, block: this.state.block, status: "success", logs };
    this.persist();
    return hash;
  }

  // Human-readable summaries for the wallet prompt --------------------------------------------
  private describe(calls: { to: Address; data: Hex }[]) {
    return calls.map((c) => {
      const to = getAddress(c.to);
      if (to === ADDRESSES.payroll) {
        const { args } = decodeFunctionData({ abi: payrollAbi, data: c.data });
        const payments = (args as unknown as [Hex, readonly { token: Address; amount: bigint }[]])[1];
        const totals: Record<string, bigint> = {};
        for (const p of payments) totals[symbolOf(p.token)] = (totals[symbolOf(p.token)] ?? 0n) + p.amount;
        const sum = Object.entries(totals).map(([s, v]) => `${formatAmount(v)} ${s}`).join(" + ");
        return { label: `Pay ${payments.length} ${payments.length === 1 ? "person" : "people"}`, value: sum };
      }
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: c.data });
      if (functionName === "approve") {
        return { label: `Allow payroll contract to send ${symbolOf(to)}`, value: `${formatAmount((args as [Address, bigint])[1])} ${symbolOf(to)}` };
      }
      return { label: functionName, value: symbolOf(to) };
    });
  }

  // JSON-RPC ----------------------------------------------------------------------------------
  private receipt(tx: Tx) {
    const blockNumber = numberToHex(tx.block);
    const blockHash = keccak256(stringToHex(`block:${tx.block}`));
    return {
      transactionHash: tx.hash,
      transactionIndex: "0x0",
      blockHash,
      blockNumber,
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: "0x1406f4",
      gasUsed: "0x1406f4",
      effectiveGasPrice: "0x3b9aca00",
      contractAddress: null,
      logs: tx.logs.map((l, i) => ({
        ...l,
        blockHash,
        blockNumber,
        transactionHash: tx.hash,
        transactionIndex: "0x0",
        logIndex: numberToHex(i),
        removed: false,
      })),
      logsBloom: `0x${"0".repeat(512)}`,
      status: tx.status === "success" ? "0x1" : "0x0",
      type: "0x2",
    };
  }

  getReceipt(hash: string) {
    const tx = this.state.txs[hash.toLowerCase()] ?? this.state.txs[hash];
    return tx ? this.receipt(tx) : null;
  }

  private block(n: number) {
    return {
      number: numberToHex(n),
      hash: keccak256(stringToHex(`block:${n}`)),
      parentHash: keccak256(stringToHex(`block:${n - 1}`)),
      timestamp: numberToHex(Math.floor(Date.now() / 1000)),
      baseFeePerGas: "0x3b9aca00",
      gasLimit: "0x1c9c380",
      gasUsed: "0x0",
      miner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000",
      difficulty: "0x0",
      extraData: "0x",
      size: "0x0",
      transactions: [],
      uncles: [],
    };
  }

  request = async ({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> => {
    const p = params as any[];
    switch (method) {
      case "eth_chainId":
        return numberToHex(CHAIN_ID);
      case "net_version":
        return String(CHAIN_ID);
      case "eth_accounts":
        return this.state.authorized ? [TREASURY] : [];
      case "eth_requestAccounts":
      case "wallet_requestPermissions": {
        if (!this.state.authorized) {
          await ask({
            kind: "connect",
            title: "Connect to Wagefold?",
            lines: [{ label: "Account", value: `${TREASURY.slice(0, 6)}…${TREASURY.slice(-4)}` }],
            note: "Wagefold will see your address and balances. It can't move funds without your approval.",
            confirmLabel: "Connect",
          });
          this.state.authorized = true;
          this.persist();
          this.emit("accountsChanged", [TREASURY]);
        }
        return method === "eth_requestAccounts" ? [TREASURY] : [{ parentCapability: "eth_accounts" }];
      }
      case "wallet_revokePermissions":
        this.state.authorized = false;
        this.persist();
        this.emit("accountsChanged", []);
        return null;
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "eth_blockNumber":
        return numberToHex(this.state.block);
      case "eth_getBlockByNumber":
        return this.block(this.state.block);
      case "eth_gasPrice":
        return "0x3b9aca00";
      case "eth_maxPriorityFeePerGas":
        return "0x0";
      case "eth_feeHistory":
        return { oldestBlock: numberToHex(this.state.block), baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"], gasUsedRatio: [0.5], reward: [["0x0"]] };
      case "eth_getTransactionCount":
        return numberToHex(Object.keys(this.state.txs).length);
      case "eth_getBalance":
        return "0x8ac7230489e80000"; // 10 ETH for network fees
      case "eth_getCode": {
        const a = getAddress(p[0]);
        return a === ADDRESSES.payroll || a === ADDRESSES.USDC || a === ADDRESSES.USDT ? "0x01" : "0x";
      }
      case "eth_estimateGas":
        try {
          this.execute(getAddress(p[0].from ?? TREASURY), [{ to: p[0].to, data: p[0].data ?? p[0].input }], false);
        } catch (err) {
          throw rpcError(3, `execution reverted: ${(err as Error).message}`);
        }
        return "0x30d40";
      case "eth_call":
        return this.call(p[0]);
      case "personal_sign": {
        const message = p[0] as Hex;
        await ask({
          kind: "sign",
          title: "Signature request",
          lines: [{ label: "Message", value: safeText(message) }],
          note: "Signing proves this wallet is yours. It doesn't move funds or cost gas.",
          confirmLabel: "Sign",
        });
        return treasury.signMessage({ message: { raw: message } });
      }
      case "eth_sendTransaction": {
        const tx = p[0] as { from: Address; to: Address; data?: Hex; input?: Hex };
        const call = { to: getAddress(tx.to), data: (tx.data ?? tx.input)! };
        await this.confirm([call]);
        try {
          return this.record(getAddress(tx.from), [call]);
        } catch (err) {
          throw rpcError(-32000, `execution reverted: ${(err as Error).message}`);
        }
      }
      case "eth_getTransactionReceipt":
        return this.getReceipt(p[0]);
      case "eth_getTransactionByHash": {
        const tx = this.state.txs[p[0]];
        if (!tx) return null;
        return {
          hash: tx.hash, from: tx.from, to: tx.to, input: tx.data, value: "0x0", nonce: "0x0", gas: "0x1406f4",
          gasPrice: "0x3b9aca00", maxFeePerGas: "0x3b9aca00", maxPriorityFeePerGas: "0x0", type: "0x2",
          chainId: numberToHex(CHAIN_ID), blockHash: keccak256(stringToHex(`block:${tx.block}`)),
          blockNumber: numberToHex(tx.block), transactionIndex: "0x0", accessList: [], v: "0x0", r: "0x1", s: "0x1", yParity: "0x0",
        };
      }
      case "wallet_getCapabilities":
        return { [numberToHex(CHAIN_ID)]: { atomic: { status: "supported" } } };
      case "wallet_sendCalls": {
        const req = p[0] as { from?: Address; calls: { to: Address; data: Hex }[] };
        const calls = req.calls.map((c) => ({ to: getAddress(c.to), data: c.data }));
        await this.confirm(calls);
        try {
          return { id: this.record(getAddress(req.from ?? TREASURY), calls) };
        } catch (err) {
          throw rpcError(-32000, `execution reverted: ${(err as Error).message}`);
        }
      }
      case "wallet_getCallsStatus": {
        const r = this.getReceipt(p[0]);
        return { version: "2.0.0", id: p[0], chainId: numberToHex(CHAIN_ID), atomic: true, status: r ? 200 : 100, receipts: r ? [r] : [] };
      }
      default:
        throw rpcError(4200, `The demo wallet doesn't support ${method}.`);
    }
  };

  private async confirm(calls: { to: Address; data: Hex }[]) {
    const lines = this.describe(calls);
    await ask({
      kind: "transaction",
      title: calls.length > 1 ? `Confirm ${calls.length} actions in one go` : "Confirm transaction",
      lines: [...lines, { label: "Network fee", value: "≈ $0.02 (simulated)" }],
      note: "Demo network: nothing real is sent.",
      confirmLabel: "Confirm",
    });
    await sleep(900); // feel of a real block
  }

  private call(tx: { to: Address; data: Hex; from?: Address }): Hex {
    const to = getAddress(tx.to);
    if (to === ADDRESSES.USDC || to === ADDRESSES.USDT) {
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      const result =
        functionName === "balanceOf"
          ? this.balance(to, (args as [Address])[0])
          : functionName === "allowance"
            ? BigInt(this.state.allowances[key(to, ...(args as [Address, Address]))] ?? "0")
            : functionName === "decimals"
              ? 6
              : functionName === "symbol"
                ? symbolOf(to)
                : undefined;
      if (result === undefined) throw rpcError(-32000, `Unsupported call ${functionName}`);
      return encodeFunctionResult({ abi: erc20Abi, functionName: functionName as any, result: result as any });
    }
    if (to === ADDRESSES.payroll) {
      const { functionName } = decodeFunctionData({ abi: payrollAbi, data: tx.data });
      if (functionName === "MAX_PAYMENTS") return encodeFunctionResult({ abi: payrollAbi, functionName, result: BigInt(MAX_PAYMENTS) });
      try {
        this.execute(getAddress(tx.from ?? TREASURY), [{ to, data: tx.data }], false); // simulate pay()
      } catch (err) {
        throw rpcError(3, `execution reverted: ${(err as Error).message}`);
      }
      return "0x";
    }
    return "0x";
  }
}

function safeText(hex: Hex): string {
  try {
    return hexToString(hex);
  } catch {
    return hex;
  }
}
