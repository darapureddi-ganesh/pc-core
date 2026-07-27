export type ServiceErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

/** A domain error carrying an HTTP-mappable code. Shared by all services. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: ServiceErrorCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
