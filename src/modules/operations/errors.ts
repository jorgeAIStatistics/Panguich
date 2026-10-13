export type OperationsErrorCode =
  | "not_found"
  /** The step is not available from the exception's current stage. */
  | "invalid_transition"
  | "invalid_input"
  /** What was on screen is no longer what is stored; the person must look again. */
  | "changed_since_viewed"
  /** Sample records and real records are never mixed. */
  | "sample_real_mix";

/** A rule of the Operations module said no. Permission refusals use PermissionError instead. */
export class OperationsError extends Error {
  readonly code: OperationsErrorCode;
  constructor(code: OperationsErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OperationsError";
    this.code = code;
  }
}
