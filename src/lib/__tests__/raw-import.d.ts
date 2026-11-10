// Lets tests import a source file as raw text (Vite ?raw), e.g. for the
// BlockCard worklet-safety regression guard. No node:fs types needed.
declare module '*?raw' {
  const content: string;
  export default content;
}
