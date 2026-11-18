/** A report that cannot be rendered: each problem with the place in the text file where it was found. */
export class RenderError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join('; '));
  }
}
