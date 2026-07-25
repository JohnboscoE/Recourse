import { erc20Abi, formatUnits } from "viem";
import { recourseEscrowAbi, type ExecutionRecord, isTerminal } from "@recourse/shared";
import { config, USDC_BASE, USDC_DECIMALS } from "./config.js";
import { contractCall, transfer, getExecution } from "./keeperhub.js";

/** Poll a KeeperHub execution until it reaches a terminal state. */
export async function waitTerminal(
  executionId: string,
  { tries = 20, delayMs = 3000 } = {},
): Promise<ExecutionRecord> {
  for (let i = 0; i < tries; i++) {
    const rec = await getExecution(executionId);
    if (isTerminal(rec.status)) return rec;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`execution ${executionId} did not reach terminal state in time`);
}

/** Approve the escrow to pull `amountBase` USDC (base units) from the caller wallet. */
export async function approveUsdc(amountBase: bigint) {
  const { executionId } = await contractCall(
    USDC_BASE,
    "approve",
    [config.escrowAddress, amountBase.toString()],
    erc20Abi,
  );
  return waitTerminal(executionId);
}

/** Create a job on the escrow (locks payment, records the predicate). */
export async function createJob(args: {
  subject: string;
  minIncreaseBase: bigint;
  paymentBase: bigint;
  deadline: bigint;
}) {
  const { executionId } = await contractCall(
    config.escrowAddress,
    "createJob",
    [args.subject, args.minIncreaseBase.toString(), args.paymentBase.toString(), args.deadline.toString()],
    recourseEscrowAbi,
  );
  return waitTerminal(executionId);
}

/** Agent claims a job, recording the KeeperHub executionId of its work. */
export async function claim(jobId: bigint, executionRef: string) {
  const { executionId } = await contractCall(
    config.escrowAddress,
    "claim",
    [jobId.toString(), executionRef],
    recourseEscrowAbi,
  );
  return waitTerminal(executionId);
}

/** The agent's actual work: transfer USDC to the subject. Returns the exec record. */
export async function payToSubject(subject: string, amountBase: bigint): Promise<ExecutionRecord> {
  const human = formatUnits(amountBase, USDC_DECIMALS);
  const { executionId } = await transfer({ to: subject, amount: human, tokenAddress: USDC_BASE });
  return waitTerminal(executionId);
}
