/**
 * Typed error thrown by the API client for non-OK responses, carrying the HTTP
 * status so callers can distinguish e.g. 404 from server/network failures.
 *
 * This class lives OUTSIDE `api.ts` because `frontend/src/test-utils/apiMock.ts`
 * replaces the ENTIRE `../api` module under test, which would shadow a class
 * exported from `api.ts` and break `instanceof ApiError` checks. Do not export
 * or re-export ApiError from `api.ts`.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
