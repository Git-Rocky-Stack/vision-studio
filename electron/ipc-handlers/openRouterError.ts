/**
 * Sanitize an unknown error value into a renderer-safe message string for
 * the OpenRouter IPC paths.
 *
 * The OpenRouter service in `electron/services/openRouter.ts` wraps API
 * failures with `createOpenRouterError`, which produces hand-authored
 * `Error` instances whose `.message` is a typed-extracted provider message
 * (rate limit, insufficient quota, etc.) -- safe to surface to the
 * renderer. Validation rejections (`new Error('Prompt cannot be empty.')`)
 * are also direct `Error` instances meant for the user.
 *
 * JS engine error subclasses (TypeError, ReferenceError, RangeError,
 * SyntaxError) generally indicate programming bugs and may include
 * internal paths or stack details in their messages -- those go behind
 * the generic fallback rather than leaking to the renderer.
 *
 * Custom subclasses are treated conservatively: fall back to the generic
 * message rather than risk leaking unexpected payload shapes.
 */
export function toOpenRouterRendererMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.constructor === Error) {
    return error.message;
  }
  return fallback;
}
