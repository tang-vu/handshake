export class APIError extends Error {
  public httpStatus: number;
  public code: number;
  public reason: string;

  constructor(httpStatus: number, code: number, reason: string, message: string) {
    super(`croo: ${reason} (code=${code}, http=${httpStatus}): ${message}`);
    this.name = 'APIError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.reason = reason;
  }
}

export class InsufficientBalanceError extends Error {
  public token: string;
  public required: bigint;
  public balance: bigint;

  constructor(token: string, required: bigint, balance: bigint) {
    super(
      `croo: insufficient balance for token ${token}: required ${required.toString()}, available ${balance.toString()}`
    );
    this.name = 'InsufficientBalanceError';
    this.token = token;
    this.required = required;
    this.balance = balance;
  }
}

export function isNotFound(err: unknown): err is APIError {
  return err instanceof APIError && err.reason.endsWith('_NOT_FOUND');
}

export function isUnauthorized(err: unknown): err is APIError {
  return (
    err instanceof APIError &&
    ['SDK_KEY_INVALID', 'SDK_KEY_MISSING', 'AUTH_FAIL', 'NOT_LOGIN'].includes(err.reason)
  );
}

export function isInvalidParams(err: unknown): err is APIError {
  return err instanceof APIError && err.reason === 'INVALID_PARAMETERS';
}

export function isInvalidStatus(err: unknown): err is APIError {
  return (
    err instanceof APIError &&
    ['INVALID_STATUS', 'INVALID_AGENT_STATUS'].includes(err.reason)
  );
}

export function isForbidden(err: unknown): err is APIError {
  return err instanceof APIError && err.reason === 'FORBIDDEN';
}

export function isInsufficientBalance(err: unknown): err is InsufficientBalanceError {
  return err instanceof InsufficientBalanceError;
}
