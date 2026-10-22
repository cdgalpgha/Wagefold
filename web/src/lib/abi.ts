// ABI for contracts/contracts/WagefoldPayroll.sol
export const payrollAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "runId", type: "bytes32" },
      {
        name: "payments",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "MAX_PAYMENTS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "PayrollPaid",
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "runId", type: "bytes32", indexed: true },
      { name: "payments", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentSent",
    inputs: [
      { name: "runId", type: "bytes32", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const MAX_PAYMENTS = 500;
