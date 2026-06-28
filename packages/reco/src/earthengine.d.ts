/**
 * Minimal ambient declaration for the untyped @google/earthengine client.
 * Only the surface we use is typed; everything else is `any` by design — the
 * EE API is a dynamic server-side expression builder.
 */
declare module "@google/earthengine" {
  const ee: any;
  export default ee;
}
