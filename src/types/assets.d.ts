// Asset imports — Expo bundles local images at build time.
declare module '*.png' {
  const source: string;
  export default source;
}
declare module '*.jpg' {
  const source: string;
  export default source;
}
declare module '*.jpeg' {
  const source: string;
  export default source;
}
declare module '*.svg' {
  const source: string;
  export default source;
}
