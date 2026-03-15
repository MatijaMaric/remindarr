import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Save Bun's native implementations before happy-dom overwrites them
const nativeFetch = globalThis.fetch;
const nativeRequest = globalThis.Request;
const nativeResponse = globalThis.Response;
const nativeHeaders = globalThis.Headers;
const nativeURL = globalThis.URL;
const nativeURLSearchParams = globalThis.URLSearchParams;
const nativeBlob = globalThis.Blob;
const nativeFormData = globalThis.FormData;
const nativeAbortController = globalThis.AbortController;
const nativeAbortSignal = globalThis.AbortSignal;
const nativeTextEncoder = globalThis.TextEncoder;
const nativeTextDecoder = globalThis.TextDecoder;
const nativeReadableStream = globalThis.ReadableStream;
const nativeWritableStream = globalThis.WritableStream;
const nativeTransformStream = globalThis.TransformStream;

// Register happy-dom globals for DOM testing
GlobalRegistrator.register();

// Restore Bun's native implementations that happy-dom overwrote
Object.defineProperty(globalThis, "fetch", { value: nativeFetch, writable: true, configurable: true });
Object.defineProperty(globalThis, "Request", { value: nativeRequest, writable: true, configurable: true });
Object.defineProperty(globalThis, "Response", { value: nativeResponse, writable: true, configurable: true });
Object.defineProperty(globalThis, "Headers", { value: nativeHeaders, writable: true, configurable: true });
Object.defineProperty(globalThis, "URL", { value: nativeURL, writable: true, configurable: true });
Object.defineProperty(globalThis, "URLSearchParams", { value: nativeURLSearchParams, writable: true, configurable: true });
Object.defineProperty(globalThis, "Blob", { value: nativeBlob, writable: true, configurable: true });
Object.defineProperty(globalThis, "FormData", { value: nativeFormData, writable: true, configurable: true });
Object.defineProperty(globalThis, "AbortController", { value: nativeAbortController, writable: true, configurable: true });
Object.defineProperty(globalThis, "AbortSignal", { value: nativeAbortSignal, writable: true, configurable: true });
Object.defineProperty(globalThis, "TextEncoder", { value: nativeTextEncoder, writable: true, configurable: true });
Object.defineProperty(globalThis, "TextDecoder", { value: nativeTextDecoder, writable: true, configurable: true });
Object.defineProperty(globalThis, "ReadableStream", { value: nativeReadableStream, writable: true, configurable: true });
Object.defineProperty(globalThis, "WritableStream", { value: nativeWritableStream, writable: true, configurable: true });
Object.defineProperty(globalThis, "TransformStream", { value: nativeTransformStream, writable: true, configurable: true });
